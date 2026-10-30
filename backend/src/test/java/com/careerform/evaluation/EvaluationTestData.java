package com.careerform.evaluation;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.Map;
import java.util.Optional;
import com.careerform.evaluation.dataset.DatasetLoader;
import com.careerform.formanalysis.application.PromptSource;
import com.careerform.evaluation.scoring.CallKind;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** 평가 테스트용 합성 데이터셋(synthetic v1: 튜닝 사례 하나, 호출 두 건)과 프롬프트. */
public final class EvaluationTestData {

    public static final PromptSource PROMPT = new PromptSource() {
        @Override public String promptSourceId() { return "p"; }
        @Override public Map<String, String> promptParts() { return Map.of("instructions", "Map {questionId}."); }
    };
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private EvaluationTestData() {
    }

    public static DatasetLoader syntheticLoader() {
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
        files.put(ds + "manifest.json", """
            {"schemaVersion": 1, "datasetId": "synthetic", "version": 1,
             "profiles": [{"profileId": "p", "file": "evaluation/profiles/v1/p.json", "sha256": "%s"}],
             "cases": [{"caseId": "a", "split": "tuning", "siteId": "s", "state": "a", "profileId": "p",
               "file": "%scases/a.json", "sha256": "%s", "groundTruth": {"file": "%sgt/a.json", "sha256": "%s"},
               "fixture": {"id": "fx", "sha256": "f"},
               "review": {"privacy": "PASSED", "structure": "PASSED", "mappingTruth": "HUMAN_REVIEWED",
                 "preparationTruth": "HUMAN_REVIEWED", "inputIdentity": "SOURCE_PIPELINE_VERIFIED"}}]}"""
            .formatted(sha(files.get("evaluation/profiles/v1/p.json")), ds, sha(files.get(ds + "cases/a.json")), ds,
                sha(files.get(ds + "gt/a.json"))));
        return new DatasetLoader(path -> Optional.ofNullable(files.get(path))
            .map(text -> text.getBytes(StandardCharsets.UTF_8)));
    }

    /** 합성 데이터셋의 두 호출에 모두 정답으로 답하는 제품 응답. */
    public static JsonNode correctResponse(CallKind kind) {
        return JSON.readTree(kind == CallKind.SECTION_CLASSIFY
            ? "{\"status\": \"COMPLETE\", \"sections\": [{\"sectionId\": \"gs1\", \"category\": \"PERSONAL\"}]}"
            : "{\"status\": \"COMPLETE\", \"fields\": [{\"candidateId\": \"field-1\", \"profileFieldKey\": \"contact.contact.email\"}]}");
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
