package com.careerform.formanalysis.application.policy;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Visibility;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;

public final class HplaceFormFingerprint {

    public static final String SECTION = "hplace-registration";
    public static final String NAME = "hplace.registration.name";
    public static final String MOBILE = "hplace.registration.mobile";
    public static final String EMAIL = "hplace.registration.email";
    private static final Set<String> FIELD_NAMES = Set.of(NAME, MOBILE, EMAIL);

    public boolean matches(PreparationAnalysisRequest request) {
        if (request.sections().size() != 1) return false;
        var section = request.sections().getFirst();
        return SECTION.equals(section.sectionId()) && section.parentSectionId() == null
            && section.actionCandidates().isEmpty() && empty(section.items());
    }

    public boolean matches(FieldsAnalysisRequest request) {
        if (request.sections().size() != 1) return false;
        var section = request.sections().getFirst();
        if (!SECTION.equals(section.sectionId()) || section.parentSectionId() != null
            || !empty(section.items()) || section.fields().size() != FIELD_NAMES.size()) return false;
        Set<String> names = new HashSet<>();
        Set<String> ids = new HashSet<>();
        return section.fields().stream().allMatch(field -> field.domName() != null && FIELD_NAMES.contains(field.domName())
            && names.add(field.domName()) && ids.add(field.candidateId())
            && field.domName().equals(field.domId())
            && field.element() == FormElement.INPUT && field.control() == FormControl.TEXT
            && field.visibility() == Visibility.VISIBLE
            && !Boolean.TRUE.equals(field.disabled()) && !Boolean.TRUE.equals(field.readonly())
            && !Boolean.TRUE.equals(field.inert()));
    }

    private static boolean empty(List<?> values) {
        return values == null || values.isEmpty();
    }
}
