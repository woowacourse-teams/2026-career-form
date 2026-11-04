package com.careerform.evaluation.run;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.SortedMap;
import java.util.TreeMap;
import java.util.UUID;
import java.util.regex.Pattern;
import com.careerform.evaluation.prompt.PromptCatalog;
import com.careerform.evaluation.prompt.PromptSnapshot;
import com.careerform.formanalysis.application.PromptSource;

/**
 * 실행을 검증해 QUEUED로 등록하고 취소를 처리한다. 등록 때 그 시점 프롬프트 전문을 해시로 저장한다.
 * 모델을 호출하지 않으며 실행은 별도 작업자가 한다.
 */
public final class RunService {

    /** 채점식(D1, D2)을 바꾸면 이 값을 올린다. */
    public static final String SCORING_VERSION = "item-weighted-exact-v2";
    static final Map<String, int[]> OVERRIDABLE = Map.of(
        "field-batch-size", new int[] {1, 128},
        "section-concurrency", new int[] {1, 16});
    private static final Pattern PROMPT_VERSION = Pattern.compile("[A-Za-z0-9._-]{1,32}");

    private final RunStore store;
    private final DatasetCatalog datasets;
    private final PromptCatalog prompts;
    private final List<? extends PromptSource> promptSources;
    private final EvaluationProviders providers;
    private final EvaluationSettings settings;
    private final Clock clock;

    /** {@code promptSources}는 공급자와 무관한 공통 질문 문구다. 공급자 문구는 {@code providers}에 있다. */
    public RunService(RunStore store, DatasetCatalog datasets, PromptCatalog prompts,
        List<? extends PromptSource> promptSources, EvaluationProviders providers, EvaluationSettings settings,
        Clock clock) {
        this.store = store;
        this.datasets = datasets;
        this.prompts = prompts;
        this.promptSources = List.copyOf(promptSources);
        this.providers = providers;
        this.settings = settings;
        this.clock = clock;
    }

    /** 공통 질문 문구와 그 공급자의 문구를 합친 프롬프트 출처. 등록과 작업자 검사가 같은 목록을 쓴다. */
    static List<PromptSource> promptSources(List<? extends PromptSource> common, EvaluationProviders.Provider provider) {
        List<PromptSource> sources = new java.util.ArrayList<>(common);
        sources.addAll(provider.promptSources());
        return List.copyOf(sources);
    }

    /** 비교할 수 있는 모델 수 상한. */
    static final int MAX_TARGETS = 5;

    /** 등록한 실행. 비교 등록이면 {@code comparisonId}가 있고 실행은 대상 순서다. */
    public record Registered(String comparisonId, List<EvaluationRun> runs) {
        public Registered {
            runs = List.copyOf(runs);
        }
    }

    /** 한 모델 실행을 등록한다. {@code targets}가 있으면 {@link #registerAll}을 쓴다. */
    public EvaluationRun register(RunRequest request, String requestedBy) {
        return registerAll(request, requestedBy).runs().getFirst();
    }

    /**
     * 실행을 등록한다. {@code targets}가 있으면 대상마다 같은 조건의 실행을 만들어 한 비교로 등록하고, 첫 실행만
     * 바로 대기열(QUEUED)에 넣는다. 나머지는 앞 실행이 끝나면 차례로 돈다. 하나라도 검증에 실패하면 아무것도 등록하지 않는다.
     */
    public Registered registerAll(RunRequest request, String requestedBy) {
        return registerAll(request, requestedBy, Map.of());
    }

    /** {@code inputs}는 자동 평가가 다음 배포와 비교하려고 실행에 남기는 입력 지문이다. */
    public Registered registerAll(RunRequest request, String requestedBy, Map<String, String> inputs) {
        DatasetCatalog.DatasetSummary dataset = datasets.find(request.datasetId(), request.datasetVersion())
            .orElseThrow(() -> new RunRejected(RunRejected.Code.UNKNOWN_DATASET));
        DatasetCatalog.SplitSummary split = dataset.splits().get(request.split());
        if (split == null) {
            throw new RunRejected(RunRejected.Code.UNKNOWN_SPLIT);
        }
        if (request.repetitions() < 1 || request.repetitions() > settings.maxRepetitions()) {
            throw new RunRejected(RunRejected.Code.INVALID_REPETITIONS);
        }
        if (request.promptVersion() != null && !PROMPT_VERSION.matcher(request.promptVersion()).matches()) {
            throw new RunRejected(RunRejected.Code.INVALID_PROMPT_VERSION);
        }
        List<RunRequest.Target> targets = request.targets() == null
            ? List.of(new RunRequest.Target(request.provider(), request.model())) : request.targets();
        if (targets.isEmpty() || targets.size() > MAX_TARGETS) {
            throw new RunRejected(RunRejected.Code.INVALID_TARGETS);
        }
        long estimated = (long) split.recordedModelCalls() * request.repetitions();
        if (estimated > settings.maxModelCallsPerRun()) {
            throw new RunRejected(RunRejected.Code.BUDGET_EXCEEDED);
        }
        String comparisonId = request.targets() == null ? null : UUID.randomUUID().toString();
        List<EvaluationRun> planned = new ArrayList<>();
        List<PromptSnapshot> snapshots = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (RunRequest.Target target : targets) {
            EvaluationProviders.Provider provider = (target.provider() == null
                ? providers.defaultProvider() : providers.find(target.provider()))
                .orElseThrow(() -> new RunRejected(RunRejected.Code.UNKNOWN_PROVIDER));
            String model = target.model() == null ? provider.defaultModel() : target.model();
            if (!provider.models().contains(model)) {
                throw new RunRejected(RunRejected.Code.UNKNOWN_MODEL);
            }
            if (!seen.add(provider.name() + "/" + model)) {
                throw new RunRejected(RunRejected.Code.INVALID_TARGETS);
            }
            PromptSnapshot snapshot = prompts.snapshot(promptSources(promptSources, provider));
            RunVersions versions = new RunVersions(dataset.datasetId(), dataset.version(), dataset.digest(),
                request.split(), snapshot.digest(), request.promptVersion(), settings.codeVersion(),
                provider.name(), model, SCORING_VERSION, effectiveSettings(provider, request.overrides()), inputs);
            planned.add(EvaluationRun.queued(UUID.randomUUID().toString(), fingerprint(versions, request.repetitions()),
                versions, request.repetitions(), split.productCalls() * request.repetitions(), (int) estimated,
                requestedBy, clock.instant()).inComparison(comparisonId));
            snapshots.add(snapshot);
        }
        snapshots.forEach(store::savePromptSnapshotIfAbsent);
        RunStore.Registration registration = comparisonId == null
            ? store.register(planned.getFirst()) : store.registerComparison(planned);
        if (registration.registered() == null) {
            EvaluationRun active = registration.activeRun();
            throw new RunRejected(RunRejected.Code.RUN_ACTIVE, active.id(),
                active.fingerprint().equals(planned.getFirst().fingerprint()));
        }
        return new Registered(comparisonId, comparisonId == null ? List.of(registration.registered())
            : store.comparison(comparisonId));
    }

