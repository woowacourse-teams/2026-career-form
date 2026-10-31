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
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import com.careerform.evaluation.dataset.DatasetLoader;
import com.careerform.evaluation.prompt.PromptCatalog;
import com.careerform.evaluation.run.CallExecutor;
import com.careerform.evaluation.run.EvaluationProviders;
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
import com.careerform.formanalysis.application.InteractionObservationProjector;
import com.careerform.formanalysis.application.PromptSource;
import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.generic.ChoiceFieldResolver;
import com.careerform.formanalysis.application.port.ChoiceModel;
import com.careerform.formanalysis.generic.ChoiceInteractionDecisions;
import com.careerform.formanalysis.generic.ChoiceSectionClassifier;
import com.careerform.formanalysis.generic.SectionCategories;
import com.careerform.formanalysis.infrastructure.adapter.jev.JevChoiceModel;
import com.careerform.formanalysis.infrastructure.adapter.openai.OpenAiChoiceModel;
import tools.jackson.databind.json.JsonMapper;

/**
 * 모델 평가 조립. career-form.evaluation.enabled=true일 때만 뜬다. 사용자 요청과 동시 호출 상한을 나눠 쓰므로
 * development 서버에서만 켠다. 실행 API는 품질 확인 비밀번호(career-form.quality)가 설정돼야 열린다.
 */
@Configuration(proxyBeanMethods = false)
@EnableScheduling
@ConditionalOnProtectedEvaluation
public class EvaluationConfiguration {

    /** 공통 질문 문구(섹션 분류, 필드 매핑, 버튼·선택지 결정)만 내놓는 자리표시 모델. 호출하면 실패한다. */
    static final ChoiceModel PROMPT_ONLY = new ChoiceModel() {
        @Override public String provider() { return "prompt-only"; }
        @Override public String model() { return "prompt-only"; }
        @Override public Map<String, Judgement> answer(Object state, Map<String, Question> questions) {
            throw new IllegalStateException("프롬프트 조각 전용 모델은 호출할 수 없습니다");
        }
        @Override public Map<String, String> choose(Object state, Map<String, Question> questions) {
            throw new IllegalStateException("프롬프트 조각 전용 모델은 호출할 수 없습니다");
        }
    };

    @Bean
    EvaluationSettings evaluationSettings(
        @Value("${career-form.evaluation.max-model-calls-per-run:500}") int maxModelCalls,
        @Value("${career-form.evaluation.max-repetitions:20}") int maxRepetitions,
        @Value("${career-form.evaluation.code-version:${career-form.quality.version:UNKNOWN}}") String codeVersion,
        @Value("${career-form.analysis.jev.field-batch-size:5}") int batch,
        @Value("${career-form.analysis.jev.section-concurrency:3}") int concurrency,
        @Value("${career-form.analysis.jev.max-concurrent:10}") int maxConcurrent) {
        return new EvaluationSettings(maxModelCalls, maxRepetitions, codeVersion,
            Map.of("field-batch-size", batch, "section-concurrency", concurrency, "max-concurrent", maxConcurrent));
    }

    /**
     * 평가에서 고를 수 있는 공급자. JEV는 제품 JEV 연결이 있을 때, OpenAI는 평가 전용 설정을 켜고 키가 있을 때만
     * 등록한다. 첫 항목이 기본 공급자다. 새 공급자는 선택 모델 구현과 여기 항목 하나로 추가한다.
     */
    @Bean
    EvaluationProviders evaluationProviders(Optional<JevChoiceModel> jev,
        @Value("${career-form.analysis.jev.timeout-ms:8000}") int jevTimeoutMs,
        @Value("${career-form.analysis.jev.rate-limit-retries:2}") int jevRetries,
        @Value("${career-form.evaluation.openai.enabled:false}") boolean openAiEnabled,
        @Value("${career-form.evaluation.openai.api-key:}") String openAiKey,
        @Value("${career-form.evaluation.openai.models:gpt-6-luna}") List<String> openAiModels,
        @Value("${career-form.evaluation.openai.reasoning-effort:none}") String reasoningEffort,
        @Value("${career-form.evaluation.openai.timeout-ms:30000}") int openAiTimeoutMs,
        @Value("${career-form.evaluation.openai.min-confidence:${career-form.analysis.jev.min-confidence:0.8}}") double openAiMinConfidence,
        @Value("${career-form.evaluation.openai.rate-limit-retries:2}") int openAiRetries) {
        List<EvaluationProviders.Provider> providers = new java.util.ArrayList<>();
        jev.ifPresent(model -> providers.add(new EvaluationProviders.Provider("jev", List.of(model.model()),
            Map.of("timeout-ms", String.valueOf(jevTimeoutMs), "rate-limit-retries", String.valueOf(jevRetries)),
            List.of(), ignored -> model)));
        if (openAiEnabled && !openAiKey.isBlank()) {
            OpenAiChoiceModel base = new OpenAiChoiceModel(OpenAiChoiceModel.http(openAiKey, openAiTimeoutMs),
                openAiModels.getFirst(), reasoningEffort, openAiMinConfidence, openAiRetries,
                delay -> Thread.sleep(delay));
            providers.add(new EvaluationProviders.Provider("openai", openAiModels,
                Map.of("reasoning-effort", reasoningEffort, "timeout-ms", String.valueOf(openAiTimeoutMs),
                    "min-confidence", String.valueOf(openAiMinConfidence),
                    "rate-limit-retries", String.valueOf(openAiRetries)),
                List.of(base), base::withModel));
        }
        return new EvaluationProviders(providers);
    }

