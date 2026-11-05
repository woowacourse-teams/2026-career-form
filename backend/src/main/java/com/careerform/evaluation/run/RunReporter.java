package com.careerform.evaluation.run;

import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.function.Predicate;
import com.careerform.evaluation.scoring.AutofillOutcome;
import com.careerform.evaluation.scoring.CallKind;
import com.careerform.evaluation.scoring.RunAggregator;
import com.careerform.monitoring.ModelCallRecording.Attempt;
import com.careerform.monitoring.ModelCallRecording.Outcome;

/** 호출 결과 원자료로 {@link RunReport}를 만든다. 저장한 집계값은 쓰지 않는다. */
public final class RunReporter {

    private static final double[] CONFIDENCE_THRESHOLDS = {0.5, 0.6, 0.7, 0.8, 0.9};

    private static final double NANOS_PER_MS = 1_000_000.0;
    private final RunAggregator aggregator = new RunAggregator();

    /** 정답을 모를 때의 보고. 자동기입 결과는 측정 불가(null)다. */
    public RunReport report(EvaluationRun run, List<CallResultRecord> records) {
        return report(run, records, record -> null);
    }

    /**
     * {@code expected}는 기록 하나의 정답표를 돌려주고, 모르면 null이다. 칸 매핑 답은 이 정답과 다시 비교해
     * 자동기입 결과를 낸다.
     */
    public RunReport report(EvaluationRun run, List<CallResultRecord> records,
        Function<CallResultRecord, Map<String, String>> expected) {
        return report(run, records, expected, caseId -> null);
    }

