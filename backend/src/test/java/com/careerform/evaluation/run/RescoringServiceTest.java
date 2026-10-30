package com.careerform.evaluation.run;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import com.careerform.evaluation.dataset.CaseCall;
import com.careerform.evaluation.dataset.EvaluationCase;
import com.careerform.evaluation.dataset.LoadedDataset;
import com.careerform.evaluation.scoring.CallKind;
import com.careerform.evaluation.scoring.CallScore;
import com.careerform.evaluation.scoring.FailureKind;
import com.careerform.evaluation.scoring.ObservedItem;
import tools.jackson.databind.json.JsonMapper;

@DisplayName("평가 결과 재채점 이력")
class RescoringServiceTest {

    private static final Instant AT = Instant.parse("2026-10-30T03:00:00Z");
    private final InMemoryRunStore runs = new InMemoryRunStore();
    private final InMemoryResultStore results = new InMemoryResultStore();
    private final InMemoryScoringStore scorings = new InMemoryScoringStore();

    @Test
    @DisplayName("저장한 답을 데이터셋 정답으로 다시 채점해 새 기록을 추가하고 원래 결과와 이전 채점은 그대로 둔다")
    void rescoringAppendsHistory() {
        EvaluationRun run = RunStoreContract.run("run-1", "fp");
        runs.register(run);
        CallResultRecord stored = new CallResultRecord("run-1", 1, "a", 1, CallKind.GENERIC_FIELDS,
            CallKind.Stage.MAPPING, null, new CallScore(0, 0, 0, 0, 0),
            Map.of("field-1", ObservedItem.answered("contact.contact.email"), "field-2", ObservedItem.answered(null)),
            1L, List.of(), AT);
        results.append(stored);
        results.append(new CallResultRecord("run-1", 1, "a", 2, CallKind.SECTION_CLASSIFY, CallKind.Stage.MAPPING,
            FailureKind.TIMEOUT, null, Map.of(), 1L, List.of(), AT));
        RescoringService service = service(dataset(run.versions().datasetDigest()));

        Scoring first = service.rescore("run-1", "tester");
        Scoring second = service.rescore("run-1", "tester");

        assertThat(first.aggregate().accuracy()).isEqualTo(0.5);
        assertThat(first.aggregate().failureRate()).isEqualTo(0.5);
        assertThat(first.scoringVersion()).isEqualTo(RunService.SCORING_VERSION);
        assertThat(scorings.list("run-1")).extracting(Scoring::id).containsExactly(first.id(), second.id());
        assertThat(results.list("run-1").getFirst()).isEqualTo(stored);
    }

    @Test
    @DisplayName("실행 때와 다른 데이터셋으로는 재채점하지 않는다")
    void refusesDifferentDataset() {
        runs.register(RunStoreContract.run("run-1", "fp"));

        assertThatThrownBy(() -> service(dataset("other-digest")).rescore("run-1", "tester"))
            .isInstanceOfSatisfying(RunRejected.class,
                rejected -> assertThat(rejected.code()).isEqualTo(RunRejected.Code.UNKNOWN_DATASET));
    }

    private RescoringService service(LoadedDataset dataset) {
        return new RescoringService(runs, results, scorings, (id, version) -> dataset,
            Clock.fixed(AT, ZoneOffset.UTC));
    }

    private static LoadedDataset dataset(String digest) {
        var json = JsonMapper.builder().build();
        return new LoadedDataset("generic-matching", 1, digest, List.of(new EvaluationCase("a", "tuning", "s", "a",
            "p", List.of(
                new CaseCall(1, CallKind.Stage.MAPPING, CallKind.GENERIC_FIELDS, "/f", "d", json.readTree("{}"),
                    Map.of("field-1", "contact.contact.email", "field-2", "careers.career.companyName"), 1),
                new CaseCall(2, CallKind.Stage.MAPPING, CallKind.SECTION_CLASSIFY, "/c", "d", json.readTree("{}"),
                    Map.of("gs1", "PERSONAL"), 1)))));
    }
}
