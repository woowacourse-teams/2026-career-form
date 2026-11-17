package com.careerform.profileimport;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;

import com.careerform.monitoring.ExternalCallMetrics;
import com.careerform.monitoring.ExternalCallObserver;
import com.careerform.monitoring.tracing.LangSmithTraceRecorder;

/**
 * 이력서 글자를 받아 프로필 초안을 만든다. 원문과 추출 값은 저장하지 않고 요청이 끝나면 버린다.
 * 요청마다 비식별 구조 값(입력 글자 수, 범주별 추출 건수, 버린 키·값 수, 모델, 소요 시간, 결과 코드)을
 * PROFILE_IMPORT_RESULT 로그 한 줄과 LangSmith run(openai.PROFILE_IMPORT) 하나로 남긴다.
 * traceValues는 로컬과 스테이징의 품질 확인용이며 켜졌을 때만 LangSmith run에 입력 글자와 추출 값을 더한다.
 * 애플리케이션 로그에는 어떤 설정에서도 원문과 추출 값을 쓰지 않는다.
 */
final class ProfileImportService {
    private static final Logger log = LoggerFactory.getLogger(ProfileImportService.class);
    static final String STAGE = "PROFILE_IMPORT";
    static final String OPERATION = "profile-import";

    enum Result { OK, EMPTY_INPUT, TOO_LONG, INVALID_INPUT, RATE_LIMITED, NOT_CONFIGURED, LLM_FAILED }

    record Outcome(Result result, Map<String, Object> profile) {
        @Override public String toString() { return "Outcome[" + result + ", redacted]"; }
    }

    private final ResumeExtractionModel model;
    private final ProfileDraftSchema schema;
    private final int maxChars;
    private final String modelName;
    private final ExternalCallMetrics metrics;
    private final LangSmithTraceRecorder traces;
    private final boolean traceValues;

    ProfileImportService(ResumeExtractionModel model, ProfileDraftSchema schema, int maxChars, String modelName,
                         ExternalCallMetrics metrics, LangSmithTraceRecorder traces, boolean traceValues) {
        if (maxChars < 1) throw new IllegalStateException("Invalid profile import length limit");
        this.model = model;
        this.schema = schema;
        this.maxChars = maxChars;
        this.modelName = modelName == null || modelName.isBlank() ? "UNKNOWN" : modelName;
        this.metrics = metrics;
        this.traces = traces;
        this.traceValues = traceValues;
    }

    boolean tracesValues() {
        return traceValues;
    }

    int maxChars() {
        return maxChars;
    }

    static int inputChars(String text) {
        return text == null ? 0 : text.strip().length();
    }

    Outcome importResume(String raw) {
        long started = System.nanoTime();
        String text = raw == null ? "" : raw.strip();
        var observation = new Observation(text, started);
        if (text.isEmpty()) return observation.finish(Result.EMPTY_INPUT);
        if (text.length() > maxChars) return observation.finish(Result.TOO_LONG);
        if (model == null) return observation.finish(Result.NOT_CONFIGURED);
        ResumeExtractionModel.Completion completion;
        long called = System.nanoTime();
        try {
            completion = model.extract(text);
        } catch (ResumeExtractionModel.ExtractionFailed failure) {
            recordCall(called, failure, null);
            return observation.failed(failure.failure(), failure.status(), failure.usage());
        }
        if (!schema.isDraftShape(completion.draft())) {
            recordCall(called, new ResumeExtractionModel.ExtractionFailed(
                ResumeExtractionModel.Failure.INVALID_RESPONSE, 200, completion.usage()), completion.observedModel());
            return observation.failed(ResumeExtractionModel.Failure.INVALID_RESPONSE, 200, completion.usage());
        }
        recordCall(called, null, completion.observedModel());
        var draft = schema.validate(completion.draft(), text);
        return observation.succeeded(draft, completion.usage());
    }

