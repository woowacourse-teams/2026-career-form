package com.careerform.evaluation.run;

import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 새 코드가 배포되면 평가를 한 번 자동으로 돌린다(개발서버에서 머지마다 변경별 결과를 남기는 용도).
 * 서버가 뜬 뒤 이 코드 버전으로 돌린 같은 데이터셋 평가가 없으면 공급자마다 기본 모델로 비교 하나를 등록한다.
 * 코드 버전을 모르거나(UNKNOWN), 꺼져 있거나, 다른 평가가 진행 중이면 등록하지 않는다. 비용이 드는 실제 모델 호출이다.
 */
public final class EvaluationAutoRun {

    private static final Logger log = LoggerFactory.getLogger(EvaluationAutoRun.class);
    private static final String REQUESTER = "auto-deploy";
    private static final int MAX_TARGETS = 5;

    /** {@code name}은 실행 이름(영문·숫자·.-_ 32자 이하)이다. */
    public record Settings(boolean enabled, String datasetId, int datasetVersion, int repetitions, String name) {
    }

    private final RunService runs;
    private final RunStore store;
    private final EvaluationProviders providers;
    private final Settings settings;
    private final String codeVersion;

    public EvaluationAutoRun(RunService runs, RunStore store, EvaluationProviders providers, Settings settings,
        String codeVersion) {
        this.runs = runs;
        this.store = store;
        this.providers = providers;
        this.settings = settings;
        this.codeVersion = codeVersion;
    }

    /** 등록했으면 true. */
    public boolean runIfNewCode() {
        if (!settings.enabled() || codeVersion == null || codeVersion.isBlank() || "UNKNOWN".equals(codeVersion)) {
            return false;
        }
        boolean measured = store.recent(200).stream().map(EvaluationRun::versions).anyMatch(versions ->
            codeVersion.equals(versions.codeVersion()) && settings.datasetId().equals(versions.datasetId())
                && settings.datasetVersion() == versions.datasetVersion());
        if (measured) {
            return false;
        }
        List<RunRequest.Target> targets = providers.all().stream().limit(MAX_TARGETS)
            .map(provider -> new RunRequest.Target(provider.name(), null)).toList();
        try {
            RunService.Registered registered = runs.registerAll(new RunRequest(settings.datasetId(),
                settings.datasetVersion(), "all", settings.repetitions(), settings.name(), Map.of(), null, null, targets),
                REQUESTER);
            log.info("EVALUATION_AUTO_RUN_REGISTERED code={} comparison={} runs={}", codeVersion,
                registered.comparisonId(), registered.runs().size());
            return true;
        }
        catch (RunRejected rejected) {
            log.info("EVALUATION_AUTO_RUN_SKIPPED code={} reason={}", codeVersion, rejected.code());
            return false;
        }
    }
}
