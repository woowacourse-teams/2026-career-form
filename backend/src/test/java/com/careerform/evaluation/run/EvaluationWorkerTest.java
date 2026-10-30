package com.careerform.evaluation.run;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.function.Function;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import com.careerform.evaluation.dataset.DatasetLoader;
import com.careerform.evaluation.prompt.PromptCatalog;
import com.careerform.evaluation.scoring.CallKind;
import com.careerform.evaluation.scoring.FailureKind;
import com.careerform.formanalysis.application.PromptSource;
import com.careerform.monitoring.ModelCallRecording;
import com.careerform.monitoring.ModelCallRecording.Attempt;
import com.careerform.monitoring.ModelCallRecording.Outcome;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@DisplayName("평가 실행 작업자")
class EvaluationWorkerTest {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Instant NOW = Instant.parse("2026-10-30T03:00:00Z");
    private static final PromptSource PROMPT = new PromptSource() {
        @Override public String promptSourceId() { return "p"; }
        @Override public Map<String, String> promptParts() { return Map.of("instructions", "Map {questionId}."); }
    };

    private final InMemoryRunStore runs = new InMemoryRunStore();
    private final InMemoryResultStore results = new InMemoryResultStore();
    private final List<String> executed = new ArrayList<>();

    @Test
    @DisplayName("사례의 호출을 반복마다 기록 순서대로 실행하고 호출별 결과를 저장한다")
    void executesInRecordedOrder() {
        EvaluationRun run = register(2);

        assertThat(worker(answerAll(), 100).runOnce()).isTrue();

        assertThat(executed).containsExactly("SECTION_CLASSIFY", "GENERIC_FIELDS", "SECTION_CLASSIFY", "GENERIC_FIELDS");
        EvaluationRun done = runs.find(run.id()).orElseThrow();
        assertThat(done.status()).isEqualTo(RunStatus.COMPLETED);
        assertThat(done.processedCalls()).isEqualTo(4);
        assertThat(results.list(run.id())).extracting(CallResultRecord::key)
            .containsExactly("1/a/1", "1/a/2", "2/a/1", "2/a/2");
        assertThat(results.list(run.id()).getFirst().attempts()).singleElement()
            .satisfies(attempt -> assertThat(attempt.inputTokens()).isEqualTo(10L));
        assertThat(worker(answerAll(), 100).runOnce()).isFalse();
    }

    @Test
    @DisplayName("중간 호출이 실패해도 다음 호출을 계속하고 끝나면 PARTIAL이다")
    void failedCallContinues() {
        EvaluationRun run = register(1);
        Function<CallKind, JsonNode> failingClassify = kind -> {
            if (kind == CallKind.SECTION_CLASSIFY) throw new IllegalStateException("down");
            return answerAll().apply(kind);
        };

        worker(failingClassify, 100).runOnce();

        assertThat(results.list(run.id())).extracting(CallResultRecord::failure)
            .containsExactly(FailureKind.API_ERROR, null);
        assertThat(runs.find(run.id()).orElseThrow().status()).isEqualTo(RunStatus.PARTIAL);
    }

    @Test
    @DisplayName("임대가 끝난 실행을 이어받으면 결과가 있는 호출은 다시 실행하지 않는다")
    void resumesWithoutRepeatingStoredCalls() {
        EvaluationRun run = register(1);
        runs.claim("crashed-worker", NOW.minusSeconds(600), Duration.ofMinutes(1));
        ExecutedCall first = new CallExecutor((kind, request, settings) -> answerAll().apply(kind))
            .execute(loader().load("synthetic", 1).cases().getFirst().calls().getFirst(), Map.of());
        results.append(CallResultRecord.of(run.id(), 1, "a", 1, first, NOW.minusSeconds(590)));

        assertThat(worker(answerAll(), 100).runOnce()).isTrue();

        assertThat(executed).containsExactly("GENERIC_FIELDS");
        assertThat(runs.find(run.id()).orElseThrow().status()).isEqualTo(RunStatus.COMPLETED);
    }

    @Test
    @DisplayName("취소 요청은 다음 호출 경계에서 CANCELLED로 끝내고 부분 결과를 남긴다")
    void cancelStopsAtNextCallBoundary() {
        EvaluationRun run = register(1);
        Function<CallKind, JsonNode> cancelAfterFirst = kind -> {
            runs.requestCancel(run.id());
            return answerAll().apply(kind);
        };

        worker(cancelAfterFirst, 100).runOnce();

        assertThat(executed).containsExactly("SECTION_CLASSIFY");
        assertThat(results.list(run.id())).hasSize(1);
        assertThat(runs.find(run.id()).orElseThrow().status()).isEqualTo(RunStatus.CANCELLED);
    }

    @Test
    @DisplayName("관측한 모델 호출 수가 실행 예산에 닿으면 멈추고 PARTIAL이다")
    void stopsAtModelCallBudget() {
        EvaluationRun run = register(2);

        worker(answerAll(), 2).runOnce();

        assertThat(executed).hasSize(2);
        assertThat(runs.find(run.id()).orElseThrow().status()).isEqualTo(RunStatus.PARTIAL);
    }

