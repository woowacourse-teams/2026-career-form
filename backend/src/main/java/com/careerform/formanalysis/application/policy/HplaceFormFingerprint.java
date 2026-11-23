package com.careerform.formanalysis.application.policy;

import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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
    public static final String ENGLISH_GIVEN_FIRST = ENGLISH_NAME + ".givenFirst";
    public static final String ENGLISH_FAMILY_FIRST = ENGLISH_NAME + ".familyFirst";
    public static final String BIRTHDAY = "hplace.detail.birthday";
    public static final String DETAIL_ADDRESS = "hplace.detail.detailAddress";
    public static final String EMERGENCY_PHONE = "hplace.detail.emergencyPhone";
    // Address and birthday are optional: some tenants render neither (com2us has no
    // address row, KDI has no birthday/gender). The English name anchors the section.
    // Every detail field is verified on its own by the extension; the section needs at least one
    // allowed field but no particular one (tenants omit address, birthday or even the English name).
    private static final Set<String> DETAIL_REQUIRED = Set.of();
    private static final Set<String> V1_REQUIRED = Set.of();
    private static final Set<String> DETAIL_RADIOS = Set.of(
        "hplace.detail.gender", "hplace.detail.veteranStatus", "hplace.detail.disabilityStatus", "hplace.detail.militaryStatus");
    private static final Set<String> DETAIL_SELECTS = Set.of(
        "hplace.detail.nationality", "hplace.detail.disabilityGrade", "hplace.detail.disabilityType",
        "hplace.detail.militaryRank", "hplace.detail.dischargeType");
    private static final Set<String> DETAIL_TEXTS = Set.of(ENGLISH_NAME, ENGLISH_GIVEN_FIRST, ENGLISH_FAMILY_FIRST, BIRTHDAY, DETAIL_ADDRESS, EMERGENCY_PHONE,
        "hplace.detail.veteranNumber", "hplace.detail.veteranRelation", "hplace.detail.serviceStartDate",
        "hplace.detail.serviceEndDate", "hplace.detail.exemptionReason");
    private static final Set<String> DETAIL_FIELDS = java.util.stream.Stream.of(DETAIL_TEXTS, DETAIL_RADIOS, DETAIL_SELECTS)
        .flatMap(Set::stream).collect(java.util.stream.Collectors.toUnmodifiableSet());
    private static final Set<String> FIELD_NAMES = Set.of(NAME, MOBILE, EMAIL);
    // v1 applicant app (resume-form step 1): a separate section with its own allow-list.
    public static final String V1_SECTION = "hplace-v1-basic";
    private static final Set<String> V1_RADIOS = v1Names("gender", "militaryStatus", "disabilityStatus", "veteranStatus");
    private static final Set<String> V1_SELECTS = v1Names("militaryRank", "dischargeType", "militaryBranch",
        "disabilityGrade", "disabilityType", "veteranRelation", "nationality");
    private static final Set<String> V1_TEXTS = v1Names("englishName.familyFirst", "birthday", "emergencyPhone",
        "serviceStartDate", "serviceEndDate", "militarySpecialty", "disabilityRegistrationNumber", "veteranNumber",
        "postalCode", "addressLine1", "addressLine2");
    public static final Set<String> V1_FIELDS = java.util.stream.Stream.of(V1_TEXTS, V1_RADIOS, V1_SELECTS)
        .flatMap(Set::stream).collect(java.util.stream.Collectors.toUnmodifiableSet());
    // v1 resume-form step 2 (education and career cards). Repeated cards are sent as flat names
    // hplace.v1.<group>.<i>.<field>; the allow-list is generated, so it stays an exact set.
    public static final String V1_HISTORY_SECTION = "hplace-v1-history";
    public static final int V1_HISTORY_MAX_CARDS = 10;
    /** group -> field -> control. The high-school group has one card only. */
    public static final Map<String, Map<String, FormControl>> V1_HISTORY_TEMPLATES = historyTemplates();
    /** Exact name -> control for every allowed history field (286 names). */
    public static final Map<String, FormControl> V1_HISTORY_FIELDS = historyFields();
    /** Exact add-action names: one per card level, plus the first major add of each school card. */
    public static final List<String> V1_HISTORY_CARD_ADDS = List.of("hplace.v1.highschool.add", "hplace.v1.college.add",
        "hplace.v1.graduateSchool.add", "hplace.v1.career.add");
    public static final List<String> V1_HISTORY_MAJOR_ADDS = majorAdds();
    /** The 추가하기 of the step-2 경력기술서 and 포트폴리오 rows: one inline entry each. */
    public static final List<String> V1_ATTACHMENT_ADDS = List.of("hplace.v1.careerDescription.add", "hplace.v1.portfolio.add");
    private static final Set<String> V1_HISTORY_ACTIONS = java.util.stream.Stream.of(
        V1_HISTORY_CARD_ADDS, V1_HISTORY_MAJOR_ADDS, V1_ATTACHMENT_ADDS).flatMap(List::stream)
        .collect(java.util.stream.Collectors.toUnmodifiableSet());
    // v1 resume-form step 3 (어학/자격/기타): the 자격증 and 외국어활용능력 rows, sent as flat names
    // hplace.v1.<group>.<i>.<field> like step 2. 공인외국어시험, 컴퓨터활용능력 and the 경험 cards are not accepted.
    public static final String V1_EXTRA_SECTION = "hplace-v1-extra";
    /** group -> field -> control: only the controls measured on the live page. */
    public static final Map<String, Map<String, FormControl>> V1_EXTRA_TEMPLATES = extraTemplates();
    /** Exact name -> control for every allowed step-3 field (50 names). */
    public static final Map<String, FormControl> V1_EXTRA_FIELDS = indexedFields(V1_EXTRA_TEMPLATES);
    /** The 추가하기 of the 자격증 and 외국어활용능력 rows. */
    public static final List<String> V1_EXTRA_ADDS = List.of("hplace.v1.certificate.add", "hplace.v1.languageSkill.add");
    private static final Set<String> V1_EXTRA_ACTIONS = Set.copyOf(V1_EXTRA_ADDS);

    public boolean matches(CompanyFormPolicy policy, PreparationAnalysisRequest request) {
        if (policy.sectionContracts().isEmpty() || !HplaceApplicantSite.DETAIL_PATH.equals(request.site().pathPattern())) return matches(request);
        Set<String> sections = new HashSet<>(), ids = new HashSet<>();
        if (request.sections().isEmpty()) return false;
        for (var section : request.sections()) {
            if (!sections.add(section.sectionId())) return false;
            if (DETAIL_SECTION.equals(section.sectionId())) {
                if (!matches(new PreparationAnalysisRequest(request.schemaVersion(), request.snapshotId(), request.site(), List.of(section)))) return false;
            } else if (policy.stagedAddress().path("sectionId").asText().equals(section.sectionId())) {
                if (!StagedAddressContract.preparation(policy.stagedAddress(),section,ids))return false;
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
            } else if (policy.stagedAddress().path("sectionId").asText().equals(section.sectionId())) {
                if (!StagedAddressContract.fields(policy.stagedAddress(),section,ids,request))return false;
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
        if (!matchesSection(request.site().pathPattern(), section.sectionId()) || section.parentSectionId() != null
            || !empty(section.items())) return false;
        boolean extra = V1_EXTRA_SECTION.equals(section.sectionId());
        if (!V1_HISTORY_SECTION.equals(section.sectionId()) && !extra) return section.actionCandidates().isEmpty();
        Set<String> allowedActions = extra ? V1_EXTRA_ACTIONS : V1_HISTORY_ACTIONS;
        Set<String> names = new HashSet<>();
        return section.actionCandidates().stream().allMatch(action -> action.domName() != null
            && allowedActions.contains(action.domName()) && action.domName().equals(action.domId())
            && names.add(action.domName())
            && action.element() == PreparationAnalysisRequest.FormElement.BUTTON
            && action.control() == PreparationAnalysisRequest.FormControl.BUTTON
            && action.visibility() == PreparationAnalysisRequest.Visibility.VISIBLE
            && !Boolean.TRUE.equals(action.disabled()) && !Boolean.TRUE.equals(action.readonly())
            && !Boolean.TRUE.equals(action.inert()));
    }

    public boolean matches(FieldsAnalysisRequest request) {
        if (request.sections().size() != 1) return false;
        var section = request.sections().getFirst();
        if (!matchesSection(request.site().pathPattern(), section.sectionId()) || section.parentSectionId() != null
            || !empty(section.items())) return false;
        boolean detail = DETAIL_SECTION.equals(section.sectionId());
        boolean v1 = V1_SECTION.equals(section.sectionId());
        boolean history = V1_HISTORY_SECTION.equals(section.sectionId());
        boolean extra = V1_EXTRA_SECTION.equals(section.sectionId());
        Set<String> required = v1 || history || extra ? V1_REQUIRED : detail ? DETAIL_REQUIRED : FIELD_NAMES;
        Set<String> allowed = extra ? V1_EXTRA_FIELDS.keySet() : history ? V1_HISTORY_FIELDS.keySet() : v1 ? V1_FIELDS
            : detail ? DETAIL_FIELDS : FIELD_NAMES;
        if (section.fields().size() < Math.max(1, required.size()) || section.fields().size() > allowed.size()) return false;
        Set<String> names = new HashSet<>();
        Set<String> ids = new HashSet<>();
        return section.fields().stream().allMatch(field -> field.domName() != null && allowed.contains(field.domName())
            && names.add(field.domName().equals(ENGLISH_GIVEN_FIRST) || field.domName().equals(ENGLISH_FAMILY_FIRST) ? ENGLISH_NAME : field.domName()) && ids.add(field.candidateId())
            && field.domName().equals(field.domId())
            && matchesControl(field.domName(), field.element(), field.control())
            && field.visibility() == Visibility.VISIBLE
            && !Boolean.TRUE.equals(field.disabled()) && !Boolean.TRUE.equals(field.readonly())
            && !Boolean.TRUE.equals(field.inert())) && names.containsAll(required);
    }

    private static boolean matchesControl(String name, FormElement element, FormControl control) {
        var history = V1_HISTORY_FIELDS.containsKey(name) ? V1_HISTORY_FIELDS.get(name) : V1_EXTRA_FIELDS.get(name);
        if (history != null) return control == history
            && element == (history == FormControl.SELECT ? FormElement.SELECT : FormElement.INPUT);
        if (DETAIL_SELECTS.contains(name) || V1_SELECTS.contains(name)) return element == FormElement.SELECT && control == FormControl.SELECT;
        if (DETAIL_RADIOS.contains(name) || V1_RADIOS.contains(name)) return element == FormElement.INPUT && control == FormControl.RADIO;
        return element == FormElement.INPUT && control == FormControl.TEXT;
    }

    private static boolean matchesSection(String path, String section) {
        return "/app/applicant/registResume".equals(path) && SECTION.equals(section)
            || "/mrs2/applicant/resume/writeResume".equals(path) && DETAIL_SECTION.equals(section)
            || HplaceApplicantSite.V1_RESUME_FORM_PATH.equals(path)
                && (V1_SECTION.equals(section) || V1_HISTORY_SECTION.equals(section) || V1_EXTRA_SECTION.equals(section));
    }

    private static Map<String, Map<String, FormControl>> historyTemplates() {
        var school = new LinkedHashMap<String, FormControl>();
        school.put("degreeTypeCode", FormControl.RADIO);
        school.put("academyName", FormControl.TEXT);
        school.put("campusType", FormControl.RADIO);
        school.put("entranceDate", FormControl.TEXT);
        school.put("graduationDate", FormControl.TEXT);
        school.put("graduationTypeCode", FormControl.RADIO);
        school.put("entranceTypeCode", FormControl.RADIO);
        school.put("score", FormControl.TEXT);
        school.put("perfectScore", FormControl.SELECT);
        school.put("major0.majorName", FormControl.TEXT);
        var highschool = new LinkedHashMap<String, FormControl>();
        highschool.put("graduationTypeCode", FormControl.RADIO);
        highschool.put("academyName", FormControl.TEXT);
        highschool.put("locationCode", FormControl.SELECT);
        highschool.put("dayOrNight", FormControl.RADIO);
        highschool.put("entranceDate", FormControl.TEXT);
        highschool.put("graduationDate", FormControl.TEXT);
        var career = new LinkedHashMap<String, FormControl>();
        career.put("employmentType", FormControl.SELECT);
        career.put("workingStatus", FormControl.RADIO);
        for (String key : List.of("entranceDate", "leavingDate", "company", "department", "position", "assignedTask")) {
            career.put(key, FormControl.TEXT);
        }
        var groups = new LinkedHashMap<String, Map<String, FormControl>>();
        groups.put("highschool", java.util.Collections.unmodifiableMap(highschool));
        groups.put("college", java.util.Collections.unmodifiableMap(school));
        groups.put("graduateSchool", java.util.Collections.unmodifiableMap(school));
        groups.put("career", java.util.Collections.unmodifiableMap(career));
        return java.util.Collections.unmodifiableMap(groups);
    }

    /** Number of cards a group may carry: one high school, up to {@link #V1_HISTORY_MAX_CARDS} of the rest. */
    public static int historyCards(String group) {
        return "highschool".equals(group) ? 1 : V1_HISTORY_MAX_CARDS;
    }

    private static Map<String, FormControl> historyFields() {
        var fields = new LinkedHashMap<String, FormControl>();
        V1_HISTORY_TEMPLATES.forEach((group, templates) -> {
            for (int i = 0; i < historyCards(group); i++) {
                for (var template : templates.entrySet()) {
                    fields.put("hplace.v1." + group + "." + i + "." + template.getKey(), template.getValue());
                }
            }
        });
        return java.util.Collections.unmodifiableMap(fields);
    }

    private static Map<String, Map<String, FormControl>> extraTemplates() {
        var certificate = new LinkedHashMap<String, FormControl>();
        certificate.put("licenseName", FormControl.TEXT);
        certificate.put("organization", FormControl.TEXT);
        certificate.put("acquireDate", FormControl.TEXT);
        certificate.put("registNumber", FormControl.TEXT);
        var groups = new LinkedHashMap<String, Map<String, FormControl>>();
        groups.put("certificate", java.util.Collections.unmodifiableMap(certificate));
        groups.put("languageSkill", Map.of("language", FormControl.SELECT));
        return java.util.Collections.unmodifiableMap(groups);
    }

    /** Step-3 names for rows 0..{@link #V1_HISTORY_MAX_CARDS}-1 of every group. */
    private static Map<String, FormControl> indexedFields(Map<String, Map<String, FormControl>> templates) {
        var fields = new LinkedHashMap<String, FormControl>();
        templates.forEach((group, controls) -> {
            for (int i = 0; i < V1_HISTORY_MAX_CARDS; i++) {
                for (var template : controls.entrySet()) {
                    fields.put("hplace.v1." + group + "." + i + "." + template.getKey(), template.getValue());
                }
            }
        });
        return java.util.Collections.unmodifiableMap(fields);
    }

    private static List<String> majorAdds() {
        var names = new java.util.ArrayList<String>();
        for (String group : List.of("college", "graduateSchool")) {
            for (int i = 0; i < V1_HISTORY_MAX_CARDS; i++) names.add("hplace.v1." + group + "." + i + ".major.add");
        }
        return List.copyOf(names);
    }

    private static Set<String> v1Names(String... keys) {
        return java.util.Arrays.stream(keys).map(key -> "hplace.v1." + key).collect(java.util.stream.Collectors.toUnmodifiableSet());
    }

    private static boolean empty(List<?> values) {
        return values == null || values.isEmpty();
    }
}
