package com.careerform.evaluation.run;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import com.careerform.evaluation.scoring.CallKind;
import com.careerform.evaluation.scoring.CallScore;
import com.careerform.evaluation.scoring.FailureKind;
import com.careerform.monitoring.ModelCallRecording.Attempt;
import com.careerform.monitoring.ModelCallRecording.Outcome;

@DisplayName("평가 실행 결과 보고")
class RunReporterTest {

    private static final Instant AT = Instant.parse("2026-10-30T03:00:00Z");
    private static final long MS = 1_000_000L;

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

        assertThat(report.quality().accuracy()).isEqualTo(0.75);
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
        assertThat(report.performance().get("MAPPING").retriedAttempts()).isEqualTo(1);
        RunReport.Tokens tokens = report.tokens().get("MAPPING");
        assertThat(tokens.observedAttempts()).isEqualTo(2);
        assertThat(tokens.unobservedAttempts()).isEqualTo(1);
        assertThat(tokens.inputTotal()).isEqualTo(50L);
        assertThat(tokens.inputMean()).isEqualTo(25.0);
    }

    @Test
    @DisplayName("사례 하나의 흐름 시간은 그 사례 호출 시간의 합이고 호출이 하나라도 실패하면 실패 흐름이다")
    void reportsFlows() {
        List<CallResultRecord> records = List.of(
            record(1, "a", 1, CallKind.Stage.PREPARATION, new CallScore(1, 0, 0, 0, 0), 100, List.of()),
            record(1, "a", 2, CallKind.Stage.MAPPING, new CallScore(1, 0, 0, 0, 0), 300, List.of()),
            failed(1, "b", 1, CallKind.Stage.MAPPING, 50, List.of()));

        RunReport report = new RunReporter().report(run(AT, AT, AT.plusSeconds(1)), records);

        assertThat(report.flows().count()).isEqualTo(2);
        assertThat(report.flows().failureRate()).isEqualTo(0.5);
        assertThat(report.flows().time().meanMs()).isEqualTo(225.0);
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

    private static CallResultRecord record(int repetition, String caseId, int order, CallKind.Stage stage,
        CallScore score, long ms, List<Attempt> attempts) {
        return new CallResultRecord("run-1", repetition, caseId, order, CallKind.GENERIC_FIELDS, stage, null, score,
            Map.of(), ms * MS, attempts, AT);
    }

    private static CallResultRecord failed(int repetition, String caseId, int order, CallKind.Stage stage, long ms,
        List<Attempt> attempts) {
        return new CallResultRecord("run-1", repetition, caseId, order, CallKind.GENERIC_FIELDS, stage,
            FailureKind.API_ERROR, null, Map.of(), ms * MS, attempts, AT);
    }
}
