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
    private static final Set<String> DETAIL_RADIOS = Set.of(
        "hplace.detail.gender", "hplace.detail.veteranStatus", "hplace.detail.disabilityStatus", "hplace.detail.militaryStatus");
    private static final Set<String> DETAIL_SELECTS = Set.of(
        "hplace.detail.nationality", "hplace.detail.disabilityGrade", "hplace.detail.disabilityType",
        "hplace.detail.militaryRank", "hplace.detail.dischargeType");
    private static final Set<String> DETAIL_TEXTS = Set.of(ENGLISH_NAME, BIRTHDAY, DETAIL_ADDRESS, EMERGENCY_PHONE,
        "hplace.detail.veteranNumber", "hplace.detail.veteranRelation", "hplace.detail.serviceStartDate",
        "hplace.detail.serviceEndDate", "hplace.detail.exemptionReason");
    private static final Set<String> DETAIL_FIELDS = java.util.stream.Stream.of(DETAIL_TEXTS, DETAIL_RADIOS, DETAIL_SELECTS)
        .flatMap(Set::stream).collect(java.util.stream.Collectors.toUnmodifiableSet());
    private static final Set<String> FIELD_NAMES = Set.of(NAME, MOBILE, EMAIL);

    public boolean matches(CompanyFormPolicy policy, PreparationAnalysisRequest request) {
        if (policy.sectionContracts().isEmpty() || !HplaceApplicantSite.DETAIL_PATH.equals(request.site().pathPattern())) return matches(request);
        Set<String> sections = new HashSet<>(), ids = new HashSet<>();
        if (request.sections().isEmpty()) return false;
        for (var section : request.sections()) {
            if (!sections.add(section.sectionId())) return false;
            if (DETAIL_SECTION.equals(section.sectionId())) {
                if (!matches(new PreparationAnalysisRequest(request.schemaVersion(), request.snapshotId(), request.site(), List.of(section)))) return false;
            } else if (StagedAddressContract.address(policy.executionPolicy()).path("sectionId").asText().equals(section.sectionId())) {
                if(!StagedAddressContract.preparation(StagedAddressContract.address(policy.executionPolicy()),section,ids))return false;
            } else {
                var contract = policy.sectionContracts().stream().filter(c -> c.sectionId().equals(section.sectionId())).findFirst().orElse(null);
                if (contract == null || !NativeSectionFingerprint.preparation(contract, section, ids)) return false;
            }
        }
        return true;
    }

    public boolean matches(CompanyFormPolicy policy, FieldsAnalysisRequest request) {
        if (policy.sectionContracts().isEmpty() || !HplaceApplicantSite.DETAIL_PATH.equals(request.site().pathPattern())) return matches(request);
        Set<String> sections = new HashSet<>(), ids = new HashSet<>(), items = new HashSet<>();
        if (request.sections().isEmpty()) return false;
        for (var section : request.sections()) {
            if (!sections.add(section.sectionId())) return false;
            if (DETAIL_SECTION.equals(section.sectionId())) {
                if (!matches(new FieldsAnalysisRequest(request.schemaVersion(), request.snapshotId(), request.site(), List.of(section)))
                    || !section.fields().stream().allMatch(f -> ids.add(f.candidateId()))) return false;
            } else if (StagedAddressContract.address(policy.executionPolicy()).path("sectionId").asText().equals(section.sectionId())) {
                if(!StagedAddressContract.fields(StagedAddressContract.address(policy.executionPolicy()),section,ids,request))return false;
            } else {
                var contract = policy.sectionContracts().stream().filter(c -> c.sectionId().equals(section.sectionId())).findFirst().orElse(null);
                if (contract == null || !NativeSectionFingerprint.fields(contract, section, ids, items)) return false;
            }
        }
        return true;
    }

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
            && matchesControl(field.domName(), field.element(), field.control())
            && field.visibility() == Visibility.VISIBLE
            && !Boolean.TRUE.equals(field.disabled()) && !Boolean.TRUE.equals(field.readonly())
            && !Boolean.TRUE.equals(field.inert())) && names.containsAll(required);
    }

    private static boolean matchesControl(String name, FormElement element, FormControl control) {
        if (DETAIL_SELECTS.contains(name)) return element == FormElement.SELECT && control == FormControl.SELECT;
        if (DETAIL_RADIOS.contains(name)) return element == FormElement.INPUT && control == FormControl.RADIO;
        return element == FormElement.INPUT && control == FormControl.TEXT;
    }

    private static boolean matchesSection(String path, String section) {
        return "/app/applicant/registResume".equals(path) && SECTION.equals(section)
            || "/mrs2/applicant/resume/writeResume".equals(path) && DETAIL_SECTION.equals(section);
    }

    private static boolean empty(List<?> values) {
        return values == null || values.isEmpty();
    }
}
