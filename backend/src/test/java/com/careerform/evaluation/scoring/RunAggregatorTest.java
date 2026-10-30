package com.careerform.evaluation.scoring;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import com.careerform.evaluation.scoring.CallKind.Stage;

@DisplayName("평가 실행의 호출 단위 집계")
class RunAggregatorTest {

    private final RunAggregator aggregator = new RunAggregator();

    @Test
    @DisplayName("준비 2회와 매핑 8회면 매핑이 80% 비중을 가지며 칸 수는 비중을 바꾸지 않는다")
    void weighsByCallNotByItem() {
        List<CallResult> calls = new ArrayList<>();
        calls.add(scored(CallKind.INTERACTION_DECISION, 1, 1, 1));
        calls.add(scored(CallKind.INTERACTION_DECISION, 0, 1, 1));
        for (int i = 0; i < 8; i++) {
            int items = i == 0 ? 40 : 2;
            calls.add(scored(CallKind.GENERIC_FIELDS, items / 2, items, 1));
        }

        RunAggregate result = aggregator.aggregate(calls);

        assertThat(result.accuracy()).isCloseTo(0.5, within(1e-9));
        assertThat(result.preparationAccuracy()).isCloseTo(0.5, within(1e-9));
        assertThat(result.mappingAccuracy()).isCloseTo(0.5, within(1e-9));
        assertThat(result.scorableCalls()).isEqualTo(10);
    }

    @Test
    @DisplayName("단계는 호출 종류가 아니라 호출이 일어난 단계로 센다: 준비 루프의 섹션 분류는 준비 정확도에 들어간다")
    void stageFollowsCallPhase() {
        RunAggregate result = aggregator.aggregate(List.of(
            CallResult.completed(CallKind.SECTION_CLASSIFY, Stage.PREPARATION, new CallScore(1, 0, 0, 0, 0), 1),
            CallResult.completed(CallKind.SECTION_CLASSIFY, Stage.MAPPING, new CallScore(0, 1, 0, 0, 0), 1)));

        assertThat(result.preparationAccuracy()).isEqualTo(1.0);
        assertThat(result.mappingAccuracy()).isEqualTo(0.0);
    }

    @Test
    @DisplayName("타임아웃, API 오류, 응답 형식 오류는 정확도 분모에서 빠지고 실패율에 들어간다")
    void failuresLeaveAccuracyAndEnterFailureRate() {
        List<CallResult> calls = List.of(
            scored(CallKind.SECTION_CLASSIFY, 1, 1, 1),
            CallResult.failed(CallKind.GENERIC_FIELDS, FailureKind.TIMEOUT, 1),
            CallResult.failed(CallKind.GENERIC_FIELDS, FailureKind.API_ERROR, 0),
            CallResult.failed(CallKind.GENERIC_FIELDS, FailureKind.INVALID_RESPONSE, 1));

        RunAggregate result = aggregator.aggregate(calls);

        assertThat(result.accuracy()).isEqualTo(1.0);
        assertThat(result.failureRate()).isEqualTo(0.75);
        assertThat(result.failures()).containsEntry(FailureKind.TIMEOUT, 1L)
            .containsEntry(FailureKind.API_ERROR, 1L).containsEntry(FailureKind.INVALID_RESPONSE, 1L);
    }

    @Test
    @DisplayName("모든 칸이 공급자 사용 불가인 호출은 채점 불가 실패로 센다")
    void unscorableCallCountsAsFailure() {
        CallScore none = new CallScorer().score(java.util.Map.of("f", "k"),
            java.util.Map.of("f", ObservedItem.unavailable()));
        RunAggregate result = aggregator.aggregate(List.of(
            CallResult.completed(CallKind.GENERIC_FIELDS, none, 1),
            scored(CallKind.GENERIC_FIELDS, 1, 2, 1)));

        assertThat(result.accuracy()).isEqualTo(0.5);
        assertThat(result.failureRate()).isEqualTo(0.5);
        assertThat(result.failures()).containsEntry(FailureKind.NOT_SCORABLE, 1L);
    }

    @Test
    @DisplayName("채점 가능한 호출이 없으면 정확도는 측정 불가(null)다")
    void noScorableCallsMeansUnmeasurable() {
        RunAggregate result = aggregator.aggregate(List.of(
            CallResult.failed(CallKind.SECTION_CLASSIFY, FailureKind.TIMEOUT, 1)));

        assertThat(result.accuracy()).isNull();
        assertThat(result.preparationAccuracy()).isNull();
        assertThat(result.mappingAccuracy()).isNull();
        assertThat(aggregator.aggregate(List.of()).failureRate()).isNull();
    }

    @Test
    @DisplayName("서버 배치만 달라 모델 호출 수가 다른 두 실행도 채점 호출 수와 정확도가 같다")
    void serverBatchingDoesNotChangeDenominator() {
        List<CallResult> batchOfFive = List.of(scored(CallKind.GENERIC_FIELDS, 7, 10, 2),
            scored(CallKind.SECTION_CLASSIFY, 3, 4, 1));
        List<CallResult> batchOfTwo = List.of(scored(CallKind.GENERIC_FIELDS, 7, 10, 5),
            scored(CallKind.SECTION_CLASSIFY, 3, 4, 1));

        RunAggregate five = aggregator.aggregate(batchOfFive);
        RunAggregate two = aggregator.aggregate(batchOfTwo);

        assertThat(two.scorableCalls()).isEqualTo(five.scorableCalls());
        assertThat(two.accuracy()).isEqualTo(five.accuracy());
        assertThat(two.modelCalls()).isEqualTo(6);
        assertThat(five.modelCalls()).isEqualTo(3);
    }

    @Test
    @DisplayName("정답, 오답, 누락, 불필요 제안, 채점 제외 수를 합산해 보관한다")
    void sumsItemCounts() {
        CallScorer scorer = new CallScorer();
        java.util.Map<String, String> expected = new java.util.LinkedHashMap<>();
        expected.put("a", "k1");
        expected.put("b", "k2");
        expected.put("c", null);
        expected.put("d", "k4");
        CallScore score = scorer.score(expected, java.util.Map.of(
            "a", ObservedItem.answered("k1"), "b", ObservedItem.answered("x"),
            "c", ObservedItem.answered("k3"), "d", ObservedItem.unavailable()));

        RunAggregate result = aggregator.aggregate(List.of(CallResult.completed(CallKind.GENERIC_FIELDS, score, 1)));

        assertThat(result.items()).isEqualTo(new ItemCounts(1, 1, 0, 1, 1));
    }

    private static CallResult scored(CallKind kind, int correct, int total, int modelCalls) {
        CallScore score = new CallScore(correct, total - correct, 0, 0, 0);
        return CallResult.completed(kind, score, modelCalls);
    }
}