    /** 공급자와 무관한 공통 질문 문구. 제품 bean과 같은 클래스의 문구다. */
    @Bean
    EvaluationPromptSources evaluationPromptSources(SupportedProfileFields fields, SectionCategories categories,
        @Value("${career-form.analysis.jev.max-concurrent:10}") int maxConcurrent) {
        return new EvaluationPromptSources(List.of(new ChoiceSectionClassifier(PROMPT_ONLY, categories),
            new ChoiceFieldResolver(PROMPT_ONLY, fields, categories, 1, 1, maxConcurrent, 0),
            new ChoiceInteractionDecisions(PROMPT_ONLY)));
    }

    record EvaluationPromptSources(List<PromptSource> sources) {
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
    DatasetLoader.ResourceSource evaluationResources() {
        return DatasetLoader.classpath(EvaluationConfiguration.class.getClassLoader());
    }

    @Bean
    DatasetLoader evaluationDatasets(DatasetLoader.ResourceSource resources) {
        return new DatasetLoader(resources);
    }

    @Bean
    PromptCatalog evaluationPromptCatalog() {
        return new PromptCatalog();
    }

    @Bean
    RunService evaluationRunService(RunStore runs, DatasetLoader datasets, PromptCatalog prompts,
        EvaluationPromptSources promptSources, EvaluationProviders providers, EvaluationSettings settings) {
        return new RunService(runs, datasets, prompts, promptSources.sources(), providers, settings,
            Clock.systemUTC());
    }

    @Bean
    RescoringService evaluationRescoringService(RunStore runs, ResultStore results, ScoringStore scorings,
        DatasetLoader datasets) {
        return new RescoringService(runs, results, scorings, datasets::load, Clock.systemUTC());
    }

    @Bean
    CallExecutor evaluationCallExecutor(JsonMapper mapper, Validator validator, EvaluationProviders providers,
        ServiceProductCallGateway.ProductParts parts) {
        return new CallExecutor(new ServiceProductCallGateway(mapper, validator, providers, parts));
    }

    @Bean
    ServiceProductCallGateway.ProductParts evaluationProductParts(FormAnalysisRouter router,
        SectionCategories categories, InteractionObservationProjector projector,
        FieldInteractionPolicy interactionPolicy, SupportedProfileFields fields, Optional<ChoiceFieldResolver> resolver,
        @Value("${career-form.analysis.jev.max-concurrent:10}") int maxConcurrent,
        @Value("${career-form.analysis.jev.timeout-ms:8000}") long permitTimeoutMs) {
        return new ServiceProductCallGateway.ProductParts(router, categories, projector, interactionPolicy, fields,
            (model, concurrency, batch) -> resolver
                .map(product -> product.withModel(model, concurrency, batch))
                .orElseGet(() -> new ChoiceFieldResolver(model, fields, categories, concurrency, batch,
                    maxConcurrent, permitTimeoutMs)));
    }

    @Bean
    EvaluationWorker evaluationWorker(RunStore runs, ResultStore results, DatasetLoader datasets,
        CallExecutor executor, PromptCatalog prompts, EvaluationPromptSources promptSources,
        EvaluationProviders providers, EvaluationSettings settings,
        @Value("${career-form.evaluation.lease:5m}") Duration lease) {
        return new EvaluationWorker(runs, results, datasets, executor, prompts, promptSources.sources(), providers,
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
