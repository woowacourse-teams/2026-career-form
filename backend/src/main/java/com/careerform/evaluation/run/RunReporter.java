package com.careerform.evaluation.run;

import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Predicate;
import com.careerform.evaluation.scoring.CallKind;
import com.careerform.evaluation.scoring.RunAggregator;
import com.careerform.monitoring.ModelCallRecording.Attempt;

/** 호출 결과 원자료로 {@link RunReport}를 만든다. 저장한 집계값은 쓰지 않는다. */
public final class RunReporter {

    private static final double NANOS_PER_MS = 1_000_000.0;
    private final RunAggregator aggregator = new RunAggregator();

    public RunReport report(EvaluationRun run, List<CallResultRecord> records) {
        Double elapsedSeconds = run.startedAt() == null || run.finishedAt() == null ? null
            : Duration.between(run.startedAt(), run.finishedAt()).toMillis() / 1000.0;
        Map<String, Predicate<CallResultRecord>> stages = new LinkedHashMap<>();
        stages.put("TOTAL", record -> true);
        stages.put("PREPARATION", record -> record.stage() == CallKind.Stage.PREPARATION);
        stages.put("MAPPING", record -> record.stage() == CallKind.Stage.MAPPING);
        Map<String, RunReport.StagePerformance> performance = new LinkedHashMap<>();
        Map<String, RunReport.Tokens> tokens = new LinkedHashMap<>();
        stages.forEach((name, filter) -> {
            List<CallResultRecord> selected = records.stream().filter(filter).toList();
            performance.put(name, performance(selected, elapsedSeconds));
            tokens.put(name, tokens(selected));
        });
        return new RunReport(aggregator.aggregate(records.stream().map(CallResultRecord::toCallResult).toList()),
            performance, tokens, flows(records), timing(run, records), RunService.SCORING_VERSION, repetitions(records));
    }

    private List<RunReport.RepetitionQuality> repetitions(List<CallResultRecord> records) {
        Map<Integer, List<CallResultRecord>> byRepetition = new java.util.TreeMap<>();
        records.forEach(record -> byRepetition.computeIfAbsent(record.repetition(), key -> new ArrayList<>()).add(record));
        List<RunReport.RepetitionQuality> qualities = new ArrayList<>();
        byRepetition.forEach((repetition, group) -> qualities.add(new RunReport.RepetitionQuality(repetition,
            aggregator.aggregate(group.stream().map(CallResultRecord::toCallResult).toList()).accuracy())));
        return qualities;
    }

    private static RunReport.StagePerformance performance(List<CallResultRecord> records, Double elapsedSeconds) {
        long failed = records.stream().filter(record -> record.toCallResult().effectiveFailure() != null).count();
        long completed = records.size() - failed;
        List<Double> attempts = new ArrayList<>();
        int retried = 0;
        double retriedMs = 0;
        for (CallResultRecord record : records) {
            for (int index = 0; index < record.attempts().size(); index++) {
                double ms = record.attempts().get(index).durationNanos() / NANOS_PER_MS;
                attempts.add(ms);
                if (index > 0) {
                    retried++;
                    retriedMs += ms;
                }
            }
        }
        return new RunReport.StagePerformance(records.size(),
            records.isEmpty() ? null : (double) failed / records.size(),
            elapsedSeconds == null || elapsedSeconds <= 0 ? null : completed / elapsedSeconds,
            distribution(records.stream().map(record -> record.productCallNanos() / NANOS_PER_MS).toList()),
            distribution(attempts), retried, retried == 0 ? null : retriedMs);
    }

    private static RunReport.Tokens tokens(List<CallResultRecord> records) {
        List<Attempt> attempts = records.stream().flatMap(record -> record.attempts().stream()).toList();
        List<Attempt> observed = attempts.stream()
            .filter(attempt -> attempt.inputTokens() != null && attempt.outputTokens() != null).toList();
        Long input = observed.isEmpty() ? null : observed.stream().mapToLong(Attempt::inputTokens).sum();
        Long output = observed.isEmpty() ? null : observed.stream().mapToLong(Attempt::outputTokens).sum();
        return new RunReport.Tokens(observed.size(), attempts.size() - observed.size(), input, output,
            input == null ? null : (double) input / observed.size(),
            output == null ? null : (double) output / observed.size());
    }

    private static RunReport.Flows flows(List<CallResultRecord> records) {
        Map<String, List<CallResultRecord>> byFlow = new LinkedHashMap<>();
        records.forEach(record -> byFlow.computeIfAbsent(record.repetition() + "/" + record.caseId(),
            key -> new ArrayList<>()).add(record));
        List<Double> times = new ArrayList<>();
        int failed = 0;
        for (List<CallResultRecord> flow : byFlow.values()) {
            times.add(flow.stream().mapToLong(CallResultRecord::productCallNanos).sum() / NANOS_PER_MS);
            if (flow.stream().anyMatch(record -> record.toCallResult().effectiveFailure() != null)) {
                failed++;
            }
        }
        return new RunReport.Flows(byFlow.size(), byFlow.isEmpty() ? null : (double) failed / byFlow.size(),
            distribution(times));
    }

    private static RunReport.Timing timing(EvaluationRun run, List<CallResultRecord> records) {
        Long queue = run.startedAt() == null ? null : Duration.between(run.requestedAt(), run.startedAt()).toMillis();
        Long elapsed = run.startedAt() == null || run.finishedAt() == null ? null
            : Duration.between(run.startedAt(), run.finishedAt()).toMillis();
        return new RunReport.Timing(queue, elapsed,
            distribution(records.stream().filter(record -> record.repetition() == 1)
                .map(record -> record.productCallNanos() / NANOS_PER_MS).toList()).meanMs(),
            distribution(records.stream().filter(record -> record.repetition() > 1)
                .map(record -> record.productCallNanos() / NANOS_PER_MS).toList()).meanMs());
    }

    static RunReport.Distribution distribution(List<Double> values) {
        List<Double> sorted = values.stream().filter(Objects::nonNull).sorted().toList();
        if (sorted.isEmpty()) {
            return new RunReport.Distribution(0, null, null, null, null);
        }
        double total = sorted.stream().mapToDouble(Double::doubleValue).sum();
        return new RunReport.Distribution(sorted.size(), total / sorted.size(), percentile(sorted, 50),
            percentile(sorted, 95), total);
    }

    /** nearest-rank 백분위수. */
    private static double percentile(List<Double> sorted, int percent) {
        int rank = (int) Math.ceil(percent / 100.0 * sorted.size());
        return sorted.get(Math.max(0, rank - 1));
    }
}
