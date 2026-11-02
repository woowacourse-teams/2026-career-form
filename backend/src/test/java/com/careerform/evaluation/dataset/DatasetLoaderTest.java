package com.careerform.evaluation.dataset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.Map;
import java.util.Optional;
import java.util.function.UnaryOperator;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import com.careerform.evaluation.dataset.DatasetRejected.Code;
import com.careerform.evaluation.scoring.CallKind;

@DisplayName("평가 데이터셋 형식과 등록 검사")
class DatasetLoaderTest {

    private static final String DS = "evaluation/datasets/synthetic/v1/";

    @Test
    @DisplayName("검사를 통과한 데이터셋은 사례, 호출 순서, 정답(매핑 불가 포함), 분할 요약을 읽는다")
    void loadsReviewedDataset() {
        LoadedDataset dataset = loader(valid()).load("synthetic", 1);

        assertThat(dataset.digest()).matches("[0-9a-f]{64}");
        assertThat(dataset.cases()).hasSize(2);
        EvaluationCase tuning = dataset.cases().getFirst();
        assertThat(tuning.split()).isEqualTo("tuning");
        assertThat(tuning.calls()).extracting(CaseCall::kind)
            .containsExactly(CallKind.SECTION_CLASSIFY, CallKind.GENERIC_FIELDS);
        assertThat(tuning.calls().get(1).expected()).containsEntry("field-1", "contact.contact.email")
            .containsEntry("field-2", null);
        assertThat(tuning.calls().get(0).stage()).isEqualTo(CallKind.Stage.MAPPING);
        var summary = loader(valid()).find("synthetic", 1).orElseThrow();
        assertThat(summary.splits().get("tuning").productCalls()).isEqualTo(2);
        assertThat(summary.splits().get("tuning").recordedModelCalls()).isEqualTo(3);
        assertThat(summary.splits().get("final").cases()).isEqualTo(1);
    }

    @Test
    @DisplayName("준비 없음은 준비 호출 0건인 사례로 표현된다")
    void noPreparationIsZeroPreparationCalls() {
        EvaluationCase tuning = loader(valid()).load("synthetic", 1).cases().getFirst();

        assertThat(tuning.calls()).noneMatch(call -> call.stage() == CallKind.Stage.PREPARATION);
    }

    @Test
    @DisplayName("파일 해시가 manifest와 다르면 DIGEST_MISMATCH로 거부한다")
    void rejectsDigestMismatch() {
        Map<String, String> files = valid();
        files.put(DS + "cases/a.json", files.get(DS + "cases/a.json").replace("contact.contact.email", "x"));

        assertRejected(files, Code.DIGEST_MISMATCH);
    }

    @Test
    @DisplayName("사람 검토가 끝나지 않은 정답이나 개인정보 검토가 있으면 REVIEW_MISSING으로 거부한다")
    void rejectsMissingReview() {
        assertRejected(withManifest(m -> m.replace("\"preparationTruth\": \"HUMAN_REVIEWED\"",
            "\"preparationTruth\": \"AGENT_DRAFT\"")), Code.REVIEW_MISSING);
        assertRejected(withManifest(m -> m.replaceFirst("\"privacy\": \"PASSED\"", "\"privacy\": \"PENDING\"")),
            Code.REVIEW_MISSING);
    }

    @Test
    @DisplayName("입력 동일성을 확인하지 않은 사례는 IDENTITY_UNVERIFIED로 거부한다")
    void rejectsUnverifiedIdentity() {
        assertRejected(withManifest(m -> m.replaceFirst("SOURCE_PIPELINE_VERIFIED", "UNVERIFIED")),
            Code.IDENTITY_UNVERIFIED);
    }

    @Test
    @DisplayName("형식이 맞지 않으면 SCHEMA_INVALID로 거부한다")
    void rejectsInvalidSchema() {
        Map<String, String> files = valid();
        files.put(DS + "cases/a.json", files.get(DS + "cases/a.json").replace("\"order\": 2", "\"order\": 3"));
        assertRejected(rehash(files), Code.SCHEMA_INVALID);
        assertRejected(withManifest(m -> m.replace("\"split\": \"final\"", "\"split\": \"holdout\"")),
            Code.SCHEMA_INVALID);
        assertThatThrownBy(() -> loader(valid()).load("../etc", 1))
            .isInstanceOfSatisfying(DatasetRejected.class, r -> assertThat(r.code()).isEqualTo(Code.SCHEMA_INVALID));
    }

