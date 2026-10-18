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
        boolean excluded = c.excludedRow() != null && fields.size() == 1 && Boolean.TRUE.equals(fields.getFirst().inert())
            && c.excludedRow().name().equals(fields.getFirst().domName()) && c.excludedRow().reason().equals(fields.getFirst().displayName());
        Set<String> names = new HashSet<>();
        for (var f : fields) {
            var rule = c.fields().stream().filter(r -> r.structuralName().equals(f.domName())).findFirst().orElse(null);
            if (rule == null || !names.add(f.domName()) || !ids.add(f.candidateId()) || !Objects.equals(f.domName(), f.domId())
                || rule.element() != f.element() || rule.control() != f.control()
                || f.visibility() != FieldsAnalysisRequest.Visibility.VISIBLE || Boolean.TRUE.equals(f.disabled())
                || Boolean.TRUE.equals(f.readonly()) || c.enabled() && Boolean.TRUE.equals(f.inert()) && !excluded) return false;
            var repeat = f.semanticContext() == null ? null : f.semanticContext().repeat();
            if (group == null && repeat != null || group != null && (repeat == null || !group.equals(repeat.groupId())
                || !Integer.valueOf(index).equals(repeat.rowIndex()) || !Integer.valueOf(count).equals(repeat.rowCount()))) return false;
        }
        return names.containsAll(c.anchors());
    }
    static boolean preparation(SectionContract c, PreparationAnalysisRequest.Section s, Set<String> ids) {
        if (!Objects.equals(c.parentSectionId(), s.parentSectionId()) || s.actionCandidates().size()>1
            || !c.enabled() && (!s.actionCandidates().isEmpty() || s.items()!=null && !s.items().isEmpty())) return false;
        if(!s.actionCandidates().stream().allMatch(a->action(c,a,ids,0))) return false;
        if(s.items()==null) return true;
        if(c.actions().size()!=2 || s.items().size()>c.maxRows()) return false;
        Set<String> items=new HashSet<>();
        for(var item:s.items()) {
            if(!items.add(item.itemId()) || item.actionCandidates().size()!=1) return false;
            var a=item.actionCandidates().getFirst();
            int index=c.actions().get(1).structuralNames().indexOf(a.domId());
            if(index<0 || !item.itemId().equals(c.sectionId()+"-item-"+index) || !action(c,a,ids,1)) return false;
        }
        return true;
    }
    private static boolean action(SectionContract c, PreparationAnalysisRequest.ActionCandidate a,Set<String> ids,int index) {
        return c.actions().size()>index && ids.add(a.candidateId()) && a.visibility()==PreparationAnalysisRequest.Visibility.VISIBLE
            && !Boolean.TRUE.equals(a.disabled()) && !Boolean.TRUE.equals(a.inert()) && !Boolean.TRUE.equals(a.readonly())
            && c.actions().get(index).structuralNames().contains(a.domId()) && c.actions().get(index).element()==a.element()
            && c.actions().get(index).control()==a.control() && a.domName()==null;
    }
}
