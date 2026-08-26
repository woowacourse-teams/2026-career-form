package com.careerform.formanalysis.application;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.careerform.formanalysis.domain.FieldsSnapshot;
import com.careerform.formanalysis.domain.FormAnalysisConstraints;
import com.careerform.formanalysis.domain.FormControl;
import com.careerform.formanalysis.domain.FormElement;
import com.careerform.formanalysis.domain.PreparationSnapshot;

public final class SnapshotValidator {

    private static final String INVALID_MESSAGE =
        "지원서 snapshot 관계를 확인할 수 없습니다";

    public void validate(PreparationSnapshot snapshot) {
        if (snapshot == null
            || snapshot.schemaVersion() != FormAnalysisConstraints.SCHEMA_VERSION
            || snapshot.sections() == null
            || snapshot.sections().isEmpty()) {
            invalid();
        }

        Set<String> sectionIds = new HashSet<>();
        Set<String> itemIds = new HashSet<>();
        Set<String> candidateIds = new HashSet<>();
        Map<String, String> parents = new HashMap<>();
        for (PreparationSnapshot.Section section : snapshot.sections()) {
            if (section == null || !sectionIds.add(section.sectionId())) {
                invalid();
            }
            parents.put(section.sectionId(), section.parentSectionId());
            validateActionCandidates(section.actionCandidates(), false, candidateIds);
            if (section.items() == null) {
                continue;
            }
            for (PreparationSnapshot.Item item : section.items()) {
                if (item == null || !itemIds.add(item.itemId())) {
                    invalid();
                }
                validateActionCandidates(item.actionCandidates(), true, candidateIds);
            }
        }
        validateParents(parents);
    }

    public void validate(FieldsSnapshot snapshot) {
        if (snapshot == null
            || snapshot.schemaVersion() != FormAnalysisConstraints.SCHEMA_VERSION
            || snapshot.sections() == null
            || snapshot.sections().isEmpty()) {
            invalid();
        }

        Set<String> sectionIds = new HashSet<>();
        Set<String> itemIds = new HashSet<>();
        Set<String> candidateIds = new HashSet<>();
        Map<String, String> parents = new HashMap<>();
        for (FieldsSnapshot.Section section : snapshot.sections()) {
            if (section == null || !sectionIds.add(section.sectionId())) {
                invalid();
            }
            parents.put(section.sectionId(), section.parentSectionId());
            validateFieldCandidates(section.fields(), false, candidateIds);
            if (section.items() == null) {
                continue;
            }
            for (FieldsSnapshot.Item item : section.items()) {
                if (item == null || !itemIds.add(item.itemId())) {
                    invalid();
                }
                validateFieldCandidates(item.fields(), true, candidateIds);
            }
        }
        validateParents(parents);
    }

    private static void validateActionCandidates(
        List<PreparationSnapshot.ActionCandidate> candidates,
        boolean mustNotBeEmpty,
        Set<String> candidateIds
    ) {
        if (candidates == null || mustNotBeEmpty && candidates.isEmpty()) {
            invalid();
        }
        for (PreparationSnapshot.ActionCandidate candidate : candidates) {
            if (candidate == null
                || !candidateIds.add(candidate.candidateId())
                || !isActionElement(candidate.element())
                || !isActionControl(candidate.control())
                || Boolean.FALSE.equals(candidate.disabled())
                || Boolean.FALSE.equals(candidate.readonly())
                || Boolean.FALSE.equals(candidate.inert())) {
                invalid();
            }
        }
    }

    private static void validateFieldCandidates(
        List<FieldsSnapshot.FieldCandidate> candidates,
        boolean mustNotBeEmpty,
        Set<String> candidateIds
    ) {
        if (candidates == null || mustNotBeEmpty && candidates.isEmpty()) {
            invalid();
        }
        for (FieldsSnapshot.FieldCandidate candidate : candidates) {
            if (candidate == null
                || !candidateIds.add(candidate.candidateId())
                || !isFieldElement(candidate.element())
                || !isFieldControl(candidate.control())
                || Boolean.FALSE.equals(candidate.disabled())
                || Boolean.FALSE.equals(candidate.readonly())
                || Boolean.FALSE.equals(candidate.inert())) {
                invalid();
            }
            validateOptions(candidate.options());
        }
    }

    private static void validateOptions(List<FieldsSnapshot.Option> options) {
        if (options == null) {
            return;
        }
        if (options.isEmpty()) {
            invalid();
        }
        Set<String> optionIds = new HashSet<>();
        for (FieldsSnapshot.Option option : options) {
            if (option == null || !optionIds.add(option.optionId())) {
                invalid();
            }
        }
    }

    private static void validateParents(Map<String, String> parents) {
        Map<String, VisitState> states = new HashMap<>();
        for (String sectionId : parents.keySet()) {
            visit(sectionId, parents, states);
        }
    }

    private static void visit(
        String sectionId,
        Map<String, String> parents,
        Map<String, VisitState> states
    ) {
        VisitState state = states.get(sectionId);
        if (state == VisitState.VISITING) {
            invalid();
        }
        if (state == VisitState.VISITED) {
            return;
        }
        states.put(sectionId, VisitState.VISITING);
        String parent = parents.get(sectionId);
        if (parent != null) {
            if (!parents.containsKey(parent)) {
                invalid();
            }
            visit(parent, parents, states);
        }
        states.put(sectionId, VisitState.VISITED);
    }

    private static boolean isActionElement(FormElement element) {
        return element == FormElement.BUTTON
            || element == FormElement.INPUT
            || element == FormElement.CUSTOM;
    }

    private static boolean isActionControl(FormControl control) {
        return control == FormControl.BUTTON || control == FormControl.CUSTOM;
    }

    private static boolean isFieldElement(FormElement element) {
        return element == FormElement.INPUT
            || element == FormElement.SELECT
            || element == FormElement.TEXTAREA
            || element == FormElement.CUSTOM;
    }

    private static boolean isFieldControl(FormControl control) {
        return control != null && control != FormControl.BUTTON;
    }

    private static void invalid() {
        throw new InvalidFormAnalysisRequestException(INVALID_MESSAGE);
    }

    private enum VisitState {
        VISITING,
        VISITED
    }
}
