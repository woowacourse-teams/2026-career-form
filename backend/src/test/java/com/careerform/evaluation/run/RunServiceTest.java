package com.careerform.evaluation.run;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import com.careerform.evaluation.prompt.PromptCatalog;
import com.careerform.formanalysis.application.PromptSource;

@DisplayName("평가 실행 등록과 상태 관리")
class RunServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-30T03:00:00Z");
    private final InMemoryRunStore store = new InMemoryRunStore();
    private final MutablePrompt prompt = new MutablePrompt("Map fields.{questionId} safely.");
    private final RunService service = new RunService(store, catalog(), new PromptCatalog(), List.of(prompt),
        settings(200), Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    @DisplayName("등록하면 QUEUED 상태와 데이터셋·프롬프트·코드·설정·채점 기준 버전을 저장한다")
    void registersQueuedRunWithVersions() {
        EvaluationRun run = service.register(request(2, Map.of(), "v1"), "tester");

        assertThat(run.status()).isEqualTo(RunStatus.QUEUED);
        assertThat(run.requestedBy()).isEqualTo("tester");
        assertThat(run.requestedAt()).isEqualTo(NOW);
        assertThat(run.repetitions()).isEqualTo(2);
        assertThat(run.plannedCalls()).isEqualTo(6);
        assertThat(run.estimatedModelCalls()).isEqualTo(20);
        RunVersions versions = run.versions();
        assertThat(versions.datasetDigest()).isEqualTo("dataset-digest");
        assertThat(versions.split()).isEqualTo("tuning");
        assertThat(versions.promptDigest()).matches("[0-9a-f]{64}");
        assertThat(versions.promptVersion()).isEqualTo("v1");
        assertThat(versions.codeVersion()).isEqualTo("image@sha256:abc");
        assertThat(versions.provider()).isEqualTo("jev");
        assertThat(versions.scoringVersion()).isEqualTo(RunService.SCORING_VERSION);
        assertThat(versions.settings()).containsEntry("field-batch-size", "5").containsEntry("section-concurrency", "3");
        assertThat(store.find(run.id())).contains(run);
        assertThat(store.findPromptSnapshot(versions.promptDigest())).isPresent();
    }

    @Test
    @DisplayName("진행 중인 실행이 있으면 새 등록을 거부하고 기존 실행 ID와 같은 지문 여부를 알려 준다")
    void rejectsWhileAnotherRunIsActive() {
        EvaluationRun first = service.register(request(1, Map.of(), null), "tester");

        assertThatThrownBy(() -> service.register(request(1, Map.of(), null), "other"))
            .isInstanceOfSatisfying(RunRejected.class, rejected -> {
                assertThat(rejected.code()).isEqualTo(RunRejected.Code.RUN_ACTIVE);
                assertThat(rejected.activeRunId()).isEqualTo(first.id());
                assertThat(rejected.sameFingerprint()).isTrue();
            });
        assertThatThrownBy(() -> service.register(request(3, Map.of(), null), "other"))
            .isInstanceOfSatisfying(RunRejected.class, rejected -> assertThat(rejected.sameFingerprint()).isFalse());
    }

    @Test
    @DisplayName("끝난 실행 뒤에는 같은 조건으로 다시 등록할 수 있다")
    void allowsRerunAfterTerminalState() {
        EvaluationRun first = service.register(request(1, Map.of(), null), "tester");
        service.cancel(first.id());

        EvaluationRun second = service.register(request(1, Map.of(), null), "tester");

        assertThat(second.id()).isNotEqualTo(first.id());
        assertThat(second.fingerprint()).isEqualTo(first.fingerprint());
    }

    @Test
    @DisplayName("예상 모델 호출 수가 실행당 한도를 넘으면 거부한다")
    void rejectsOverBudget() {
        RunService tight = new RunService(store, catalog(), new PromptCatalog(), List.of(prompt), settings(39),
            Clock.fixed(NOW, ZoneOffset.UTC));

        assertThatThrownBy(() -> tight.register(request(4, Map.of(), null), "tester"))
            .isInstanceOfSatisfying(RunRejected.class,
                rejected -> assertThat(rejected.code()).isEqualTo(RunRejected.Code.BUDGET_EXCEEDED));
        assertThat(store.all()).isEmpty();
    }

    @Test
    @DisplayName("데이터셋, 분할, 반복 수, 설정 덮어쓰기를 검증한다")
    void validatesRequest() {
        assertCode(new RunRequest("missing", 1, "tuning", 1, null, Map.of()), RunRejected.Code.UNKNOWN_DATASET);
        assertCode(new RunRequest("generic-matching", 1, "holdout", 1, null, Map.of()), RunRejected.Code.UNKNOWN_SPLIT);
        assertCode(request(0, Map.of(), null), RunRejected.Code.INVALID_REPETITIONS);
        assertCode(request(21, Map.of(), null), RunRejected.Code.INVALID_REPETITIONS);
        assertCode(request(1, Map.of("timeout-ms", 1), null), RunRejected.Code.INVALID_OVERRIDE);
        assertCode(request(1, Map.of("field-batch-size", 129), null), RunRejected.Code.INVALID_OVERRIDE);
        assertCode(request(1, Map.of("section-concurrency", 0), null), RunRejected.Code.INVALID_OVERRIDE);
        assertCode(request(1, Map.of(), "v 1!"), RunRejected.Code.INVALID_PROMPT_VERSION);
    }

    @Test
    @DisplayName("설정 덮어쓰기는 지문과 버전 설정에 반영된다")
    void overridesChangeFingerprint() {
        EvaluationRun base = service.register(request(1, Map.of(), null), "tester");
        service.cancel(base.id());

        EvaluationRun batched = service.register(request(1, Map.of("field-batch-size", 10), null), "tester");

        assertThat(batched.versions().settings()).containsEntry("field-batch-size", "10");
        assertThat(batched.fingerprint()).isNotEqualTo(base.fingerprint());
    }

    @Test
    @DisplayName("프롬프트 문구가 바뀌면 다른 프롬프트 해시로 등록되고 두 버전의 전문이 모두 남는다")
    void promptChangeCreatesNewDigest() {
        EvaluationRun before = service.register(request(1, Map.of(), "v1"), "tester");
        service.cancel(before.id());
        prompt.text = "Map fields.{questionId} carefully.";

        EvaluationRun after = service.register(request(1, Map.of(), "v2"), "tester");

        assertThat(after.versions().promptDigest()).isNotEqualTo(before.versions().promptDigest());
        assertThat(store.findPromptSnapshot(before.versions().promptDigest()).orElseThrow().parts())
            .containsValue("Map fields.{questionId} safely.");
        assertThat(store.findPromptSnapshot(after.versions().promptDigest()).orElseThrow().parts())
            .containsValue("Map fields.{questionId} carefully.");
    }

    @Test
    @DisplayName("대기 중 취소는 바로 CANCELLED, 실행 중 취소는 요청 표시만 남기고, 끝난 실행은 그대로 둔다")
    void cancelDependsOnState() {
        EvaluationRun queued = service.register(request(1, Map.of(), null), "tester");
        assertThat(service.cancel(queued.id()).status()).isEqualTo(RunStatus.CANCELLED);
        assertThat(service.cancel(queued.id()).status()).isEqualTo(RunStatus.CANCELLED);

        EvaluationRun running = service.register(request(1, Map.of(), null), "tester");
        assertThat(store.transition(running.id(), RunStatus.QUEUED, RunStatus.RUNNING, NOW)).isTrue();
        EvaluationRun requested = service.cancel(running.id());
        assertThat(requested.status()).isEqualTo(RunStatus.RUNNING);
        assertThat(requested.cancelRequested()).isTrue();

        assertThatThrownBy(() -> service.cancel("missing"))
            .isInstanceOfSatisfying(RunRejected.class,
                rejected -> assertThat(rejected.code()).isEqualTo(RunRejected.Code.UNKNOWN_RUN));
    }

    private void assertCode(RunRequest request, RunRejected.Code code) {
        assertThatThrownBy(() -> service.register(request, "tester"))
            .isInstanceOfSatisfying(RunRejected.class, rejected -> assertThat(rejected.code()).isEqualTo(code));
    }

    private static RunRequest request(int repetitions, Map<String, Integer> overrides, String promptVersion) {
        return new RunRequest("generic-matching", 1, "tuning", repetitions, promptVersion, overrides);
    }

    private static DatasetCatalog catalog() {
        return (id, version) -> "generic-matching".equals(id) && version == 1
            ? Optional.of(new DatasetCatalog.DatasetSummary(id, version, "dataset-digest",
                Map.of("tuning", new DatasetCatalog.SplitSummary(1, 3, 10),
                    "final", new DatasetCatalog.SplitSummary(1, 4, 12))))
            : Optional.empty();
    }

    private static EvaluationSettings settings(int maxModelCalls) {
        return new EvaluationSettings(maxModelCalls, 20, "jev", "jev-latest", "image@sha256:abc",
            Map.of("field-batch-size", 5, "section-concurrency", 3, "max-concurrent", 10, "timeout-ms", 8000));
    }

    private static final class MutablePrompt implements PromptSource {
        private String text;

        private MutablePrompt(String text) {
            this.text = text;
        }

        @Override public String promptSourceId() { return "test"; }
        @Override public Map<String, String> promptParts() { return Map.of("instructions", text); }
    }
}
