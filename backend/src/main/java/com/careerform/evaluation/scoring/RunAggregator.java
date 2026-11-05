package com.careerform.evaluation.scoring;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.function.Predicate;

/**
 * 호출 결과를 항목 단위로 집계한다. 정확도는 채점 가능한 호출의 맞힌 항목 수 합을 채점 항목 수 합으로 나눈 값이라
 * 항목이 많은 호출이 그만큼 비중을 갖는다. 실패 호출은 분모에서 빠진다.
 */
public final class RunAggregator {

    public RunAggregate aggregate(List<CallResult> calls) {
        Map<FailureKind, Long> failures = new EnumMap<>(FailureKind.class);
        ItemCounts items = ItemCounts.ZERO;
        long modelCalls = 0;
        int scorable = 0;
        for (CallResult call : calls) {
            modelCalls += call.modelCalls();
            if (call.score() != null) {
                items = items.plus(call.score());
            }
            FailureKind failure = call.effectiveFailure();
            if (failure == null) {
                scorable++;
            }
            else {
                failures.merge(failure, 1L, Long::sum);
            }
        }
        Double failureRate = calls.isEmpty() ? null : (double) (calls.size() - scorable) / calls.size();
        return new RunAggregate(
            mean(calls, call -> true),
            mean(calls, call -> call.stage() == CallKind.Stage.PREPARATION),
            mean(calls, call -> call.stage() == CallKind.Stage.MAPPING),
            failureRate, calls.size(), scorable, modelCalls, failures, items);
    }

    private static Double mean(List<CallResult> calls, Predicate<CallResult> included) {
        long correct = 0;
        long scored = 0;
        for (CallResult call : calls) {
            if (included.test(call) && call.effectiveFailure() == null) {
                correct += call.score().correct();
                scored += call.score().scored();
            }
        }
        return scored == 0 ? null : (double) correct / scored;
    }
}
