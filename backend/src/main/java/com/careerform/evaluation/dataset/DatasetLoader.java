package com.careerform.evaluation.dataset;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;
import com.careerform.evaluation.dataset.DatasetRejected.Code;
import com.careerform.evaluation.run.DatasetCatalog;
import com.careerform.evaluation.scoring.CallKind;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 저장소에 보관한 평가 데이터셋을 읽고 등록 검사를 한다. 파일 해시, 사람 검토, 입력 동일성, 형식, 분할을
 * 모두 통과해야 평가에 쓴다. 경로는 리소스 루트 기준이며 데이터셋 ID와 버전은 고정 형식만 받는다.
 */
public final class DatasetLoader implements DatasetCatalog {

    @FunctionalInterface
    public interface ResourceSource {
        Optional<byte[]> read(String path);
    }

    private static final Pattern DATASET_ID = Pattern.compile("[a-z0-9][a-z0-9-]{0,63}");
    private static final Set<String> SPLITS = Set.of("tuning", "final");
    private static final Set<String> IDENTITY = Set.of("SOURCE_PIPELINE_VERIFIED", "INSTALLED_VERIFIED");
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final ResourceSource resources;

    public DatasetLoader(ResourceSource resources) {
        this.resources = resources;
    }

    public static ResourceSource classpath(ClassLoader classLoader) {
        return path -> {
            try (InputStream stream = classLoader.getResourceAsStream(path)) {
                return stream == null ? Optional.empty() : Optional.of(stream.readAllBytes());
            }
            catch (IOException exception) {
                throw new UncheckedIOException(exception);
            }
        };
    }

    @Override
    public Optional<DatasetSummary> find(String datasetId, int version) {
        try {
            LoadedDataset dataset = load(datasetId, version);
            Map<String, SplitSummary> splits = new HashMap<>();
            for (String split : SPLITS) {
                List<EvaluationCase> cases = dataset.casesIn(split);
                if (!cases.isEmpty()) {
                    splits.put(split, new SplitSummary(cases.size(),
                        cases.stream().mapToInt(evaluationCase -> evaluationCase.calls().size()).sum(),
                        cases.stream().flatMap(evaluationCase -> evaluationCase.calls().stream())
                            .mapToInt(CaseCall::estimatedModelCalls).sum()));
                }
            }
            return Optional.of(new DatasetSummary(datasetId, version, dataset.digest(), splits));
        }
        catch (DatasetRejected rejected) {
            return Optional.empty();
        }
    }

    public LoadedDataset load(String datasetId, int version) {
        return read(datasetId, version, true, new LinkedHashMap<>()).dataset();
    }

    /** 사람 검토와 입력 동일성을 막지 않고 상태만 알려 준다. 해시·형식·분할 검사는 그대로 한다. */
    public DatasetInspection inspect(String datasetId, int version) {
        Map<String, Map<String, String>> reviews = new LinkedHashMap<>();
        Inspected inspected = read(datasetId, version, false, reviews);
        String rejection = null;
        for (var entry : reviews.entrySet()) {
            try {
                checkReview(entry.getKey(), JSON.valueToTree(entry.getValue()));
            }
            catch (DatasetRejected rejected) {
                rejection = rejected.getMessage();
                break;
            }
        }
        return new DatasetInspection(inspected.dataset(), rejection == null, rejection, reviews);
    }

    private record Inspected(LoadedDataset dataset) {
    }

    private Inspected read(String datasetId, int version, boolean enforceReview,
        Map<String, Map<String, String>> reviews) {
        if (datasetId == null || !DATASET_ID.matcher(datasetId).matches() || version < 1) {
            throw new DatasetRejected(Code.SCHEMA_INVALID, "datasetId/version");
        }
        String base = "evaluation/datasets/" + datasetId + "/v" + version + "/";
        byte[] manifestBytes = resources.read(base + "manifest.json")
            .orElseThrow(() -> new DatasetRejected(Code.NOT_FOUND, base + "manifest.json"));
        JsonNode manifest = tree(manifestBytes, "manifest.json");
        if (manifest.path("schemaVersion").asInt() != 1 || !datasetId.equals(manifest.path("datasetId").asString())
            || manifest.path("version").asInt() != version) {
            throw new DatasetRejected(Code.SCHEMA_INVALID, "manifest.json");
        }
        Set<String> profiles = new java.util.HashSet<>();
        for (JsonNode profile : manifest.path("profiles")) {
            verified(profile.path("file").asString(), profile.path("sha256").asString());
            profiles.add(profile.path("profileId").asString());
        }
        Map<String, String> fixtureSplits = new HashMap<>();
        List<EvaluationCase> cases = new ArrayList<>();
        for (JsonNode entry : manifest.path("cases")) {
            cases.add(loadCase(entry, profiles, fixtureSplits, enforceReview));
            Map<String, String> review = new LinkedHashMap<>();
            entry.path("review").properties().forEach(item -> review.put(item.getKey(), item.getValue().asString()));
            reviews.put(text(entry, "caseId"), review);
        }
        if (cases.isEmpty()) {
            throw new DatasetRejected(Code.SCHEMA_INVALID, "cases");
        }
        return new Inspected(new LoadedDataset(datasetId, version, sha256(manifestBytes), cases));
    }

