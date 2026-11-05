package com.careerform.evaluation.run;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import com.careerform.evaluation.scoring.AutofillOutcome;
import com.careerform.evaluation.scoring.CallKind;
import com.careerform.evaluation.scoring.CallScore;
import com.careerform.evaluation.scoring.FailureKind;
import com.careerform.evaluation.scoring.ObservedItem;
import com.careerform.monitoring.ModelCallRecording.Attempt;
import com.careerform.monitoring.ModelCallRecording.Outcome;

@DisplayName("평가 실행 결과 보고")
class RunReporterTest {

    private static final Instant AT = Instant.parse("2026-10-30T03:00:00Z");
    private static final long MS = 1_000_000L;

    @Test
    @DisplayName("자동기입 결과는 저장한 답을 정답과 다시 비교해 더하고, 반복마다 점수를 내며, 정답을 모르면 측정 불가(null)다")
    void scoresAutofillFromObservedAnswers() {
        EvaluationRun run = run(AT.minusSeconds(10), AT, AT.plusSeconds(4));
        Map<String, String> truth = new java.util.HashMap<>();
        truth.put("field-1", "k1");
        truth.put("field-2", null);
        CallResultRecord first = fields(1, Map.of("field-1", ObservedItem.answered("k1", 0.9),
            "field-2", ObservedItem.answered(null, 0.9)));
        CallResultRecord second = fields(2, Map.of("field-1", ObservedItem.answered("k2", 0.9),
            "field-2", ObservedItem.answered("k9", 0.9)));
        CallResultRecord preparation = record(1, "a", 1, CallKind.Stage.PREPARATION, new CallScore(1, 0, 0, 0, 0),
            100, List.of());

        RunReport report = new RunReporter().report(run, List.of(first, second, preparation),
            record -> record.order() == 2 ? truth : null);

        assertThat(report.autofill().counts()).isEqualTo(new AutofillOutcome(1, 1, 1, 1, 0, 0));
        assertThat(report.autofill().precision()).isCloseTo(1.0 / 3, within(1e-9));
        assertThat(report.autofill().fillRate()).isEqualTo(0.5);
        assertThat(report.repetitions()).extracting(quality -> quality.scores().get("MAPPING"))
            .containsExactly(1.0, 0.0);
        assertThat(new RunReporter().report(run, List.of(first)).autofill()).isNull();
    }

    @Test
    @DisplayName("항목 판정을 단계/호출 종류별로 나눠 더한다")
    void reportsItemsByCall() {
        EvaluationRun run = run(AT.minusSeconds(10), AT, AT.plusSeconds(4));
        CallResultRecord sections = new CallResultRecord("run-1", 1, "a", 1, CallKind.SECTION_CLASSIFY,
            CallKind.Stage.PREPARATION, null, new CallScore(2, 1, 0, 1, 0), Map.of(), 100 * MS, List.of(), AT);
        CallResultRecord again = new CallResultRecord("run-1", 2, "a", 1, CallKind.SECTION_CLASSIFY,
            CallKind.Stage.PREPARATION, null, new CallScore(3, 0, 1, 0, 0), Map.of(), 100 * MS, List.of(), AT);
        CallResultRecord fields = record(1, "a", 2, CallKind.Stage.MAPPING, new CallScore(5, 3, 2, 0, 0), 100, List.of());

        assertThat(new RunReporter().report(run, List.of(sections, again, fields)).itemsByCall()).containsExactly(
            Map.entry("PREPARATION/SECTION_CLASSIFY", new com.careerform.evaluation.scoring.ItemCounts(5, 1, 1, 1, 0)),
            Map.entry("MAPPING/GENERIC_FIELDS", new com.careerform.evaluation.scoring.ItemCounts(5, 3, 2, 0, 0)));
    }