    /** 컨트롤러가 서비스에 넘기기 전에 거절한 요청(요청 제한, 읽을 수 없는 본문)도 같은 로그 한 줄을 남긴다. */
    void rejected(Result result, int inputChars) {
        logLine(result, inputChars, zeroCounts(), 0, 0, System.nanoTime(), "NONE", null);
    }

    private void recordCall(long started, ResumeExtractionModel.ExtractionFailed failure, String observedModel) {
        if (metrics == null) return;
        metrics.record("openai", OPERATION, System.nanoTime() - started, failure != null,
            failure != null && failure.failure() == ResumeExtractionModel.Failure.TIMEOUT,
            new ExternalCallObserver.Context(true, ExternalCallMetrics.modelVersion(observedModel)));
    }

    private final class Observation {
        private final int inputChars;
        private final long started;
        private final LangSmithTraceRecorder.Trace trace;

        private Observation(String text, long started) {
            this.inputChars = text.length();
            this.started = started;
            if (traces == null) {
                this.trace = null;
                return;
            }
            Map<String, Object> inputs = new LinkedHashMap<>();
            inputs.put("inputChars", inputChars);
            inputs.put("maxChars", maxChars);
            if (traceValues && !text.isEmpty() && inputChars <= maxChars) inputs.put("text", text);
            this.trace = traces.begin("openai", STAGE, modelName, inputs);
        }

        Outcome finish(Result result) {
            complete(result, zeroCounts(), 0, 0, result.name(), null, Map.of(), null, null);
            return new Outcome(result, null);
        }

        Outcome failed(ResumeExtractionModel.Failure failure, Integer status, Map<String, Number> usage) {
            complete(Result.LLM_FAILED, zeroCounts(), 0, 0, failure.name(), status, usage, failure.name(), null);
            return new Outcome(Result.LLM_FAILED, null);
        }

        Outcome succeeded(ProfileDraftSchema.Draft draft, Map<String, Number> usage) {
            complete(Result.OK, draft.counts(), draft.droppedKeys(), draft.droppedValues(), null, 200, usage, null,
                draft.profile());
            return new Outcome(Result.OK, draft.profile());
        }

        private void complete(Result result, Map<String, Integer> counts, int droppedKeys, int droppedValues,
                              String error, Integer status, Map<String, Number> usage, String failure,
                              Map<String, Object> profile) {
            logLine(result, inputChars, counts, droppedKeys, droppedValues, started,
                failure == null ? "NONE" : failure, failure == null ? null : status);
            if (traces == null || trace == null) return;
            Map<String, Object> outputs = new LinkedHashMap<>();
            outputs.put("result", result.name());
            outputs.put("extracted", Map.copyOf(counts));
            outputs.put("droppedKeys", droppedKeys);
            outputs.put("droppedValues", droppedValues);
            outputs.put("model", modelName);
            if (failure != null) outputs.put("failure", failure);
            outputs.put("valuesIncluded", traceValues);
            if (traceValues && profile != null) outputs.put("profile", profile);
            traces.complete(trace, outputs, usage, error, status);
        }
    }

    private void logLine(Result result, int inputChars, Map<String, Integer> counts, int droppedKeys,
                         int droppedValues, long started, String failure, Integer llmStatus) {
        var groups = new StringBuilder();
        for (var category : ProfileDraftSchema.categoryIds()) {
            groups.append(category).append('=').append(counts.getOrDefault(category, 0)).append(' ');
        }
        log.info("PROFILE_IMPORT_RESULT result={} inputChars={} {}droppedKeys={} droppedValues={} model={} "
                + "durationMs={} failure={} llmStatus={} requestId={}",
            result, inputChars, groups, droppedKeys, droppedValues, modelName,
            TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started), failure,
            llmStatus == null ? "NONE" : llmStatus, MDC.get("requestId"));
    }

    private static Map<String, Integer> zeroCounts() {
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (var category : ProfileDraftSchema.categoryIds()) counts.put(category, 0);
        return counts;
    }
}
