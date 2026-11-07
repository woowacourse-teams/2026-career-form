package com.careerform.evaluation.run;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import com.careerform.evaluation.scoring.CallKind;
import com.careerform.evaluation.scoring.AutofillCounts;
import com.careerform.evaluation.scoring.CallScore;
import com.careerform.evaluation.scoring.FailureKind;
import com.careerform.evaluation.scoring.ObservedItem;
import com.careerform.monitoring.ModelCallRecording.Attempt;
import com.careerform.monitoring.ModelCallRecording.Outcome;

/** 메모리와 Mongo 결과 저장소가 함께 지키는 저장 계약. */
abstract class ResultStoreContract {

    private static final Instant AT = Instant.parse("2026-10-30T03:00:00Z");

    protected abstract ResultStore store();

    @Test
    @DisplayName("같은 호출 키는 한 번만 저장하고 처음 저장한 결과를 유지한다")
    void appendIsWriteOnce() {
        ResultStore store = store();

        assertThat(store.append(scored("run-1", 1, 3))).isTrue();
        assertThat(store.append(scored("run-1", 1, 0))).isFalse();
        assertThat(store.append(scored("run-2", 1, 0))).isTrue();

        assertThat(store.list("run-1")).singleElement()
            .satisfies(record -> assertThat(record.score().correct()).isEqualTo(3));
    }

    @Test
    @DisplayName("고른 실행의 결과만 지우고 지운 수를 돌려준다")
    void deletesResultsOfRuns() {
        ResultStore store = store();
        store.append(scored("run-1", 1, 3));
        store.append(scored("run-1", 2, 3));
        store.append(scored("run-2", 1, 3));

        assertThat(store.delete(List.of("run-1"))).isEqualTo(2);
        assertThat(store.list("run-1")).isEmpty();
        assertThat(store.list("run-2")).hasSize(1);
    }

    @Test
    @DisplayName("답, 실패 원인, 시간, 토큰(미관측은 null)을 그대로 읽는다")
    void roundTripsRecord() {
        ResultStore store = store();
        CallResultRecord scored = scored("run-1", 1, 2);
        CallResultRecord failed = new CallResultRecord("run-1", 1, "case-a", 2, CallKind.GENERIC_FIELDS,
            CallKind.Stage.MAPPING, FailureKind.TIMEOUT, null, Map.of(), 9_000L,
            List.of(new Attempt("jev", "answer", 8_000L, null, Outcome.TIMEOUT, null, null, null)), AT.plusSeconds(1));
        store.append(scored);
        store.append(failed);

        assertThat(store.list("run-1")).containsExactly(scored, failed);
    }

    @Test
    @DisplayName("칸별 확신도와 자동기입 결과를 그대로 읽고, 없던 기록은 null로 읽는다")
    void roundTripsConfidenceAndAutofill() {
        ResultStore store = store();
        CallResultRecord withAutofill = new CallResultRecord("run-2", 1, "case-a", 1, CallKind.GENERIC_FIELDS,
            CallKind.Stage.MAPPING, null, new CallScore(1, 0, 0, 0, 0),
            Map.of("field-1", ObservedItem.answered("contact.contact.email", 0.93)), 1_000L, List.of(), AT,
            new AutofillCounts(1, 0, 0, 0, 0, 0));
        store.append(withAutofill);
        store.append(scored("run-2", 2, 1));

        assertThat(store.list("run-2")).containsExactly(withAutofill, scored("run-2", 2, 1));
        assertThat(store.list("run-2").get(1).autofill()).isNull();
    }

    static CallResultRecord scored(String runId, int order, int correct) {
        return new CallResultRecord(runId, 1, "case-a", order, CallKind.SECTION_CLASSIFY, CallKind.Stage.PREPARATION,
            null, new CallScore(correct, 1, 0, 0, 1),
            Map.of("ls1", ObservedItem.answered("SENSITIVE"), "ls2", ObservedItem.answered(null),
                "ls3", ObservedItem.unavailable()),
            1_234L, List.of(new Attempt("jev", "answer", 1_000L, 200, Outcome.SUCCESS, 120L, 4L, "jev-x")), AT);
    }
}