    @Test
    @DisplayName("점수는 준비·섹션 분류·칸 매핑을 섞지 않고 따로 내며, 자동기입 점수는 값을 넣는 칸 매핑만이다")
    void scoresEachStage() {
        EvaluationRun run = run(AT.minusSeconds(10), AT, AT.plusSeconds(4));
        CallResultRecord preparation = new CallResultRecord("run-1", 1, "a", 1, CallKind.SECTION_CLASSIFY,
            CallKind.Stage.PREPARATION, null, new CallScore(1, 1, 0, 0, 0),
            Map.of("s1", ObservedItem.answered("PERSONAL"), "s2", ObservedItem.answered("PERSONAL")), 100 * MS, List.of(), AT);
        CallResultRecord fields = fields(1, Map.of("field-1", ObservedItem.answered("k1", 0.9),
            "field-2", ObservedItem.answered(null, 0.9)));
        CallResultRecord classify = new CallResultRecord("run-1", 1, "a", 3, CallKind.SECTION_CLASSIFY,
            CallKind.Stage.MAPPING, null, new CallScore(1, 1, 0, 0, 0),
            Map.of("s1", ObservedItem.answered("PERSONAL"), "s2", ObservedItem.answered("PERSONAL")), 100 * MS, List.of(), AT);
        Map<String, Map<String, String>> truth = Map.of(
            "a/1", Map.of("s1", "PERSONAL", "s2", "NONE"),
            "a/2", new java.util.HashMap<>(Map.of("field-1", "k1")) {{ put("field-2", null); }},
            "a/3", Map.of("s1", "PERSONAL", "s2", "NONE"));

        RunReport report = new RunReporter().report(run, List.of(preparation, fields, classify),
            record -> truth.get(record.caseId() + "/" + record.order()));

        assertThat(report.scores().get("PREPARATION").counts()).isEqualTo(new AutofillOutcome(1, 1, 0, 0, 0, 0));
        assertThat(report.scores().get("SECTION").counts()).isEqualTo(new AutofillOutcome(1, 1, 0, 0, 0, 0));
        // 섹션을 잘못 분류해도 칸에 틀린 값이 들어간 것은 아니므로 칸 매핑 정밀도를 깎지 않는다.
        AutofillOutcome mapped = new AutofillOutcome(1, 0, 0, 1, 0, 0);
        assertThat(report.scores().get("MAPPING").counts()).isEqualTo(mapped);
        assertThat(report.scores().get("TOTAL").counts()).isEqualTo(mapped);
        assertThat(report.scores().get("TOTAL").precision()).isEqualTo(1.0);
        assertThat(report.repetitions().getFirst().scores()).containsKeys("TOTAL", "PREPARATION", "SECTION", "MAPPING");
    }

    @Test
    @DisplayName("반복마다 항목 단위 정확도를 따로 계산해 흔들림을 보이게 하고, 실패만 있는 반복은 측정 불가다")
    void reportsAccuracyPerRepetition() {
        EvaluationRun run = run(AT.minusSeconds(10), AT, AT.plusSeconds(4));
        List<CallResultRecord> records = List.of(
            record(1, "a", 1, CallKind.Stage.MAPPING, new CallScore(3, 1, 0, 0, 0), 100, List.of(attempt(80, 10L, 2L))),
            record(2, "a", 1, CallKind.Stage.MAPPING, new CallScore(2, 2, 0, 0, 0), 100, List.of(attempt(80, 10L, 2L))),
            failed(3, "a", 1, CallKind.Stage.MAPPING, 100, List.of()));

        RunReport report = new RunReporter().report(run, records);

        assertThat(report.repetitions()).containsExactly(
            new RunReport.RepetitionQuality(1, 0.75, Map.of()), new RunReport.RepetitionQuality(2, 0.5, Map.of()),
            new RunReport.RepetitionQuality(3, null, Map.of()));
    }

