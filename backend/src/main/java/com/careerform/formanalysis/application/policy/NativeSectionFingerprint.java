package com.careerform.formanalysis.application.policy;

import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;

final class NativeSectionFingerprint {
    private NativeSectionFingerprint() { }
    static boolean fields(SectionContract contract, FieldsAnalysisRequest.Section section, Set<String> candidateIds, Set<String> itemIds) {
        if (!Objects.equals(contract.parentSectionId(), section.parentSectionId())) return false;
        if (contract.itemGroupId() == null) {
            return (section.items() == null || section.items().isEmpty())
                && fieldSet(contract, section.fields(), candidateIds, null, 0, 0);
        }
        if (!section.fields().isEmpty()) return false;
        var items = section.items();
        if (items == null || items.isEmpty() || items.size() > contract.maxRows()) return false;
        for (int i = 0; i < items.size(); i++) {
            var item = items.get(i);
            if (!itemIds.add(item.itemId()) || !contract.itemGroupId().equals(item.itemGroupId())
                || !fieldSet(contract, item.fields(), candidateIds, item.itemGroupId(), i, items.size())) return false;
        }
        return true;
    }
    private static boolean fieldSet(SectionContract c, List<FieldsAnalysisRequest.FieldCandidate> fields,
        Set<String> ids, String group, int index, int count) {
        if (fields.isEmpty() || fields.size() > c.maxFields()) return false;
        Set<String> names = new HashSet<>();
        for (var f : fields) {
            var rule = c.fields().stream().filter(r -> r.structuralName().equals(f.domName())).findFirst().orElse(null);
            if (rule == null || !names.add(f.domName()) || !ids.add(f.candidateId()) || !Objects.equals(f.domName(), f.domId())
                || rule.element() != f.element() || rule.control() != f.control()
                || f.visibility() != FieldsAnalysisRequest.Visibility.VISIBLE || Boolean.TRUE.equals(f.disabled())
                || Boolean.TRUE.equals(f.readonly()) || c.enabled() && Boolean.TRUE.equals(f.inert())) return false;
            var repeat = f.semanticContext() == null ? null : f.semanticContext().repeat();
            if (group == null && repeat != null || group != null && (repeat == null || !group.equals(repeat.groupId())
                || !Integer.valueOf(index).equals(repeat.rowIndex()) || !Integer.valueOf(count).equals(repeat.rowCount()))) return false;
        }
        return names.containsAll(c.anchors());
    }
    static boolean preparation(SectionContract c, PreparationAnalysisRequest.Section s, Set<String> ids) {
        if (!Objects.equals(c.parentSectionId(), s.parentSectionId()) || s.items() != null && !s.items().isEmpty()
            || s.actionCandidates().size() > c.actions().size() || !c.enabled() && !s.actionCandidates().isEmpty()) return false;
        return s.actionCandidates().stream().allMatch(a -> ids.add(a.candidateId())
            && a.visibility() == PreparationAnalysisRequest.Visibility.VISIBLE && !Boolean.TRUE.equals(a.disabled())
            && !Boolean.TRUE.equals(a.inert()) && c.actions().stream().anyMatch(r -> r.structuralNames().contains(a.domId())
                && r.element() == a.element() && r.control() == a.control() && a.domName() == null));
    }
}
