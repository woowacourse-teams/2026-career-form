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
import com.careerform.evaluation.scoring.ObservedItem;
import tools.jackson.databind.JsonNode;

/**
 * 실행 하나의 칸 매핑 답을 칸마다 모은다. 화면에서 칸×모델 비교와 이전 실행 대비 개선·악화를 보는 데 쓴다.
 * 칸 이름과 섹션은 데이터셋에 기록한 제품 요청에서 읽고, 판정은 {@link AutofillOutcome#classify}와 같다.
 * 실패한 호출의 반복은 답에서 빠진다.
 */
public final class FieldReport {

    private FieldReport() {
    }

    public record FieldAnswers(String caseId, String state, String section, String fieldId, String label,
        String control, String expected, List<Answer> answers) {

        public FieldAnswers {
            answers = List.copyOf(answers);
        }
    }

    public record Answer(int repetition, String value, Double confidence, AutofillOutcome.Kind outcome) {
    }

    public static List<FieldAnswers> of(LoadedDataset dataset, List<CallResultRecord> records) {
        Map<String, List<CallResultRecord>> byCall = new HashMap<>();
        records.stream().filter(record -> record.kind() == CallKind.GENERIC_FIELDS && record.score() != null)
            .sorted(Comparator.comparingInt(CallResultRecord::repetition))
            .forEach(record -> byCall.computeIfAbsent(record.caseId() + "/" + record.order(), key -> new ArrayList<>())
                .add(record));
        List<FieldAnswers> fields = new ArrayList<>();
        for (EvaluationCase evaluationCase : dataset.cases()) {
            for (CaseCall call : evaluationCase.calls()) {
                if (call.kind() != CallKind.GENERIC_FIELDS) {
                    continue;
                }
                Map<String, JsonNode> candidates = new HashMap<>();
                Map<String, String> sections = new HashMap<>();
                call.request().path("sections").forEach(section -> section.path("fields").forEach(field -> {
                    String id = field.path("candidateId").asString(null);
                    candidates.put(id, field);
                    sections.put(id, section.path("displayName").asString(null));
                }));
                List<CallResultRecord> answered = byCall.getOrDefault(evaluationCase.caseId() + "/" + call.order(),
                    List.of());
                call.expected().forEach((id, want) -> {
                    JsonNode field = candidates.get(id);
                    List<Answer> answers = answered.stream().map(record -> {
                        ObservedItem item = record.observed().getOrDefault(id, ObservedItem.answered(null));
                        return new Answer(record.repetition(), item.value(), item.confidence(),
                            AutofillOutcome.classify(want, item));
                    }).toList();
                    fields.add(new FieldAnswers(evaluationCase.caseId(), evaluationCase.state(), sections.get(id), id,
                        field == null ? null : field.path("displayName").asString(null),
                        field == null ? null : field.path("control").asString(null), want, answers));
                });
            }
        }
        return fields;
    }
}