    @Test
    @DisplayName("원자료에서 정확도, 시간 분포, 처리량, 실패율, 토큰을 다시 계산하고 미관측 토큰은 0으로 채우지 않는다")
    void recomputesFromRawRecords() {
        EvaluationRun run = run(AT.minusSeconds(10), AT, AT.plusSeconds(4));
        List<CallResultRecord> records = List.of(
            record(1, "a", 1, CallKind.Stage.PREPARATION, new CallScore(1, 0, 0, 0, 0), 100,
                List.of(attempt(80, 10L, 2L))),
            record(1, "a", 2, CallKind.Stage.MAPPING, new CallScore(1, 1, 0, 0, 0), 300,
                List.of(attempt(150, 20L, 4L), attempt(120, 30L, 6L))),
            failed(1, "b", 1, CallKind.Stage.MAPPING, 900,
                List.of(new Attempt("jev", "answer", 800 * MS, 429, Outcome.HTTP_ERROR, null, null, null))));

        RunReport report = new RunReporter().report(run, records);

        // 항목 단위: 맞힌 2개 ÷ 채점한 3개. 보고는 어떤 채점식으로 계산했는지 함께 준다.
        assertThat(report.quality().accuracy()).isEqualTo(2.0 / 3);
        assertThat(report.scoringVersion()).isEqualTo(RunService.SCORING_VERSION);
        assertThat(report.quality().preparationAccuracy()).isEqualTo(1.0);
        assertThat(report.quality().mappingAccuracy()).isEqualTo(0.5);
        assertThat(report.quality().failureRate()).isEqualTo(1.0 / 3);
        assertThat(report.timing().queueWaitMs()).isEqualTo(10_000L);
        assertThat(report.timing().elapsedMs()).isEqualTo(4_000L);
        RunReport.Distribution mapping = report.performance().get("MAPPING").productCall();
        assertThat(mapping.count()).isEqualTo(2);
        assertThat(mapping.meanMs()).isEqualTo(600.0);
        assertThat(mapping.p50Ms()).isEqualTo(300.0);
        assertThat(mapping.p95Ms()).isEqualTo(900.0);
        assertThat(report.performance().get("MAPPING").failureRate()).isEqualTo(0.5);
        assertThat(report.performance().get("TOTAL").throughputPerSecond()).isEqualTo(0.5);
        // 배치로 나눈 성공 호출은 실패가 아니다. 429 같은 실패 시도만 센다.
        assertThat(report.performance().get("MAPPING").failedAttempts()).isEqualTo(1);
        assertThat(report.performance().get("MAPPING").failedAttemptMs()).isEqualTo(800.0);
        RunReport.Tokens tokens = report.tokens().get("MAPPING");
        assertThat(tokens.observedAttempts()).isEqualTo(2);
        assertThat(tokens.unobservedAttempts()).isEqualTo(1);
        assertThat(tokens.inputTotal()).isEqualTo(50L);
        assertThat(tokens.inputMean()).isEqualTo(25.0);
    }

