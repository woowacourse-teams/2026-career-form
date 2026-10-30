package com.careerform.evaluation.api;

import java.net.InetAddress;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import jakarta.validation.Validator;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import com.careerform.evaluation.dataset.DatasetLoader;
import com.careerform.evaluation.prompt.PromptCatalog;
import com.careerform.evaluation.run.CallExecutor;
import com.careerform.evaluation.run.EvaluationSettings;
import com.careerform.evaluation.run.EvaluationWorker;
import com.careerform.evaluation.run.MongoResultStore;
import com.careerform.evaluation.run.MongoRunStore;
import com.careerform.evaluation.run.MongoScoringStore;
import com.careerform.evaluation.run.RescoringService;
import com.careerform.evaluation.run.ResultStore;
import com.careerform.evaluation.run.RunService;
import com.careerform.evaluation.run.RunStore;
import com.careerform.evaluation.run.ScoringStore;
import com.careerform.evaluation.run.ServiceProductCallGateway;
import com.careerform.formanalysis.application.FieldInteractionPolicy;
import com.careerform.formanalysis.application.FormAnalysisRouter;
import com.careerform.formanalysis.application.InteractionDecisionService;
import com.careerform.formanalysis.application.PromptSource;
import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.generic.JevCategoryFieldResolver;
import com.careerform.formanalysis.generic.SectionClassificationService;
import tools.jackson.databind.json.JsonMapper;

/**
 * 모델 평가 조립. career-form.evaluation.enabled=true일 때만 뜬다. 사용자 요청과 동시 호출 상한을 나눠 쓰므로
 * development 서버에서만 켠다. 실행 API는 품질 확인 비밀번호(career-form.quality)가 설정돼야 열린다.
 */
@Configuration(proxyBeanMethods = false)
@EnableScheduling
@ConditionalOnProperty(prefix = "career-form.evaluation", name = "enabled", havingValue = "true")
public class EvaluationConfiguration {

    @Bean
    EvaluationSettings evaluationSettings(
        @Value("${career-form.evaluation.max-model-calls-per-run:500}") int maxModelCalls,
        @Value("${career-form.evaluation.max-repetitions:20}") int maxRepetitions,
        @Value("${career-form.analysis.provider:jev}") String provider,
        @Value("${career-form.analysis.jev.model:jev-latest}") String model,
        @Value("${career-form.evaluation.code-version:${career-form.quality.version:UNKNOWN}}") String codeVersion,
        @Value("${career-form.analysis.jev.field-batch-size:5}") int batch,
        @Value("${career-form.analysis.jev.section-concurrency:3}") int concurrency,
        @Value("${career-form.analysis.jev.max-concurrent:10}") int maxConcurrent,
        @Value("${career-form.analysis.jev.timeout-ms:8000}") int timeoutMs,
        @Value("${career-form.analysis.jev.rate-limit-retries:2}") int retries) {
        return new EvaluationSettings(maxModelCalls, maxRepetitions, provider, model, codeVersion,
            Map.of("field-batch-size", batch, "section-concurrency", concurrency, "max-concurrent", maxConcurrent,
                "timeout-ms", timeoutMs, "rate-limit-retries", retries));
    }

    @Bean
    RunStore evaluationRunStore(MongoTemplate mongo) {
        return new MongoRunStore(mongo);
    }

    @Bean
    ResultStore evaluationResultStore(MongoTemplate mongo) {
        return new MongoResultStore(mongo);
    }

    @Bean
    ScoringStore evaluationScoringStore(MongoTemplate mongo) {
        return new MongoScoringStore(mongo);
    }

    @Bean
    DatasetLoader evaluationDatasets() {
        return new DatasetLoader(DatasetLoader.classpath(EvaluationConfiguration.class.getClassLoader()));
    }

    @Bean
    PromptCatalog evaluationPromptCatalog() {
        return new PromptCatalog();
    }

    @Bean
    RunService evaluationRunService(RunStore runs, DatasetLoader datasets, PromptCatalog prompts,
        List<PromptSource> promptSources, EvaluationSettings settings) {
        return new RunService(runs, datasets, prompts, promptSources, settings, Clock.systemUTC());
    }

    @Bean
    RescoringService evaluationRescoringService(RunStore runs, ResultStore results, ScoringStore scorings,
        DatasetLoader datasets) {
        return new RescoringService(runs, results, scorings, datasets::load, Clock.systemUTC());
    }

    @Bean
    CallExecutor evaluationCallExecutor(JsonMapper mapper, Validator validator,
        SectionClassificationService classification, InteractionDecisionService interactions,
        Optional<JevCategoryFieldResolver> resolver, FormAnalysisRouter router,
        FieldInteractionPolicy interactionPolicy, SupportedProfileFields fields) {
        return new CallExecutor(new ServiceProductCallGateway(mapper, validator, classification, interactions,
            resolver, router, interactionPolicy, fields));
    }

    @Bean
    EvaluationWorker evaluationWorker(RunStore runs, ResultStore results, DatasetLoader datasets,
        CallExecutor executor, PromptCatalog prompts, List<PromptSource> promptSources, EvaluationSettings settings,
        @Value("${career-form.evaluation.lease:5m}") Duration lease) {
        return new EvaluationWorker(runs, results, datasets, executor, prompts, promptSources,
            settings.maxModelCallsPerRun(), Clock.systemUTC(), workerId(), lease);
    }

    @Bean
    EvaluationSchedule evaluationSchedule(EvaluationWorker worker) {
        return new EvaluationSchedule(worker);
    }

    private static String workerId() {
        try {
            return InetAddress.getLocalHost().getHostName() + "-" + UUID.randomUUID();
        }
        catch (java.io.IOException exception) {
            return "worker-" + UUID.randomUUID();
        }
    }

    /**
     * 주기마다 처리할 실행이 있는지 보고 전용 스레드 하나에서 실행한다. 공용 스케줄러 스레드를 오래 잡지 않으며
     * 한 번에 실행 하나만 처리한다.
     */
    static final class EvaluationSchedule implements AutoCloseable {
        private final EvaluationWorker worker;
        private final ExecutorService executor = Executors.newSingleThreadExecutor(
            Thread.ofPlatform().name("evaluation-worker").daemon(true).factory());
        private final AtomicBoolean busy = new AtomicBoolean();

        EvaluationSchedule(EvaluationWorker worker) {
            this.worker = worker;
        }

        @Scheduled(fixedDelayString = "${career-form.evaluation.poll-interval:10s}")
        void poll() {
            if (busy.compareAndSet(false, true)) {
                executor.submit(() -> {
                    try {
                        while (worker.runOnce()) {
                            // 대기 중 실행이 남아 있으면 이어서 처리한다.
                        }
                    }
                    finally {
                        busy.set(false);
                    }
                });
            }
        }

        @Override
        public void close() {
            executor.shutdownNow();
        }
    }
}
