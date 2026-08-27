package com.careerform.formanalysis.infrastructure.adapter.sk;

import java.util.Map;
import java.util.Optional;

import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FieldCandidate;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement;

final class SkRuleCatalog {

    private static final Map<String, ActionRule> ACTION_RULES = Map.of(
        "detail-toggle",
        new ActionRule(ActionKind.REVEAL, "section-detail"),
        "credential-add",
        new ActionRule(ActionKind.ADD, null)
    );
    private static final Map<String, FieldRule> FIELD_RULES = Map.of(
        "applicant-family-name",
        textRule("personal.personal.koreanFamilyName"),
        "applicant-given-name",
        textRule("personal.personal.koreanGivenName"),
        "applicant-email",
        textRule("contact.contact.email"),
        "applicant-phone",
        textRule("contact.contact.phoneNumber"),
        "education-school-name",
        textRule("education.university.schoolName"),
        "education-completion-status",
        new FieldRule(
            FormElement.SELECT,
            FormControl.SELECT,
            "education.university.completionStatus"
        )
    );

    Optional<ActionRule> actionRule(String structuralName) {
        if (structuralName == null) {
            return Optional.empty();
        }
        return Optional.ofNullable(ACTION_RULES.get(structuralName));
    }

    Optional<FieldRule> fieldRule(String structuralName) {
        if (structuralName == null) {
            return Optional.empty();
        }
        return Optional.ofNullable(FIELD_RULES.get(structuralName));
    }

    private static FieldRule textRule(String profileFieldKey) {
        return new FieldRule(FormElement.INPUT, FormControl.TEXT, profileFieldKey);
    }

    enum ActionKind {
        REVEAL,
        ADD
    }

    record ActionRule(ActionKind kind, String targetSectionId) {
    }

    record FieldRule(
        FormElement element,
        FormControl control,
        String profileFieldKey
    ) {

        boolean matches(FieldCandidate candidate) {
            return candidate.element() == element && candidate.control() == control;
        }
    }
}
