package com.careerform.evaluation.run;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import com.careerform.evaluation.dataset.CaseCall;
import com.careerform.evaluation.dataset.EvaluationCase;
import com.careerform.evaluation.dataset.LoadedDataset;
import com.careerform.evaluation.scoring.AutofillOutcome;
import com.careerform.evaluation.scoring.CallKind;
import com.careerform.evaluation.scoring.CallScorer;
import com.careerform.evaluation.scoring.ObservedItem;
import tools.jackson.databind.JsonNode;

/**
 * 실행 하나의 답을 채점 항목마다 모은다. 화면에서 항목×모델 비교와 이전 실행 대비 개선·악화를 보는 데 쓴다.
 * 이름은 데이터셋에 기록한 제품 요청에서 읽는다. 칸 매핑은 칸 이름·섹션과 자동기입 판정({@link AutofillOutcome#classify}),
 * 섹션 분류는 섹션 제목, 선택 결정은 대상 종류와 선택지 글자를 쓰고 모델 답 그대로 채점한다({@link CallScorer#verdict}).
 * 실패한 호출의 반복은 답에서 빠진다.
 */
public final class ItemReport {

    private ItemReport() {
    }

    /** {@code group}은 칸의 섹션 제목 또는 선택 결정의 역할이다. 선택 결정의 정답·답은 선택지 글자다. */
    public record Item(String caseId, String state, CallKind.Stage stage, CallKind kind, String group, String itemId,
        String label, String control, String expected, List<Answer> answers) {

        public Item {
            answers = List.copyOf(answers);
        }
    }

    public record Answer(int repetition, String value, Double confidence, String outcome) {
    }

    public static List<Item> of(LoadedDataset dataset, List<CallResultRecord> records) {
        Map<String, List<CallResultRecord>> byCall = new HashMap<>();
        records.stream().filter(record -> record.score() != null)
            .sorted(Comparator.comparingInt(CallResultRecord::repetition))
            .forEach(record -> byCall.computeIfAbsent(record.caseId() + "/" + record.order(), key -> new ArrayList<>())
                .add(record));
        List<Item> items = new ArrayList<>();
        for (EvaluationCase evaluationCase : dataset.cases()) {
            for (CaseCall call : evaluationCase.calls()) {
                Map<String, Naming> names = names(call);
                List<CallResultRecord> answered = byCall.getOrDefault(evaluationCase.caseId() + "/" + call.order(),
                    List.of());
                call.expected().forEach((id, want) -> {
                    Naming naming = names.getOrDefault(id, Naming.EMPTY);
                    List<Answer> answers = answered.stream().map(record -> {
                        ObservedItem item = record.observed().getOrDefault(id, ObservedItem.answered(null));
                        String outcome = call.kind() == CallKind.GENERIC_FIELDS
                            ? AutofillOutcome.classify(want, item).name() : CallScorer.verdict(want, item).name();
                        return new Answer(record.repetition(), naming.text(item.value()), item.confidence(), outcome);
                    }).toList();
                    items.add(new Item(evaluationCase.caseId(), evaluationCase.state(), call.stage(), call.kind(),
                        naming.group(), id, naming.label(), naming.control(), naming.text(want), answers));
                });
            }
        }
        return items;
    }

    /** 항목 하나의 이름과, 답(선택지 ID 등)을 사람이 읽는 글자로 바꾸는 표. */
    private record Naming(String group, String label, String control, Map<String, String> texts) {

        static final Naming EMPTY = new Naming(null, null, null, Map.of());

        String text(String value) {
            return value == null ? null : texts.getOrDefault(value, value);
        }
    }

    private static Map<String, Naming> names(CaseCall call) {
        Map<String, Naming> names = new HashMap<>();
        JsonNode request = call.request();
        switch (call.kind()) {
            case GENERIC_FIELDS -> request.path("sections").forEach(section -> section.path("fields").forEach(field ->
                names.put(field.path("candidateId").asString(null), new Naming(section.path("displayName").asString(null),
                    field.path("displayName").asString(null), field.path("control").asString(null), Map.of()))));
            case SECTION_CLASSIFY -> request.path("sections").forEach(section ->
                names.put(section.path("sectionId").asString(null),
                    new Naming(null, section.path("title").asString(null), null, Map.of())));
            case INTERACTION_DECISION -> request.path("decisions").forEach(decision -> {
                Map<String, String> texts = new HashMap<>();
                decision.path("candidates").forEach(candidate -> texts.put(candidate.path("candidateId").asString(null),
                    candidate.path("semanticContext").path("labels").path(0).path("text").asString(null)));
                texts.values().removeIf(java.util.Objects::isNull);
                names.put(decision.path("decisionId").asString(null), new Naming(decision.path("role").asString(null),
                    decision.path("targetKind").asString(null), null, texts));
            });
        }
        return names;
    }
}
