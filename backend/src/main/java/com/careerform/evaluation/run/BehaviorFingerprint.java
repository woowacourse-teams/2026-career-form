package com.careerform.evaluation.run;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import jakarta.validation.Validator;
import com.careerform.evaluation.dataset.CaseCall;
import com.careerform.evaluation.dataset.EvaluationCase;
import com.careerform.evaluation.dataset.LoadedDataset;
import com.careerform.formanalysis.application.port.ChoiceModel;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 평가 결과에 영향을 주는 제품 동작의 지문. 데이터셋 요청을 실제 제품 코드에 넣되 모델 자리에 가짜 모델을 끼워, 모델에 간
 * 질문과 최종 응답을 해시한다. 외부 호출이 없어 비용이 들지 않고, 변수명 변경처럼 동작이 같은 변경에는 지문이 그대로다.
 * 가짜 답은 "첫 선택지"와 "판단 보류" 두 벌로 돌려 후처리 분기를 더 지나가게 한다. 병렬 순서가 달라도 같도록 정렬해 해시한다.
 */
public final class BehaviorFingerprint {

    private static final String FAKE = "fingerprint";

    private final JsonMapper mapper;
    private final Validator validator;
    private final ServiceProductCallGateway.ProductParts parts;

    public BehaviorFingerprint(JsonMapper mapper, Validator validator, ServiceProductCallGateway.ProductParts parts) {
        this.mapper = mapper;
        this.validator = validator;
        this.parts = parts;
    }

    public String digest(LoadedDataset dataset, int concurrency, int batch) {
        List<String> lines = Collections.synchronizedList(new ArrayList<>());
        for (boolean abstain : List.of(false, true)) {
            run(dataset, concurrency, batch, abstain, lines);
        }
        List<String> sorted = new ArrayList<>(lines);
        Collections.sort(sorted);
        try {
            MessageDigest hash = MessageDigest.getInstance("SHA-256");
            sorted.forEach(line -> hash.update((line + "\n").getBytes(StandardCharsets.UTF_8)));
            return HexFormat.of().formatHex(hash.digest());
        }
        catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private void run(LoadedDataset dataset, int concurrency, int batch, boolean abstain, List<String> lines) {
        String prefix = abstain ? "abstain|" : "first|";
        ChoiceModel fake = new RecordingModel(prefix, abstain, lines);
        EvaluationProviders providers = new EvaluationProviders(List.of(new EvaluationProviders.Provider(FAKE,
            List.of(FAKE), Map.of(), List.of(), model -> fake)));
        ServiceProductCallGateway gateway = new ServiceProductCallGateway(mapper, validator, providers, parts);
        CallTarget target = new CallTarget(FAKE, FAKE, Map.of("section-concurrency", String.valueOf(concurrency),
            "field-batch-size", String.valueOf(batch)));
        for (EvaluationCase evaluationCase : dataset.cases()) {
            for (CaseCall call : evaluationCase.calls()) {
                String key = prefix + evaluationCase.caseId() + "/" + call.order() + "|";
                try {
                    lines.add(key + canonical(gateway.call(call.kind(), call.request(), target)));
                }
                catch (RuntimeException exception) {
                    lines.add(key + "error:" + exception.getClass().getName());
                }
            }
        }
    }

    private String canonical(Object value) {
        return mapper.writeValueAsString(sorted(mapper.valueToTree(value)));
    }

    /** 객체 키를 정렬하고 측정 시간을 뺀다. 불변 Map의 순서는 JVM마다 달라 그대로 해시하면 같은 코드도 지문이 달라진다. */
    private static Object sorted(JsonNode node) {
        if (node.isObject()) {
            Map<String, Object> result = new TreeMap<>();
            node.properties().stream().filter(entry -> !"elapsedMs".equals(entry.getKey()))
                .forEach(entry -> result.put(entry.getKey(), sorted(entry.getValue())));
            return result;
        }
        if (node.isArray()) {
            List<Object> result = new ArrayList<>();
            node.forEach(item -> result.add(sorted(item)));
            return result;
        }
        return node;
    }

    /** 받은 질문을 기록하고 정해진 규칙으로 답한다. 선택지는 정렬해 첫 번째를 고른다. */
    private final class RecordingModel implements ChoiceModel {

        private final String prefix;
        private final boolean abstain;
        private final List<String> lines;

        private RecordingModel(String prefix, boolean abstain, List<String> lines) {
            this.prefix = prefix;
            this.abstain = abstain;
            this.lines = lines;
        }

        @Override
        public String provider() {
            return FAKE;
        }

        @Override
        public String model() {
            return FAKE;
        }

        @Override
        public Map<String, Judgement> answer(Object state, Map<String, Question> questions) {
            record(state, questions);
            Map<String, Judgement> result = new LinkedHashMap<>();
            questions.forEach((id, question) -> result.put(id, new Judgement(pick(question), abstain ? 0.0 : 0.95, Map.of())));
            return result;
        }

        @Override
        public Map<String, String> choose(Object state, Map<String, Question> questions) {
            record(state, questions);
            Map<String, String> result = new LinkedHashMap<>();
            questions.forEach((id, question) -> result.put(id, pick(question)));
            return result;
        }

        private String pick(Question question) {
            if (abstain) {
                return ABSTAIN;
            }
            return new TreeMap<>(question.criteria()).keySet().stream().filter(key -> !ABSTAIN.equals(key)).findFirst()
                .orElse(ABSTAIN);
        }

        private void record(Object state, Map<String, Question> questions) {
            Map<String, Object> asked = new TreeMap<>();
            questions.forEach((id, question) -> asked.put(id, Map.of("instructions", String.valueOf(question.instructions()),
                "criteria", new TreeMap<>(question.criteria()))));
            lines.add(prefix + "asked|" + canonical(state) + "|" + canonical(asked));
        }
    }
}
