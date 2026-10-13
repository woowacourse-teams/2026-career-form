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
    public static final String DETAIL_SECTION = "hplace-detail-basic";
    public static final String ENGLISH_NAME = "hplace.detail.englishName";
    public static final String BIRTHDAY = "hplace.detail.birthday";
    public static final String DETAIL_ADDRESS = "hplace.detail.detailAddress";
    public static final String EMERGENCY_PHONE = "hplace.detail.emergencyPhone";
    private static final Set<String> DETAIL_REQUIRED = Set.of(ENGLISH_NAME, BIRTHDAY, DETAIL_ADDRESS);
    private static final Set<String> DETAIL_FIELDS = Set.of(ENGLISH_NAME, BIRTHDAY, DETAIL_ADDRESS, EMERGENCY_PHONE);
    private static final Set<String> FIELD_NAMES = Set.of(NAME, MOBILE, EMAIL);

    public boolean matches(PreparationAnalysisRequest request) {
        if (request.sections().size() != 1) return false;
        var section = request.sections().getFirst();
        return matchesSection(request.site().pathPattern(), section.sectionId()) && section.parentSectionId() == null
            && section.actionCandidates().isEmpty() && empty(section.items());
    }

    public boolean matches(FieldsAnalysisRequest request) {
        if (request.sections().size() != 1) return false;
        var section = request.sections().getFirst();
        if (!matchesSection(request.site().pathPattern(), section.sectionId()) || section.parentSectionId() != null
            || !empty(section.items())) return false;
        boolean detail = DETAIL_SECTION.equals(section.sectionId());
        Set<String> required = detail ? DETAIL_REQUIRED : FIELD_NAMES;
        Set<String> allowed = detail ? DETAIL_FIELDS : FIELD_NAMES;
        if (section.fields().size() < required.size() || section.fields().size() > allowed.size()) return false;
        Set<String> names = new HashSet<>();
        Set<String> ids = new HashSet<>();
        return section.fields().stream().allMatch(field -> field.domName() != null && allowed.contains(field.domName())
            && names.add(field.domName()) && ids.add(field.candidateId())
            && field.domName().equals(field.domId())
            && field.element() == FormElement.INPUT && field.control() == FormControl.TEXT
            && field.visibility() == Visibility.VISIBLE
            && !Boolean.TRUE.equals(field.disabled()) && !Boolean.TRUE.equals(field.readonly())
            && !Boolean.TRUE.equals(field.inert())) && names.containsAll(required);
    }

    private static boolean matchesSection(String path, String section) {
        return "/app/applicant/registResume".equals(path) && SECTION.equals(section)
            || "/mrs2/applicant/resume/writeResume".equals(path) && DETAIL_SECTION.equals(section);
    }

    private static boolean empty(List<?> values) {
        return values == null || values.isEmpty();
    }
}
