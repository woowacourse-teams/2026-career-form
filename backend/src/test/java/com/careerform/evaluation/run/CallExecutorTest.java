package com.careerform.evaluation.run;

import com.careerform.evaluation.EvaluationTestData;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import com.careerform.evaluation.dataset.CaseCall;
import com.careerform.evaluation.scoring.CallKind;
import com.careerform.evaluation.scoring.FailureKind;
import com.careerform.evaluation.scoring.ObservedItem;
import com.careerform.monitoring.ModelCallRecording;
import com.careerform.monitoring.ModelCallRecording.Attempt;
import com.careerform.monitoring.ModelCallRecording.Outcome;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@DisplayName("평가 호출 실행과 제품 응답 정규화")
class CallExecutorTest {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    @Test
    @DisplayName("필드 매핑 응답을 칸별 답으로 바꾸고 공급자 사용 불가 칸은 채점에서 뺀다")
    void normalizesGenericFields() {
        var executor = executor(json("""
            {"status": "COMPLETE", "fields": [
              {"candidateId": "field-1", "profileFieldKey": "contact.contact.email"},
              {"candidateId": "field-2", "profileFieldKey": null},
              {"candidateId": "field-3", "profileFieldKey": null, "binding": {"type": "DERIVED", "recipe": "KOREAN_FULL_NAME"}},
              {"candidateId": "field-4", "profileFieldKey": null, "reason": "LLM_UNAVAILABLE"}]}"""),
            List.of(success(10, 2)));

        ExecutedCall result = executor.execute(call(CallKind.GENERIC_FIELDS,
            Map.of("field-1", "contact.contact.email", "field-2", "x", "field-3", "DERIVED:KOREAN_FULL_NAME",
                "field-4", "y")), EvaluationTestData.target(Map.of()));

        assertThat(result.observed()).containsEntry("field-1", ObservedItem.answered("contact.contact.email"))
            .containsEntry("field-2", ObservedItem.answered(null))
            .containsEntry("field-3", ObservedItem.answered("DERIVED:KOREAN_FULL_NAME"))
            .containsEntry("field-4", ObservedItem.unavailable());
        assertThat(result.result().score().correct()).isEqualTo(2);
        assertThat(result.result().score().missing()).isEqualTo(1);
        assertThat(result.result().score().excluded()).isEqualTo(1);
        assertThat(result.result().modelCalls()).isEqualTo(1);
        assertThat(result.attempts()).hasSize(1);
        assertThat(result.productCallNanos()).isNotNegative();
    }

    @Test
    @DisplayName("필드 매핑은 칸별 확신도를 남기고 제품 확신도 구간으로 자동기입 결과를 센다")
    void countsAutofillBandsForGenericFields() {
        var executor = executor(json("""
            {"status": "COMPLETE", "fields": [
              {"candidateId": "field-1", "profileFieldKey": "contact.contact.email", "confidence": 0.93},
              {"candidateId": "field-2", "profileFieldKey": "contact.contact.phone", "confidence": 0.6},
              {"candidateId": "field-3", "profileFieldKey": null, "confidence": 0}]}"""),
            List.of(success(10, 2)));

        ExecutedCall result = executor.execute(call(CallKind.GENERIC_FIELDS,
            Map.of("field-1", "contact.contact.email", "field-2", "contact.contact.phone", "field-3", "x")),
            EvaluationTestData.target(Map.of()));

        assertThat(result.observed().get("field-1").confidence()).isEqualTo(0.93);
        assertThat(result.autofill()).isEqualTo(new com.careerform.evaluation.scoring.AutofillCounts(1, 0, 1, 0, 1, 0));
    }

    @Test
    @DisplayName("섹션 분류의 ABSTAIN은 누락이고 준비 단계 호출은 준비 단계로 기록한다")
    void normalizesClassification() {
        var executor = executor(json("""
            {"status": "COMPLETE", "sections": [{"sectionId": "ls1", "category": "SENSITIVE"},
              {"sectionId": "ls2", "category": "ABSTAIN"}]}"""), List.of(success(5, 1)));
        CaseCall call = new CaseCall(1, CallKind.Stage.PREPARATION, CallKind.SECTION_CLASSIFY, "/c", "d",
            JSON.readTree("{}"), Map.of("ls1", "SENSITIVE", "ls2", "EDUCATION"), 1);

        ExecutedCall result = executor.execute(call, EvaluationTestData.target(Map.of()));

        assertThat(result.result().stage()).isEqualTo(CallKind.Stage.PREPARATION);
        assertThat(result.result().score().correct()).isEqualTo(1);
        assertThat(result.result().score().missing()).isEqualTo(1);
    }