    /**
     * {@code siteOf}는 사례 ID의 사이트를 돌려주고, 모르면 null이다. 자동기입 1번은 같은 사이트 안에서만 묶는다.
     */
    public RunReport report(EvaluationRun run, List<CallResultRecord> records,
        Function<CallResultRecord, Map<String, String>> expected, Function<String, String> siteOf) {
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
            performance, tokens, flows(records, siteOf), timing(run, records), RunService.SCORING_VERSION,
            repetitions(records, expected), autofill(records, expected).map(RunReport.Autofill::of).orElse(null),
            stageScores(records, expected), itemsByCall(records), confidence(records, expected));
    }

    /** 질문 종류별 점수(TOTAL·MAPPING은 칸 매핑, PREPARATION은 준비 단계, SECTION은 매핑 단계 섹션 분류). 정답을 모르는 기록은 빼고, 결과가 없는 단계는 넣지 않는다. 실패한 호출의 칸은 답이 없는 칸으로 센다. */
    private static Map<String, RunReport.Autofill> stageScores(List<CallResultRecord> records,
        Function<CallResultRecord, Map<String, String>> expected) {
        Map<String, RunReport.Autofill> scores = new LinkedHashMap<>();
        stageOutcomes(records, expected).forEach((stage, outcome) -> scores.put(stage, RunReport.Autofill.of(outcome)));
        return scores;
    }

    private static Map<String, AutofillOutcome> stageOutcomes(List<CallResultRecord> records,
        Function<CallResultRecord, Map<String, String>> expected) {
        Map<String, AutofillOutcome> outcomes = new LinkedHashMap<>();
        // 질문 종류를 섞지 않는다. 값을 넣는 것은 칸 매핑뿐이라 자동기입 점수(TOTAL)는 칸 매핑이고, 준비(섹션 고르기·버튼·선택
        // 결정)와 매핑 단계의 섹션 분류는 따로 낸다. 섞으면 섹션 분류 오답이 "잘못 넣은 칸"처럼 정밀도를 깎는다.
        Map<String, Predicate<CallResultRecord>> stages = new LinkedHashMap<>();
        stages.put("TOTAL", record -> record.kind() == CallKind.GENERIC_FIELDS);
        stages.put("PREPARATION", record -> record.stage() == CallKind.Stage.PREPARATION);
        stages.put("SECTION", record -> record.stage() == CallKind.Stage.MAPPING && record.kind() == CallKind.SECTION_CLASSIFY);
        stages.put("MAPPING", record -> record.kind() == CallKind.GENERIC_FIELDS);
        stages.forEach((stage, filter) -> records.stream().filter(filter)
            .map(record -> {
                Map<String, String> truth = expected.apply(record);
                return truth == null ? null : AutofillOutcome.score(record.kind(), truth, record.observed());
            })
            .filter(Objects::nonNull).reduce(AutofillOutcome::plus).ifPresent(outcome -> outcomes.put(stage, outcome)));
        return outcomes;
    }

    /** 채점한 호출의 항목 판정을 "단계/호출 종류"별로 더한다. 처음 나온 순서를 지킨다. */
    private Map<String, com.careerform.evaluation.scoring.ItemCounts> itemsByCall(List<CallResultRecord> records) {
        Map<String, List<CallResultRecord>> groups = new LinkedHashMap<>();
        records.stream().filter(record -> record.score() != null).forEach(record ->
            groups.computeIfAbsent(record.stage() + "/" + record.kind(), key -> new ArrayList<>()).add(record));
        Map<String, com.careerform.evaluation.scoring.ItemCounts> items = new LinkedHashMap<>();
        groups.forEach((key, group) -> items.put(key,
            aggregator.aggregate(group.stream().map(CallResultRecord::toCallResult).toList()).items()));
        return items;
    }

    private static Map<String, Double> scoresOf(Map<String, AutofillOutcome> outcomes) {
        Map<String, Double> scores = new LinkedHashMap<>();
        outcomes.forEach((stage, outcome) -> {
            if (outcome.score() != null) {
                scores.put(stage, outcome.score());
            }
        });
        return scores;
    }

    private static java.util.Optional<AutofillOutcome> autofill(List<CallResultRecord> records,
        Function<CallResultRecord, Map<String, String>> expected) {
        return autofill(records, expected, com.careerform.evaluation.scoring.AutofillCounts.AUTO_MIN);
    }

    /** 확신도 기준별 칸 매핑 결과. 확신도를 기록하지 않은 답이 있으면 나눌 수 없어 비어 있다. */
    private static List<RunReport.ConfidencePoint> confidence(List<CallResultRecord> records,
        Function<CallResultRecord, Map<String, String>> expected) {
        List<RunReport.ConfidencePoint> points = new ArrayList<>();
        for (double threshold : CONFIDENCE_THRESHOLDS) {
            AutofillOutcome outcome = autofill(records, expected, threshold).orElse(null);
            if (outcome == null || outcome.unobserved() > 0) {
                return List.of();
            }
            points.add(new RunReport.ConfidencePoint(threshold, outcome, outcome.precision(), outcome.fillRate(), outcome.score()));
        }
        return points;
    }

    private static java.util.Optional<AutofillOutcome> autofill(List<CallResultRecord> records,
        Function<CallResultRecord, Map<String, String>> expected, double minConfidence) {
        return records.stream().filter(record -> record.kind() == CallKind.GENERIC_FIELDS)
            .map(record -> {
                Map<String, String> truth = expected.apply(record);
                return truth == null ? null : AutofillOutcome.score(truth, record.observed(), minConfidence);
            })
            .filter(Objects::nonNull).reduce(AutofillOutcome::plus);
    }

    private List<RunReport.RepetitionQuality> repetitions(List<CallResultRecord> records,
        Function<CallResultRecord, Map<String, String>> expected) {
        Map<Integer, List<CallResultRecord>> byRepetition = new java.util.TreeMap<>();
        records.forEach(record -> byRepetition.computeIfAbsent(record.repetition(), key -> new ArrayList<>()).add(record));
        List<RunReport.RepetitionQuality> qualities = new ArrayList<>();
        byRepetition.forEach((repetition, group) -> qualities.add(new RunReport.RepetitionQuality(repetition,
            aggregator.aggregate(group.stream().map(CallResultRecord::toCallResult).toList()).accuracy(),
            scoresOf(stageOutcomes(group, expected)))));
        return qualities;
    }

    private static RunReport.StagePerformance performance(List<CallResultRecord> records, Double elapsedSeconds) {
        long failed = records.stream().filter(record -> record.toCallResult().effectiveFailure() != null).count();
        long completed = records.size() - failed;
        List<Double> attempts = new ArrayList<>();
        // 제품 요청 하나가 배치마다 모델을 여러 번 부르므로, 두 번째 이후 시도가 아니라 실패한 시도(429 등)를 센다.
        int failedAttempts = 0;
        int tokenLimitAttempts = 0;
        double failedMs = 0;
        for (CallResultRecord record : records) {
            for (Attempt attempt : record.attempts()) {
                double ms = attempt.durationNanos() / NANOS_PER_MS;
                attempts.add(ms);
                if (attempt.outcome() != Outcome.SUCCESS) {
                    failedAttempts++;
                    failedMs += ms;
                }
                if (attempt.outcome() == Outcome.TOKEN_LIMIT) {
                    tokenLimitAttempts++;
                }
            }
        }
        return new RunReport.StagePerformance(records.size(),
            records.isEmpty() ? null : (double) failed / records.size(),
            elapsedSeconds == null || elapsedSeconds <= 0 ? null : completed / elapsedSeconds,
            distribution(records.stream().map(record -> record.productCallNanos() / NANOS_PER_MS).toList()),
            distribution(attempts), failedAttempts, failedAttempts == 0 ? null : failedMs, tokenLimitAttempts);
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

    /**
     * 자동기입 1번(버튼 한 번) 단위로 묶는다. 같은 반복 안에서 칸 매핑이 없는 사례(학력 구분을 고르기 전 처음 화면처럼
     * 준비 단계만 있는 화면)는 실제 흐름의 앞부분이므로, 칸 매핑까지 있는 사례(고른 뒤 펼쳐진 화면)마다 앞에 붙여
     * 하나의 자동기입으로 본다. 처음 화면은 같은 사이트(지원서)의 화면에만 붙인다. 모든 사례에 칸 매핑이 있으면 사례 하나가
     * 자동기입 1번이다.
     * 시간은 호출 시간의 합, 토큰은 관측한 시도의 합이고, 어느 호출이든 실패하면 실패한 자동기입이다.
     */
    private static RunReport.Flows flows(List<CallResultRecord> records, Function<String, String> siteOf) {
        Map<String, Map<String, List<CallResultRecord>>> bySite = new java.util.TreeMap<>();
        records.forEach(record -> bySite.computeIfAbsent(record.repetition() + "/"
                + Objects.requireNonNullElse(siteOf.apply(record.caseId()), ""), key -> new LinkedHashMap<>())
            .computeIfAbsent(record.caseId(), key -> new ArrayList<>()).add(record));
        List<List<CallResultRecord>> autofills = new ArrayList<>();
        bySite.values().forEach(cases -> {
            Predicate<List<CallResultRecord>> complete = group -> group.stream()
                .anyMatch(record -> record.stage() == CallKind.Stage.MAPPING);
            List<CallResultRecord> start = cases.values().stream().filter(complete.negate()).flatMap(List::stream).toList();
            List<List<CallResultRecord>> branches = cases.values().stream().filter(complete).toList();
            if (branches.isEmpty()) {
                autofills.addAll(cases.values());
                return;
            }
            branches.forEach(branch -> {
                List<CallResultRecord> autofill = new ArrayList<>(start);
                autofill.addAll(branch);
                autofills.add(autofill);
            });
        });
        List<Double> times = new ArrayList<>();
        int failed = 0;
        long input = 0;
        long output = 0;
        boolean observed = false;
        for (List<CallResultRecord> autofill : autofills) {
            times.add(autofill.stream().mapToLong(CallResultRecord::productCallNanos).sum() / NANOS_PER_MS);
            if (autofill.stream().anyMatch(record -> record.toCallResult().effectiveFailure() != null)) {
                failed++;
            }
            for (Attempt attempt : autofill.stream().flatMap(record -> record.attempts().stream()).toList()) {
                if (attempt.inputTokens() != null && attempt.outputTokens() != null) {
                    input += attempt.inputTokens();
                    output += attempt.outputTokens();
                    observed = true;
                }
            }
        }
        int count = autofills.size();
        return new RunReport.Flows(count, count == 0 ? null : (double) failed / count, distribution(times),
            observed ? (double) input / count : null, observed ? (double) output / count : null);
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