    /** 실행을 취소한다. 비교 실행이면 같은 비교의 끝나지 않은 실행도 모두 취소한다. */
    public EvaluationRun cancel(String runId) {
        EvaluationRun run = find(runId);
        List<EvaluationRun> related = run.comparisonId() == null ? List.of(run) : store.comparison(run.comparisonId());
        for (EvaluationRun target : related) {
            cancelOne(target);
        }
        return find(runId);
    }

    private void cancelOne(EvaluationRun run) {
        if (run.status() == RunStatus.WAITING
            && store.transition(run.id(), RunStatus.WAITING, RunStatus.CANCELLED, clock.instant())) {
            return;
        }
        boolean cancelled = run.status() == RunStatus.QUEUED
            && store.transition(run.id(), RunStatus.QUEUED, RunStatus.CANCELLED, clock.instant());
        if (!cancelled) {
            // 대기 중 취소와 작업자 시작이 겹치면 실행 중 취소 요청으로 넘긴다.
            store.requestCancel(run.id());
        }
    }

    public EvaluationRun find(String runId) {
        return store.find(runId).orElseThrow(() -> new RunRejected(RunRejected.Code.UNKNOWN_RUN));
    }

    /** 모든 공급자의 프롬프트 지문. 공통 문구나 공급자 문구가 바뀌면 달라진다. */
    public String promptDigest() {
        StringBuilder text = new StringBuilder();
        providersByName().forEach(provider -> {
            append(text, provider.name());
            append(text, prompts.snapshot(promptSources(promptSources, provider)).digest());
        });
        return sha256(text.toString());
    }

    /** 모든 공급자의 기본 모델과 결과에 영향을 주는 설정의 지문. */
    public String settingsDigest() {
        StringBuilder text = new StringBuilder();
        providersByName().forEach(provider -> {
            append(text, provider.name());
            append(text, provider.defaultModel());
            effectiveSettings(provider, Map.of()).forEach((key, value) -> {
                append(text, key);
                append(text, value);
            });
        });
        return sha256(text.toString());
    }

    private List<EvaluationProviders.Provider> providersByName() {
        return providers.all().stream().sorted(java.util.Comparator.comparing(EvaluationProviders.Provider::name)).toList();
    }

    private SortedMap<String, String> effectiveSettings(EvaluationProviders.Provider provider,
        Map<String, Integer> overrides) {
        SortedMap<String, String> effective = new TreeMap<>();
        settings.baseSettings().forEach((key, value) -> effective.put(key, String.valueOf(value)));
        effective.putAll(provider.settings());
        overrides.forEach((key, value) -> {
            int[] range = OVERRIDABLE.get(key);
            if (range == null || value == null || value < range[0] || value > range[1]) {
                throw new RunRejected(RunRejected.Code.INVALID_OVERRIDE);
            }
            effective.put(key, String.valueOf(value));
        });
        return effective;
    }

    private static String fingerprint(RunVersions versions, int repetitions) {
        StringBuilder text = new StringBuilder();
        append(text, versions.datasetId());
        append(text, String.valueOf(versions.datasetVersion()));
        append(text, versions.datasetDigest());
        append(text, versions.split());
        append(text, versions.promptDigest());
        append(text, versions.codeVersion());
        append(text, versions.provider());
        append(text, versions.model());
        append(text, versions.scoringVersion());
        versions.settings().forEach((key, value) -> {
            append(text, key);
            append(text, value);
        });
        append(text, String.valueOf(repetitions));
        return sha256(text.toString());
    }

    private static String sha256(String text) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        }
        catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static void append(StringBuilder text, String value) {
        String safe = value == null ? "" : value;
        text.append(safe.length()).append(':').append(safe);
    }
}