    @Test
    @DisplayName("준비만 있는 처음 화면은 같은 반복의 펼쳐진 화면마다 앞에 붙어 자동기입 1번이 되고, 어느 쪽이든 실패하면 실패 자동기입이다")
    void autofillJoinsPreparationOnlyStartWithEachBranch() {
        List<CallResultRecord> records = List.of(
            call(1, "start", 1, CallKind.SECTION_CLASSIFY, CallKind.Stage.PREPARATION, 100, List.of(attempt(90, 10L, 1L))),
            call(1, "start", 2, CallKind.INTERACTION_DECISION, CallKind.Stage.PREPARATION, 200, List.of(attempt(190, 20L, 2L))),
            call(1, "high", 1, CallKind.SECTION_CLASSIFY, CallKind.Stage.PREPARATION, 50, List.of(attempt(40, 5L, 1L))),
            call(1, "high", 2, CallKind.GENERIC_FIELDS, CallKind.Stage.MAPPING, 300, List.of(attempt(280, 100L, 10L))),
            call(1, "ged", 1, CallKind.SECTION_CLASSIFY, CallKind.Stage.PREPARATION, 50, List.of(attempt(40, 5L, 1L))),
            failed(1, "ged", 2, CallKind.Stage.MAPPING, 400, List.of()),
            failed(2, "start", 1, CallKind.Stage.PREPARATION, 10, List.of()),
            call(2, "high", 1, CallKind.SECTION_CLASSIFY, CallKind.Stage.PREPARATION, 50, List.of()),
            call(2, "high", 2, CallKind.GENERIC_FIELDS, CallKind.Stage.MAPPING, 300, List.of()));

        RunReport.Flows flows = new RunReporter().report(run(AT, AT, AT.plusSeconds(1)), records).flows();

        // 반복 1: 처음(300) + 고등학교(350) = 650, 처음(300) + 검정고시(450, 실패) = 750. 반복 2: 처음(10, 실패) + 고등학교(350) = 360.
        assertThat(flows.count()).isEqualTo(3);
        assertThat(flows.time().meanMs()).isEqualTo((650.0 + 750.0 + 360.0) / 3);
        assertThat(flows.failureRate()).isEqualTo(2.0 / 3);
        // 토큰은 자동기입 1번에 쓴 양: 처음 화면 준비(30, 3) + 펼쳐진 화면(105, 11 또는 5, 1)의 평균. 관측한 시도만 더한다.
        assertThat(flows.inputTokensMean()).isEqualTo((135.0 + 35.0 + 0.0) / 3);
        assertThat(flows.outputTokensMean()).isEqualTo((14.0 + 4.0 + 0.0) / 3);
    }

    @Test
    @DisplayName("준비만 있는 처음 화면은 같은 사이트의 펼쳐진 화면에만 붙고 다른 사이트 화면은 그대로 자동기입 1번이다")
    void preparationStartJoinsOnlyBranchesOfTheSameSite() {
        List<CallResultRecord> records = List.of(
            call(1, "start", 1, CallKind.SECTION_CLASSIFY, CallKind.Stage.PREPARATION, 100, List.of()),
            call(1, "high", 1, CallKind.GENERIC_FIELDS, CallKind.Stage.MAPPING, 300, List.of()),
            call(1, "other", 1, CallKind.SECTION_CLASSIFY, CallKind.Stage.PREPARATION, 20, List.of()),
            call(1, "other", 2, CallKind.GENERIC_FIELDS, CallKind.Stage.MAPPING, 500, List.of()));
        Map<String, String> sites = Map.of("start", "a", "high", "a", "other", "b");

        RunReport.Flows flows = new RunReporter().report(run(AT, AT, AT.plusSeconds(1)), records, record -> null,
            sites::get).flows();

        // 사이트 a: 처음(100) + 고등학교(300) = 400. 사이트 b: 처음 화면 없이 520.
        assertThat(flows.count()).isEqualTo(2);
        assertThat(flows.time().meanMs()).isEqualTo((400.0 + 520.0) / 2);
    }

    @Test
    @DisplayName("모든 사례에 칸 매핑이 있으면(이전 데이터셋) 사례 하나가 자동기입 1번이다")
    void everyCompleteCaseIsOneAutofill() {
        List<CallResultRecord> records = List.of(
            call(1, "a", 1, CallKind.SECTION_CLASSIFY, CallKind.Stage.PREPARATION, 100, List.of()),
            call(1, "a", 2, CallKind.GENERIC_FIELDS, CallKind.Stage.MAPPING, 300, List.of()),
            failed(1, "b", 1, CallKind.Stage.MAPPING, 50, List.of()));

        RunReport report = new RunReporter().report(run(AT, AT, AT.plusSeconds(1)), records);

        assertThat(report.flows().count()).isEqualTo(2);
        assertThat(report.flows().failureRate()).isEqualTo(0.5);
        assertThat(report.flows().time().meanMs()).isEqualTo(225.0);
    }

