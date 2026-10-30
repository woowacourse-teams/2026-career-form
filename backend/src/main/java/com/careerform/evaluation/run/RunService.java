package com.careerform.evaluation.run;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
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
    public static final String SCORING_VERSION = "call-unit-item-exact-v1";
    static final Map<String, int[]> OVERRIDABLE = Map.of(
        "field-batch-size", new int[] {1, 128},
        "section-concurrency", new int[] {1, 16});
    private static final Pattern PROMPT_VERSION = Pattern.compile("[A-Za-z0-9._-]{1,32}");

    private final RunStore store;
    private final DatasetCatalog datasets;
    private final PromptCatalog prompts;
    private final List<? extends PromptSource> promptSources;
    private final EvaluationSettings settings;
    private final Clock clock;

    public RunService(RunStore store, DatasetCatalog datasets, PromptCatalog prompts,
        List<? extends PromptSource> promptSources, EvaluationSettings settings, Clock clock) {
        this.store = store;
        this.datasets = datasets;
        this.prompts = prompts;
        this.promptSources = List.copyOf(promptSources);
        this.settings = settings;
        this.clock = clock;
    }

    public EvaluationRun register(RunRequest request, String requestedBy) {
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
        SortedMap<String, String> effective = effectiveSettings(request.overrides());
        long estimated = (long) split.recordedModelCalls() * request.repetitions();
        if (estimated > settings.maxModelCallsPerRun()) {
            throw new RunRejected(RunRejected.Code.BUDGET_EXCEEDED);
        }
        PromptSnapshot snapshot = prompts.snapshot(promptSources);
        RunVersions versions = new RunVersions(dataset.datasetId(), dataset.version(), dataset.digest(),
            request.split(), snapshot.digest(), request.promptVersion(), settings.codeVersion(),
            settings.provider(), settings.model(), SCORING_VERSION, effective);
        String fingerprint = fingerprint(versions, request.repetitions());
        EvaluationRun run = EvaluationRun.queued(UUID.randomUUID().toString(), fingerprint, versions,
            request.repetitions(), split.productCalls() * request.repetitions(), (int) estimated, requestedBy,
            clock.instant());
        store.savePromptSnapshotIfAbsent(snapshot);
        RunStore.Registration registration = store.register(run);
        if (registration.registered() == null) {
            EvaluationRun active = registration.activeRun();
            throw new RunRejected(RunRejected.Code.RUN_ACTIVE, active.id(), active.fingerprint().equals(fingerprint));
        }
        return registration.registered();
    }

    public EvaluationRun cancel(String runId) {
        EvaluationRun run = find(runId);
        boolean cancelled = run.status() == RunStatus.QUEUED
            && store.transition(runId, RunStatus.QUEUED, RunStatus.CANCELLED, clock.instant());
        if (!cancelled) {
            // 대기 중 취소와 작업자 시작이 겹치면 실행 중 취소 요청으로 넘긴다.
            store.requestCancel(runId);
        }
        return find(runId);
    }

    public EvaluationRun find(String runId) {
        return store.find(runId).orElseThrow(() -> new RunRejected(RunRejected.Code.UNKNOWN_RUN));
    }

    private SortedMap<String, String> effectiveSettings(Map<String, Integer> overrides) {
        SortedMap<String, String> effective = new TreeMap<>();
        settings.baseSettings().forEach((key, value) -> effective.put(key, String.valueOf(value)));
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
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(text.toString().getBytes(StandardCharsets.UTF_8));
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
