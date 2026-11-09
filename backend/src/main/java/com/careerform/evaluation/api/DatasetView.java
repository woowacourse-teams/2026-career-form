package com.careerform.evaluation.api;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import com.careerform.evaluation.dataset.CaseCall;
import com.careerform.evaluation.dataset.DatasetInspection;
import com.careerform.evaluation.dataset.EvaluationCase;
import com.careerform.evaluation.scoring.CallKind;
import tools.jackson.databind.JsonNode;

/**
 * 평가 화면의 데이터셋 대화상자용 요약. 화면 칸 목록은 사례의 필드 매핑 요청(제품이 만든 요청)에서 꺼낸
 * 섹션 제목·칸 표시명·컨트롤 종류이며, 준비 동작은 준비 단계 버튼 결정의 역할 목록이다.
 */
public record DatasetView(
    String datasetId,
    int version,
    String digest,
    boolean usable,
    String rejection,
    List<CaseView> cases,
    Map<String, JsonNode> profiles
) {

    public record CaseView(String caseId, String split, String siteId, String state, String profileId,
        Map<String, String> review, List<CallView> calls, List<SectionView> sections, List<String> actions) {
    }

    public record CallView(int order, CallKind.Stage stage, CallKind kind, int items, int estimatedModelCalls) {
    }

    public record SectionView(String title, List<FieldView> fields) {
    }

    public record FieldView(String label, String control) {
    }

    static DatasetView of(DatasetInspection inspection, Map<String, JsonNode> profiles) {
        List<CaseView> cases = new ArrayList<>();
        for (EvaluationCase evaluationCase : inspection.dataset().cases()) {
            List<CallView> calls = evaluationCase.calls().stream().map(call -> new CallView(call.order(), call.stage(),
                call.kind(), call.expected().size(), call.estimatedModelCalls())).toList();
            List<SectionView> sections = new ArrayList<>();
            List<String> actions = new ArrayList<>();
            for (CaseCall call : evaluationCase.calls()) {
                if (call.kind() == CallKind.GENERIC_FIELDS) {
                    call.request().path("sections").forEach(section -> {
                        List<FieldView> fields = new ArrayList<>();
                        section.path("fields").forEach(field -> fields.add(new FieldView(
                            field.path("displayName").asString(null), field.path("control").asString(null))));
                        sections.add(new SectionView(section.path("displayName").asString(null), fields));
                    });
                }
                if (call.kind() == CallKind.INTERACTION_DECISION) {
                    call.request().path("decisions").forEach(decision -> actions.add(
                        decision.path("role").asString() + (decision.has("targetKind")
                            ? ":" + decision.path("targetKind").asString() : "")));
                }
            }
            cases.add(new CaseView(evaluationCase.caseId(), evaluationCase.split(), evaluationCase.siteId(),
                evaluationCase.state(), evaluationCase.profileId(),
                inspection.reviews().getOrDefault(evaluationCase.caseId(), Map.of()), calls, sections, actions));
        }
        return new DatasetView(inspection.dataset().datasetId(), inspection.dataset().version(),
            inspection.dataset().digest(), inspection.usable(), inspection.rejection(), cases,
            new LinkedHashMap<>(profiles));
    }
}