    @Test
    @DisplayName("같은 화면이 튜닝과 최종 평가에 함께 있으면 SPLIT_OVERLAP으로 거부한다")
    void rejectsSplitOverlap() {
        assertRejected(withManifest(m -> m.replace("\"fixture-b\"", "\"fixture-a\"")), Code.SPLIT_OVERLAP);
    }

    @Test
    @DisplayName("검토 전 데이터셋도 화면 표시용으로 살펴볼 수 있고, 해시가 틀리면 살펴보기도 거부한다")
    void inspectsUnreviewedDatasetButStillChecksDigests() {
        Map<String, String> draft = withManifest(m -> m.replace("\"preparationTruth\": \"HUMAN_REVIEWED\"",
            "\"preparationTruth\": \"AGENT_DRAFT\""));

        DatasetInspection inspection = loader(draft).inspect("synthetic", 1);

        assertThat(inspection.dataset().cases()).hasSize(2);
        assertThat(inspection.usable()).isFalse();
        assertThat(inspection.rejection()).contains("preparationTruth");
        assertThat(inspection.reviews().get("a")).containsEntry("preparationTruth", "AGENT_DRAFT");
        assertThat(loader(valid()).inspect("synthetic", 1).usable()).isTrue();
        Map<String, String> tampered = valid();
        tampered.put(DS + "cases/a.json", tampered.get(DS + "cases/a.json").replace("PERSONAL", "X"));
        assertThatThrownBy(() -> loader(tampered).inspect("synthetic", 1))
            .isInstanceOfSatisfying(DatasetRejected.class, r -> assertThat(r.code()).isEqualTo(Code.DIGEST_MISMATCH));
    }

    @Test
    @DisplayName("없는 데이터셋은 찾지 못한다")
    void missingDatasetIsNotFound() {
        assertThat(loader(valid()).find("other", 1)).isEmpty();
    }

    @Test
    @DisplayName("저장소의 generic-matching v1은 사람 검토를 마쳐 화면 3개 사례를 모두 읽는다")
    void repositoryDatasetLoadsReviewedCases() {
        DatasetLoader loader = new DatasetLoader(DatasetLoader.classpath(getClass().getClassLoader()));

        LoadedDataset dataset = loader.load("generic-matching", 1);

        assertThat(dataset.cases()).extracting(EvaluationCase::state)
            .containsExactlyInAnyOrder("initial", "high-school", "university");
        assertThat(dataset.cases()).allSatisfy(evaluationCase -> assertThat(evaluationCase.calls()).isNotEmpty());
    }

    @Test
    @DisplayName("저장소의 generic-matching v2는 검정고시 화면을 최종 평가용에 더해 화면 4개를 읽는다")
    void repositoryDatasetV2AddsGedCase() {
        DatasetLoader loader = new DatasetLoader(DatasetLoader.classpath(getClass().getClassLoader()));

        LoadedDataset dataset = loader.load("generic-matching", 2);

        assertThat(dataset.cases()).extracting(EvaluationCase::state)
            .containsExactlyInAnyOrder("initial", "high-school", "university", "ged");
        assertThat(dataset.casesIn("final")).extracting(EvaluationCase::state)
            .containsExactlyInAnyOrder("high-school", "university", "ged");
    }

    @Test
    @DisplayName("분할 all은 데이터셋의 모든 사례이고 요약에도 나온다")
    void allSplitCoversEveryCase() {
        DatasetLoader loader = new DatasetLoader(DatasetLoader.classpath(getClass().getClassLoader()));

        assertThat(loader.load("generic-matching", 2).casesIn("all")).hasSize(4);
        assertThat(loader.find("generic-matching", 2).orElseThrow().splits().get("all").cases()).isEqualTo(4);
    }

    private static void assertRejected(Map<String, String> files, Code code) {
        assertThatThrownBy(() -> loader(files).load("synthetic", 1))
            .isInstanceOfSatisfying(DatasetRejected.class, rejected -> assertThat(rejected.code()).isEqualTo(code));
    }