    @Test
    @DisplayName("실패한 호출의 칸은 사용자에게 비어 있으므로 빼지 않고, 정답이 있으면 놓침, 없으면 맞게 비움으로 센다")
    void failedCallsCountAsUnanswered() {
        Map<String, String> truth = new java.util.HashMap<>();
        truth.put("x", "k1");
        truth.put("y", null);
        List<CallResultRecord> records = List.of(fields(1, Map.of("x", ObservedItem.answered("k1", 0.9), "y", ObservedItem.answered(null, 0.9))),
            failed(1, "b", 1, CallKind.Stage.MAPPING, 50, List.of()));

        RunReport report = new RunReporter().report(run(AT, AT, AT.plusSeconds(1)), records, record -> truth, caseId -> "site");

        AutofillOutcome expected = new AutofillOutcome(1, 0, 0, 2, 1, 0);
        assertThat(report.scores().get("TOTAL").counts()).isEqualTo(expected);
        assertThat(report.scores().get("MAPPING").counts()).isEqualTo(expected);
        assertThat(report.autofill().counts()).isEqualTo(expected);
        assertThat(report.autofill().fillRate()).isEqualTo(0.5);
    }

    @Test
    @DisplayName("칸 매핑 답을 확신도 기준별로 다시 나눠 기준이 정밀도와 채움률을 어떻게 바꾸는지 보인다")
    void reportsConfidenceSweep() {
        Map<String, String> truth = Map.of("x", "k1", "y", "k2", "z", "k3");
        List<CallResultRecord> records = List.of(fields(1, Map.of("x", ObservedItem.answered("k1", 0.95),
            "y", ObservedItem.answered("k2", 0.65), "z", ObservedItem.answered("wrong", 0.55))));

        RunReport report = new RunReporter().report(run(AT, AT, AT.plusSeconds(1)), records, record -> truth, caseId -> "site");

        assertThat(report.confidence()).extracting(RunReport.ConfidencePoint::threshold)
            .containsExactly(0.5, 0.6, 0.7, 0.8, 0.9);
        RunReport.ConfidencePoint lowest = report.confidence().getFirst();
        assertThat(lowest.precision()).isCloseTo(2.0 / 3, within(1e-9));
        assertThat(lowest.fillRate()).isCloseTo(2.0 / 3, within(1e-9));
        RunReport.ConfidencePoint current = report.confidence().get(3);
        assertThat(current.precision()).isEqualTo(1.0);
        assertThat(lowest.counts().filledCorrect()).isEqualTo(2);
        assertThat(lowest.counts().filledWrongKey()).isEqualTo(1);
        assertThat(current.counts().filledCorrect()).isEqualTo(1);
        assertThat(current.counts().filledWrongKey()).isZero();
        assertThat(current.fillRate()).isCloseTo(1.0 / 3, within(1e-9));
        assertThat(current.score()).isEqualTo(report.autofill().score());
    }

    @Test
    @DisplayName("확신도를 기록하지 않은 실행은 기준별로 나눌 수 없다")
    void confidenceSweepNeedsRecordedConfidence() {
        List<CallResultRecord> records = List.of(fields(1, Map.of("x", ObservedItem.answered("k1"))));

        RunReport report = new RunReporter().report(run(AT, AT, AT.plusSeconds(1)), records, record -> Map.of("x", "k1"), caseId -> "site");

        assertThat(report.confidence()).isEmpty();
    }

    @Test
    @DisplayName("입력 토큰 초과로 거절된 시도를 다른 실패 시도와 구분해 센다")
    void countsTokenLimitAttempts() {
        Attempt tokenLimit = new Attempt("jev", "answer", 10 * MS, 400, Outcome.TOKEN_LIMIT, null, null, null);
        Attempt rateLimit = new Attempt("jev", "answer", 10 * MS, 429, Outcome.HTTP_ERROR, null, null, null);
        List<CallResultRecord> records = List.of(record(1, "a", 1, CallKind.Stage.MAPPING, new CallScore(1, 0, 0, 0, 0), 100,
            List.of(tokenLimit, tokenLimit, rateLimit, attempt(50, 10L, 1L))));

        RunReport report = new RunReporter().report(run(AT, AT, AT.plusSeconds(1)), records);

        assertThat(report.performance().get("TOTAL").tokenLimitAttempts()).isEqualTo(2);
        assertThat(report.performance().get("TOTAL").failedAttempts()).isEqualTo(3);
    }

