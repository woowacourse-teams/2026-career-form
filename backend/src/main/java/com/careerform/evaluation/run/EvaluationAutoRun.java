package com.careerform.evaluation.run;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 평가 결과에 영향을 주는 입력이 바뀐 채 배포되면 평가를 한 번 자동으로 돌린다. 입력은 동작 지문(가짜 모델로 뽑은 AI 질문과
 * 응답), 프롬프트, 설정, 공급자 연결 코드, 데이터셋이다. 지난 자동 평가의 입력과 같으면(변수명 변경 등) 돌리지 않고, 다르면
 * 공급자마다 기본 모델로 비교 하나를 등록하며 이름은 바뀐 입력과 커밋으로 짓는다. 코드 버전을 모르거나, 꺼져 있거나, 다른 평가가
 * 진행 중이면 등록하지 않는다. 비용이 드는 실제 모델 호출이다.
 */
public final class EvaluationAutoRun {

    public static final String BEHAVIOR = "behavior";
    public static final String PROMPT = "prompt";
    public static final String SETTINGS = "settings";
    public static final String PROVIDER = "provider";
    public static final String DATASET = "dataset";

    private static final Logger log = LoggerFactory.getLogger(EvaluationAutoRun.class);
    private static final String REQUESTER = "auto-deploy";
    private static final int MAX_TARGETS = 5;
    private static final int MAX_NAME = 32;

    public record Settings(boolean enabled, String datasetId, int datasetVersion, int repetitions) {
    }

    private final RunService runs;
    private final RunStore store;
    private final EvaluationProviders providers;
    private final Settings settings;
    private final String codeVersion;
    private final Supplier<Map<String, String>> inputs;

    public EvaluationAutoRun(RunService runs, RunStore store, EvaluationProviders providers, Settings settings,
        String codeVersion, Supplier<Map<String, String>> inputs) {
        this.runs = runs;
        this.store = store;
        this.providers = providers;
        this.settings = settings;
        this.codeVersion = codeVersion;
        this.inputs = inputs;
    }

    /** 등록했으면 true. */
    public boolean runIfChanged() {
        if (!settings.enabled() || codeVersion == null || codeVersion.isBlank() || "UNKNOWN".equals(codeVersion)) {
            return false;
        }
        Map<String, String> current = inputs.get();
        Map<String, String> previous = store.recent(200).stream().map(EvaluationRun::versions)
            .filter(versions -> settings.datasetId().equals(versions.datasetId()) && !versions.inputs().isEmpty())
            .map(RunVersions::inputs).findFirst().orElse(null);
        if (current.equals(previous)) {
            log.info("EVALUATION_AUTO_RUN_UNCHANGED code={}", codeVersion);
            return false;
        }
        List<RunRequest.Target> targets = providers.all().stream().limit(MAX_TARGETS)
            .map(provider -> new RunRequest.Target(provider.name(), null)).toList();
        String name = name(previous, current, codeVersion);
        try {
            RunService.Registered registered = runs.registerAll(new RunRequest(settings.datasetId(),
                settings.datasetVersion(), "all", settings.repetitions(), name, Map.of(), null, null, targets),
                REQUESTER, current);
            log.info("EVALUATION_AUTO_RUN_REGISTERED code={} name={} comparison={} runs={}", codeVersion, name,
                registered.comparisonId(), registered.runs().size());
            return true;
        }
        catch (RunRejected rejected) {
            log.info("EVALUATION_AUTO_RUN_SKIPPED code={} reason={}", codeVersion, rejected.code());
            return false;
        }
    }

    /**
     * 실행 이름. 바뀐 입력과 커밋 앞 7자로 짓는다(예: prompt-391fbd8). 프롬프트·설정·데이터셋이 바뀌면 동작 지문도 따라
     * 바뀌므로, 호출 구조(call)는 그 셋이 그대로인데 동작 지문만 바뀌었을 때만 쓴다. 지난 기록이 없으면 first, 서버 이름 규칙(32자)을
     * 넘으면 multi다.
     */
    static String name(Map<String, String> previous, Map<String, String> current, String codeVersion) {
        String code = shortCode(codeVersion);
        if (previous == null) {
            return "first-" + code;
        }
        boolean prompt = differs(previous, current, PROMPT);
        boolean config = differs(previous, current, SETTINGS);
        boolean dataset = differs(previous, current, DATASET);
        List<String> parts = new ArrayList<>();
        if (prompt) {
            parts.add(PROMPT);
        }
        else if (!config && !dataset && differs(previous, current, BEHAVIOR)) {
            parts.add("call");
        }
        if (config) {
            parts.add(SETTINGS);
        }
        if (differs(previous, current, PROVIDER)) {
            parts.add(PROVIDER);
        }
        if (dataset) {
            parts.add(DATASET);
        }
        String name = String.join("-", parts) + "-" + code;
        return name.length() > MAX_NAME ? "multi-" + code : name;
    }

    private static boolean differs(Map<String, String> previous, Map<String, String> current, String key) {
        return !Objects.equals(previous.get(key), current.get(key));
    }

    private static String shortCode(String codeVersion) {
        int digest = codeVersion.indexOf("sha256:");
        String code = (digest >= 0 ? codeVersion.substring(digest + "sha256:".length()) : codeVersion)
            .replaceAll("[^A-Za-z0-9._-]", "");
        return code.substring(0, Math.min(7, code.length()));
    }
}
