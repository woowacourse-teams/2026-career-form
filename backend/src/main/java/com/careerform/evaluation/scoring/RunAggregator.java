package com.careerform.evaluation.scoring;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.function.Predicate;

/** 호출 결과를 호출 단위로 집계한다. 호출 안의 항목 수로 호출 간 비중을 바꾸지 않는다. */
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
        double sum = 0;
        int count = 0;
        for (CallResult call : calls) {
            if (included.test(call) && call.effectiveFailure() == null) {
                sum += call.score().score();
                count++;
            }
        }
        return count == 0 ? null : sum / count;
    }
}
