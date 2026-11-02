package com.careerform.evaluation.run;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import com.careerform.evaluation.dataset.CaseCall;
import com.careerform.evaluation.scoring.AutofillCounts;
import com.careerform.evaluation.scoring.CallKind;
import com.careerform.evaluation.scoring.CallResult;
import com.careerform.evaluation.scoring.CallScorer;
import com.careerform.evaluation.scoring.FailureKind;
import com.careerform.evaluation.scoring.ObservedItem;
import com.careerform.monitoring.ModelCallRecording;
import com.careerform.monitoring.ModelCallRecording.Attempt;
import com.careerform.monitoring.ModelCallRecording.Outcome;
import tools.jackson.databind.JsonNode;

/**
 * 저장한 호출 하나를 제품 서비스로 실행하고 모델 시도를 기록한 뒤 정답과 비교한다.
 * 모델 시도가 있었는데 하나도 성공하지 못했으면 응답 내용과 무관하게 실패로 센다.
 * 제품 서비스는 공급자 오류를 기권으로 감싸 돌려주기 때문이다.
 */
public final class CallExecutor {

    private static final Logger log = LoggerFactory.getLogger(CallExecutor.class);
    private final ProductCallGateway gateway;
    private final CallScorer scorer = new CallScorer();

    public CallExecutor(ProductCallGateway gateway) {
        this.gateway = gateway;
    }

    public ExecutedCall execute(CaseCall call, CallTarget target) {
        List<Attempt> attempts = Collections.synchronizedList(new ArrayList<>());
        long started = System.nanoTime();
        JsonNode response;
        try {
            response = ModelCallRecording.within(attempts::add,
                () -> gateway.call(call.kind(), call.request(), target));
        }
        catch (RuntimeException exception) {
            log.warn("EVALUATION_PRODUCT_CALL_FAILED kind={} reason={}", call.kind(),
                exception.getClass().getSimpleName());
            return failed(call, FailureKind.API_ERROR, System.nanoTime() - started, attempts);
        }
        long elapsed = System.nanoTime() - started;
        List<Attempt> recorded = List.copyOf(attempts);
        FailureKind attemptFailure = attemptFailure(recorded);
        if (attemptFailure != null) {
            return failed(call, attemptFailure, elapsed, recorded);
        }
        if (!"COMPLETE".equals(response.path("status").asString())) {
            return failed(call, FailureKind.API_ERROR, elapsed, recorded);
        }
        Map<String, ObservedItem> observed = observe(call.kind(), response);
        observed.keySet().retainAll(call.expected().keySet());
        return new ExecutedCall(CallResult.completed(call.kind(), call.stage(),
            scorer.score(call.expected(), observed), recorded.size()), observed, elapsed, recorded,
            call.kind() == CallKind.GENERIC_FIELDS ? AutofillCounts.score(call.expected(), observed) : null);
    }

    private static ExecutedCall failed(CaseCall call, FailureKind failure, long elapsed, List<Attempt> attempts) {
        List<Attempt> recorded = List.copyOf(attempts);
        return new ExecutedCall(CallResult.failed(call.kind(), call.stage(), failure, recorded.size()), Map.of(),
            elapsed, recorded);
    }

    private static FailureKind attemptFailure(List<Attempt> attempts) {
        if (attempts.isEmpty() || attempts.stream().anyMatch(attempt -> attempt.outcome() == Outcome.SUCCESS)) {
            return null;
        }
        return switch (attempts.getLast().outcome()) {
            case TIMEOUT -> FailureKind.TIMEOUT;
            case INVALID_RESPONSE -> FailureKind.INVALID_RESPONSE;
            default -> FailureKind.API_ERROR;
        };
    }

    static Map<String, ObservedItem> observe(CallKind kind, JsonNode response) {
        Map<String, ObservedItem> observed = new LinkedHashMap<>();
        switch (kind) {
            case SECTION_CLASSIFY -> response.path("sections").forEach(section -> {
                String category = section.path("category").asString(null);
                observed.put(section.path("sectionId").asString(),
                    ObservedItem.answered("ABSTAIN".equals(category) ? null : category));
            });
            case GENERIC_FIELDS -> response.path("fields").forEach(field -> {
                String id = field.path("candidateId").asString();
                if ("LLM_UNAVAILABLE".equals(field.path("reason").asString(null))) {
                    observed.put(id, ObservedItem.unavailable());
                    return;
                }
                String key = field.path("profileFieldKey").isString() ? field.path("profileFieldKey").asString() : null;
                JsonNode binding = field.path("binding");
                if (key == null && "DERIVED".equals(binding.path("type").asString(null))) {
                    key = "DERIVED:" + binding.path("recipe").asString();
                }
                JsonNode confidence = field.path("confidence");
                observed.put(id, ObservedItem.answered(key, confidence.isNumber() ? confidence.asDouble() : null));
            });
            case INTERACTION_DECISION -> {
                boolean unavailable = "LLM_UNAVAILABLE".equals(response.path("status").asString(null));
                response.path("decisions").forEach(decision -> observed.put(decision.path("decisionId").asString(),
                    unavailable ? ObservedItem.unavailable()
                        : ObservedItem.answered("SELECTED".equals(decision.path("selection").asString(null))
                            ? decision.path("candidateId").asString(null) : null)));
            }
        }
        return observed;
    }
}