    @Test
    @DisplayName("등록 뒤 데이터셋이나 프롬프트가 바뀌었으면 실행하지 않고 FAILED다")
    void versionMismatchFails() {
        EvaluationRun run = register(1);
        PromptSource changed = new PromptSource() {
            @Override public String promptSourceId() { return "p"; }
            @Override public Map<String, String> promptParts() { return Map.of("instructions", "Changed."); }
        };

        new EvaluationWorker(runs, results, loader(), executor(answerAll()), new PromptCatalog(), List.of(changed),
            100, Clock.fixed(NOW, ZoneOffset.UTC), "worker", Duration.ofMinutes(5)).runOnce();

        assertThat(executed).isEmpty();
        assertThat(runs.find(run.id()).orElseThrow().status()).isEqualTo(RunStatus.FAILED);
    }

    @Test
    @DisplayName("실행 설정을 제품 호출에 넘긴다")
    void passesRunSettings() {
        register(1);
        List<Map<String, String>> seen = new ArrayList<>();
        CallExecutor recording = new CallExecutor((kind, request, settings) -> {
            seen.add(settings);
            return answerAll().apply(kind);
        });

        new EvaluationWorker(runs, results, loader(), recording, new PromptCatalog(), List.of(PROMPT), 100,
            Clock.fixed(NOW, ZoneOffset.UTC), "worker", Duration.ofMinutes(5)).runOnce();

        assertThat(seen).allSatisfy(settings -> assertThat(settings).containsEntry("field-batch-size", "5"));
    }

    private EvaluationWorker worker(Function<CallKind, JsonNode> responses, int maxModelCalls) {
        return new EvaluationWorker(runs, results, loader(), executor(responses), new PromptCatalog(), List.of(PROMPT),
            maxModelCalls, Clock.fixed(NOW, ZoneOffset.UTC), "worker", Duration.ofMinutes(5));
    }

    private CallExecutor executor(Function<CallKind, JsonNode> responses) {
        return new CallExecutor((kind, request, settings) -> {
            executed.add(kind.name());
            ModelCallRecording.record(new Attempt("jev", "answer", 1_000L, 200, Outcome.SUCCESS, 10L, 2L, "jev-x"));
            return responses.apply(kind);
        });
    }

    private EvaluationRun register(int repetitions) {
        RunService service = new RunService(runs, loader(), new PromptCatalog(), List.of(PROMPT),
            new EvaluationSettings(1000, 20, "jev", "jev-latest", "test", Map.of("field-batch-size", 5)),
            Clock.fixed(NOW.minusSeconds(60), ZoneOffset.UTC));
        return service.register(new RunRequest("synthetic", 1, "tuning", repetitions, "v1", Map.of()), "tester");
    }

    private static Function<CallKind, JsonNode> answerAll() {
        return kind -> JSON.readTree(kind == CallKind.SECTION_CLASSIFY
            ? "{\"status\": \"COMPLETE\", \"sections\": [{\"sectionId\": \"gs1\", \"category\": \"PERSONAL\"}]}"
            : "{\"status\": \"COMPLETE\", \"fields\": [{\"candidateId\": \"field-1\", \"profileFieldKey\": \"contact.contact.email\"}]}");
    }

    private static DatasetLoader loader() {
        Map<String, String> files = new HashMap<>();
        String ds = "evaluation/datasets/synthetic/v1/";
        files.put("evaluation/profiles/v1/p.json", "{}");
        files.put(ds + "cases/a.json", """
            {"schemaVersion": 1, "caseId": "a", "calls": [
             {"order": 1, "phase": "MAPPING", "kind": "SECTION_CLASSIFY", "endpoint": "/c", "requestDigest": "d1",
              "request": {"schemaVersion": 1}, "expected": {"gs1": "PERSONAL"}, "estimatedModelCalls": 1},
             {"order": 2, "phase": "MAPPING", "kind": "GENERIC_FIELDS", "endpoint": "/f", "requestDigest": "d2",
              "request": {"schemaVersion": 2}, "expected": {"field-1": "contact.contact.email"}, "estimatedModelCalls": 1}]}""");
        files.put(ds + "gt/a.json", "{}");
        Map<String, String> digests = new TreeMap<>();
        files.forEach((path, text) -> digests.put(path, sha(text)));
        files.put(ds + "manifest.json", """
            {"schemaVersion": 1, "datasetId": "synthetic", "version": 1,
             "profiles": [{"profileId": "p", "file": "evaluation/profiles/v1/p.json", "sha256": "%s"}],
             "cases": [{"caseId": "a", "split": "tuning", "siteId": "s", "state": "a", "profileId": "p",
               "file": "%scases/a.json", "sha256": "%s", "groundTruth": {"file": "%sgt/a.json", "sha256": "%s"},
               "fixture": {"id": "fx", "sha256": "f"},
               "review": {"privacy": "PASSED", "structure": "PASSED", "mappingTruth": "HUMAN_REVIEWED",
                 "preparationTruth": "HUMAN_REVIEWED", "inputIdentity": "SOURCE_PIPELINE_VERIFIED"}}]}"""
            .formatted(digests.get("evaluation/profiles/v1/p.json"), ds, digests.get(ds + "cases/a.json"), ds,
                digests.get(ds + "gt/a.json")));
        return new DatasetLoader(path -> Optional.ofNullable(files.get(path))
            .map(text -> text.getBytes(StandardCharsets.UTF_8)));
    }

    private static String sha(String text) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(text.getBytes(StandardCharsets.UTF_8)));
        }
        catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }
}
