package com.careerform.formanalysis.application.policy;

import java.util.List;
import java.util.Set;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.ActionStructure;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldStructure;

/** Native section wire structure. DOM selectors and codes remain in browserPolicy. */
public record SectionContract(String sectionId, String parentSectionId, String itemGroupId,
    int maxRows, int maxFields, Set<String> anchors, List<FieldStructure> fields,
    List<ActionStructure> actions, boolean enabled, ExcludedRow excludedRow) {
    public record ExcludedRow(String name, String reason) { }
    public SectionContract(String sectionId, String parentSectionId, String itemGroupId,
        int maxRows, int maxFields, Set<String> anchors, List<FieldStructure> fields, List<ActionStructure> actions, boolean enabled) {
        this(sectionId,parentSectionId,itemGroupId,maxRows,maxFields,anchors,fields,actions,enabled,null);
    }
    public SectionContract {
        if (sectionId == null || sectionId.isBlank() || maxRows < 1 || maxRows > 32 || maxFields < 1 || maxFields > 64
            || fields == null || fields.isEmpty() || fields.size() > maxFields || anchors == null || actions == null
            || actions.size() > 1 || itemGroupId == null && !actions.isEmpty()
            || fields.stream().map(FieldStructure::structuralName).distinct().count() != fields.size()
            || !fields.stream().map(FieldStructure::structuralName).toList().containsAll(anchors)) {
            throw new IllegalArgumentException("Invalid section contract");
        }
        if (excludedRow != null && (!"hplace-mrs2-foreignExam".equals(sectionId)
            || !"hplace.mrs2.foreignExam.languageExamName".equals(excludedRow.name())
            || !"입력 불가(인증 시험 — 사용자 처리)".equals(excludedRow.reason()))) {
            throw new IllegalArgumentException("Invalid excluded row contract");
        }
        fields = List.copyOf(fields); actions = List.copyOf(actions); anchors = Set.copyOf(anchors);
    }
}