    @Test
    @DisplayName("결과가 없으면 정확도와 분포는 null이다")
    void emptyRunIsUnmeasured() {
        RunReport report = new RunReporter().report(run(AT, null, null), List.of());

        assertThat(report.quality().accuracy()).isNull();
        assertThat(report.performance().get("TOTAL").productCall().meanMs()).isNull();
        assertThat(report.timing().elapsedMs()).isNull();
        assertThat(report.tokens().get("TOTAL").inputMean()).isNull();
    }

    @Test
    @DisplayName("첫 반복과 나머지 반복의 평균 호출 시간을 따로 보고한다")
    void separatesFirstRepetition() {
        List<CallResultRecord> records = List.of(
            record(1, "a", 1, CallKind.Stage.MAPPING, new CallScore(1, 0, 0, 0, 0), 400, List.of()),
            record(2, "a", 1, CallKind.Stage.MAPPING, new CallScore(1, 0, 0, 0, 0), 100, List.of()),
            record(3, "a", 1, CallKind.Stage.MAPPING, new CallScore(1, 0, 0, 0, 0), 200, List.of()));

        RunReport report = new RunReporter().report(run(AT, AT, AT.plusSeconds(1)), records);

        assertThat(report.timing().firstRepetitionMeanMs()).isEqualTo(400.0);
        assertThat(report.timing().laterRepetitionsMeanMs()).isEqualTo(150.0);
    }

    private static EvaluationRun run(Instant requested, Instant started, Instant finished) {
        return new EvaluationRun("run-1", "fp", RunStoreContract.run("run-1", "fp").versions(), 1, 3, 3, "tester",
            requested, finished == null ? RunStatus.QUEUED : RunStatus.PARTIAL, started, finished, 3, false, null,
            null, null);
    }

    private static Attempt attempt(long ms, Long input, Long output) {
        return new Attempt("jev", "answer", ms * MS, 200, Outcome.SUCCESS, input, output, "jev-x");
    }

    /** 단계에 맞는 실제 호출 종류: 준비는 섹션 분류, 매핑은 칸 매핑. */
    private static CallKind kindOf(CallKind.Stage stage) {
        return stage == CallKind.Stage.PREPARATION ? CallKind.SECTION_CLASSIFY : CallKind.GENERIC_FIELDS;
    }

    private static CallResultRecord record(int repetition, String caseId, int order, CallKind.Stage stage,
        CallScore score, long ms, List<Attempt> attempts) {
        return new CallResultRecord("run-1", repetition, caseId, order, kindOf(stage), stage, null, score,
            Map.of(), ms * MS, attempts, AT);
    }

    private static CallResultRecord call(int repetition, String caseId, int order, CallKind kind, CallKind.Stage stage,
        long ms, List<Attempt> attempts) {
        return new CallResultRecord("run-1", repetition, caseId, order, kind, stage, null, new CallScore(1, 0, 0, 0, 0),
            Map.of(), ms * MS, attempts, AT);
    }

    private static CallResultRecord fields(int repetition, Map<String, ObservedItem> observed) {
        return new CallResultRecord("run-1", repetition, "a", 2, CallKind.GENERIC_FIELDS, CallKind.Stage.MAPPING, null,
            new CallScore(1, 0, 0, 0, 0), observed, 100 * MS, List.of(), AT);
    }

    private static CallResultRecord failed(int repetition, String caseId, int order, CallKind.Stage stage, long ms,
        List<Attempt> attempts) {
        return new CallResultRecord("run-1", repetition, caseId, order, kindOf(stage), stage,
            FailureKind.API_ERROR, null, Map.of(), ms * MS, attempts, AT);
    }
}