    @Test
    @DisplayName("버튼 결정은 선택한 후보 또는 기권으로 바꾼다")
    void normalizesInteractionDecisions() {
        var executor = executor(json("""
            {"status": "COMPLETE", "decisions": [
              {"decisionId": "rowKind0", "selection": "SELECTED", "candidateId": "rowKind0-option1"},
              {"decisionId": "rowKind1", "selection": "ABSTAINED", "candidateId": null}]}"""), List.of(success(3, 1)));

        ExecutedCall result = executor.execute(call(CallKind.INTERACTION_DECISION,
            Map.of("rowKind0", "rowKind0-option1", "rowKind1", "rowKind1-option2")), EvaluationTestData.target(Map.of()));

        assertThat(result.result().score().correct()).isEqualTo(1);
        assertThat(result.result().score().missing()).isEqualTo(1);
    }

    @Test
    @DisplayName("모델 시도가 모두 실패하면 마지막 시도 결과로 실패 원인을 정하고 정확도에서 뺀다")
    void failedAttemptsBecomeCallFailure() {
        var timeout = new Attempt("jev", "answer", 8_000_000_000L, null, Outcome.TIMEOUT, null, null, null);
        var rateLimited = new Attempt("jev", "answer", 1_000L, 429, Outcome.HTTP_ERROR, null, null, null);
        var invalid = new Attempt("jev", "answer", 1_000L, 200, Outcome.INVALID_RESPONSE, 7L, 1L, "jev-x");
        String abstained = """
            {"status": "COMPLETE", "sections": [{"sectionId": "gs1", "category": "ABSTAIN"}]}""";
        CaseCall call = call(CallKind.SECTION_CLASSIFY, Map.of("gs1", "PERSONAL"));

        assertThat(executor(json(abstained), List.of(rateLimited, timeout)).execute(call, EvaluationTestData.target(Map.of()))
            .result().failure()).isEqualTo(FailureKind.TIMEOUT);
        assertThat(executor(json(abstained), List.of(timeout, rateLimited)).execute(call, EvaluationTestData.target(Map.of()))
            .result().failure()).isEqualTo(FailureKind.API_ERROR);
        ExecutedCall invalidResult = executor(json(abstained), List.of(invalid)).execute(call, EvaluationTestData.target(Map.of()));
        assertThat(invalidResult.result().failure()).isEqualTo(FailureKind.INVALID_RESPONSE);
        assertThat(invalidResult.attempts().getFirst().inputTokens()).isEqualTo(7L);
    }

    @Test
    @DisplayName("제품 서비스가 요청을 거부하거나 COMPLETE가 아니면 API 오류다")
    void productRejectionIsApiError() {
        CaseCall call = call(CallKind.SECTION_CLASSIFY, Map.of("gs1", "PERSONAL"));
        ProductCallGateway throwing = (kind, request, settings) -> {
            throw new IllegalStateException("rejected");
        };

        assertThat(new CallExecutor(throwing).execute(call, EvaluationTestData.target(Map.of())).result().failure())
            .isEqualTo(FailureKind.API_ERROR);
        assertThat(executor(json("{\"status\": \"POLICY_UNAVAILABLE\", \"sections\": []}"), List.of())
            .execute(call, EvaluationTestData.target(Map.of())).result().failure()).isEqualTo(FailureKind.API_ERROR);
    }

    @Test
    @DisplayName("실행 설정을 제품 호출에 넘긴다")
    void passesSettings() {
        CallTarget[] seen = new CallTarget[1];
        ProductCallGateway gateway = (kind, request, settings) -> {
            seen[0] = settings;
            return json("{\"status\": \"COMPLETE\", \"sections\": [{\"sectionId\": \"gs1\", \"category\": \"PERSONAL\"}]}");
        };

        new CallExecutor(gateway).execute(call(CallKind.SECTION_CLASSIFY, Map.of("gs1", "PERSONAL")),
            EvaluationTestData.target(Map.of("field-batch-size", "2")));

        assertThat(seen[0].settings()).containsEntry("field-batch-size", "2");
        assertThat(seen[0].provider()).isEqualTo("jev");
    }

    private static CallExecutor executor(JsonNode response, List<Attempt> attempts) {
        return new CallExecutor((kind, request, settings) -> {
            attempts.forEach(ModelCallRecording::record);
            return response;
        });
    }

    private static Attempt success(long input, long output) {
        return new Attempt("jev", "answer", 1_000L, 200, Outcome.SUCCESS, input, output, "jev-x");
    }

    private static CaseCall call(CallKind kind, Map<String, String> expected) {
        return new CaseCall(1, kind.stage(), kind, "/x", "d", JSON.readTree("{}"), expected, 1);
    }

    private static JsonNode json(String text) {
        return JSON.readTree(text);
    }
}