    private EvaluationCase loadCase(JsonNode entry, Set<String> profiles, Map<String, String> fixtureSplits,
        boolean enforceReview) {
        String caseId = text(entry, "caseId");
        String split = text(entry, "split");
        if (!SPLITS.contains(split) || !profiles.contains(text(entry, "profileId"))) {
            throw new DatasetRejected(Code.SCHEMA_INVALID, caseId + " split/profileId");
        }
        String fixture = text(entry.path("fixture"), "id");
        String previous = fixtureSplits.putIfAbsent(fixture, split);
        if (previous != null && !previous.equals(split)) {
            throw new DatasetRejected(Code.SPLIT_OVERLAP, fixture);
        }
        JsonNode file = tree(verified(text(entry, "file"), text(entry, "sha256")), caseId);
        verified(text(entry.path("groundTruth"), "file"), text(entry.path("groundTruth"), "sha256"));
        if (enforceReview) {
            checkReview(caseId, entry.path("review"));
        }
        if (file.path("schemaVersion").asInt() != 1 || !caseId.equals(file.path("caseId").asString())) {
            throw new DatasetRejected(Code.SCHEMA_INVALID, caseId);
        }
        List<CaseCall> calls = new ArrayList<>();
        for (JsonNode call : file.path("calls")) {
            calls.add(call(caseId, call, calls.size() + 1));
        }
        if (calls.isEmpty()) {
            throw new DatasetRejected(Code.SCHEMA_INVALID, caseId + " calls");
        }
        return new EvaluationCase(caseId, split, text(entry, "siteId"), text(entry, "state"),
            text(entry, "profileId"), calls);
    }

    private static void checkReview(String caseId, JsonNode review) {
        for (String key : List.of("privacy", "structure")) {
            if (!"PASSED".equals(review.path(key).asString())) {
                throw new DatasetRejected(Code.REVIEW_MISSING, caseId + " " + key);
            }
        }
        for (String key : List.of("mappingTruth", "preparationTruth")) {
            if (!"HUMAN_REVIEWED".equals(review.path(key).asString())) {
                throw new DatasetRejected(Code.REVIEW_MISSING, caseId + " " + key);
            }
        }
        if (!IDENTITY.contains(review.path("inputIdentity").asString())) {
            throw new DatasetRejected(Code.IDENTITY_UNVERIFIED, caseId);
        }
    }

    private static CaseCall call(String caseId, JsonNode call, int expectedOrder) {
        try {
            if (call.path("order").asInt() != expectedOrder) {
                throw new IllegalArgumentException("order");
            }
            Map<String, String> expected = new LinkedHashMap<>();
            for (var item : call.path("expected").properties()) {
                expected.put(item.getKey(), item.getValue().isNull() ? null : item.getValue().asString());
            }
            if (expected.isEmpty() || !call.path("request").isObject()) {
                throw new IllegalArgumentException("expected/request");
            }
            return new CaseCall(expectedOrder, CallKind.Stage.valueOf(call.path("phase").asString()),
                CallKind.valueOf(call.path("kind").asString()), text(call, "endpoint"), text(call, "requestDigest"),
                call.path("request"), expected, call.path("estimatedModelCalls").asInt());
        }
        catch (IllegalArgumentException exception) {
            throw new DatasetRejected(Code.SCHEMA_INVALID, caseId + " call " + expectedOrder);
        }
    }

    private byte[] verified(String path, String sha256) {
        if (path == null || path.isBlank() || path.contains("..")) {
            throw new DatasetRejected(Code.SCHEMA_INVALID, "path");
        }
        byte[] bytes = resources.read(path).orElseThrow(() -> new DatasetRejected(Code.DIGEST_MISMATCH, path));
        if (!sha256(bytes).equals(sha256)) {
            throw new DatasetRejected(Code.DIGEST_MISMATCH, path);
        }
        return bytes;
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (!value.isString() || value.asString().isBlank()) {
            throw new DatasetRejected(Code.SCHEMA_INVALID, field);
        }
        return value.asString();
    }

    private static JsonNode tree(byte[] bytes, String what) {
        try {
            return JSON.readTree(bytes);
        }
        catch (RuntimeException exception) {
            throw new DatasetRejected(Code.SCHEMA_INVALID, what);
        }
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        }
        catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }
}