    private static DatasetLoader loader(Map<String, String> files) {
        return new DatasetLoader(path -> Optional.ofNullable(files.get(path))
            .map(text -> text.getBytes(StandardCharsets.UTF_8)));
    }

    private static Map<String, String> withManifest(UnaryOperator<String> change) {
        Map<String, String> files = valid();
        files.put(DS + "manifest.json", change.apply(files.get(DS + "manifest.json")));
        return files;
    }

    private static Map<String, String> valid() {
        Map<String, String> files = new HashMap<>();
        files.put("evaluation/profiles/v1/p.json", "{\"schemaVersion\":1,\"profile\":{}}");
        files.put(DS + "cases/a.json", caseFile("a", """
            {"order": 1, "phase": "MAPPING", "kind": "SECTION_CLASSIFY", "endpoint": "/api/v1/generic/sections/classify",
             "requestDigest": "d1", "request": {"schemaVersion": 1}, "expected": {"gs1": "PERSONAL"}, "estimatedModelCalls": 1},
            {"order": 2, "phase": "MAPPING", "kind": "GENERIC_FIELDS", "endpoint": "/api/v1/generic/fields/analyze",
             "requestDigest": "d2", "request": {"schemaVersion": 2}, "expected": {"field-1": "contact.contact.email",
             "field-2": null}, "estimatedModelCalls": 2}"""));
        files.put(DS + "cases/b.json", caseFile("b", """
            {"order": 1, "phase": "PREPARATION", "kind": "INTERACTION_DECISION",
             "endpoint": "/api/v1/generic/interaction-decisions", "requestDigest": "d3", "request": {"schemaVersion": 2},
             "expected": {"rowKind0": "rowKind0-option1", "rowKind1": null}, "estimatedModelCalls": 1}"""));
        files.put(DS + "ground-truth/a.json", "{\"state\":\"a\"}");
        files.put(DS + "ground-truth/b.json", "{\"state\":\"b\"}");
        files.put(DS + "manifest.json", "");
        return rehash(files);
    }

    private static String caseFile(String id, String calls) {
        return "{\"schemaVersion\": 1, \"caseId\": \"" + id + "\", \"calls\": [" + calls + "]}";
    }

    private static Map<String, String> rehash(Map<String, String> files) {
        files.put(DS + "manifest.json", """
            {"schemaVersion": 1, "datasetId": "synthetic", "version": 1,
             "profiles": [{"profileId": "p", "file": "evaluation/profiles/v1/p.json", "sha256": "%s"}],
             "cases": [
              {"caseId": "a", "split": "tuning", "siteId": "s", "state": "a", "profileId": "p",
               "file": "%scases/a.json", "sha256": "%s",
               "groundTruth": {"file": "%sground-truth/a.json", "sha256": "%s"},
               "fixture": {"id": "fixture-a", "sha256": "f1"},
               "review": {"privacy": "PASSED", "structure": "PASSED", "mappingTruth": "HUMAN_REVIEWED",
                "preparationTruth": "HUMAN_REVIEWED", "inputIdentity": "SOURCE_PIPELINE_VERIFIED"}},
              {"caseId": "b", "split": "final", "siteId": "s", "state": "b", "profileId": "p",
               "file": "%scases/b.json", "sha256": "%s",
               "groundTruth": {"file": "%sground-truth/b.json", "sha256": "%s"},
               "fixture": {"id": "fixture-b", "sha256": "f2"},
               "review": {"privacy": "PASSED", "structure": "PASSED", "mappingTruth": "HUMAN_REVIEWED",
                "preparationTruth": "HUMAN_REVIEWED", "inputIdentity": "SOURCE_PIPELINE_VERIFIED"}}
             ]}""".formatted(sha(files.get("evaluation/profiles/v1/p.json")),
            DS, sha(files.get(DS + "cases/a.json")), DS, sha(files.get(DS + "ground-truth/a.json")),
            DS, sha(files.get(DS + "cases/b.json")), DS, sha(files.get(DS + "ground-truth/b.json"))));
        return files;
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
