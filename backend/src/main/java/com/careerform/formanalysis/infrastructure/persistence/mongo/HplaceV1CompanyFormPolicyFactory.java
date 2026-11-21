package com.careerform.formanalysis.infrastructure.persistence.mongo;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;

import com.careerform.formanalysis.application.policy.CompanyFormPolicy;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.ActionKind;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.ActionRule;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.ActionStructure;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldRule;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldStructure;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldsFingerprint;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.PreparationFingerprint;
import com.careerform.formanalysis.application.policy.HplaceFormFingerprint;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DerivedBinding;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DerivedRecipe;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DirectBinding;
import com.careerform.formanalysis.application.port.FieldMappingResolver.LookupBinding;
import com.careerform.formanalysis.application.port.FieldMappingResolver.ValueBinding;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;

/**
 * In-code policy for the Hplace v1 applicant app resume form: step 1 (section {@code hplace-v1-basic}) and
 * step 2 education and career cards (section {@code hplace-v1-history}). It is never stored, so the
 * versioned MRS2 documents (v3, v4) and their active-version pointer stay untouched.
 * Choices shared with MRS2 reuse the MRS2 bindings.
 */
final class HplaceV1CompanyFormPolicyFactory {

    static final long VERSION = 1;

    private HplaceV1CompanyFormPolicyFactory() {
    }

    static CompanyFormPolicy create(Predicate<String> isSupportedProfileKey) {
        var mrs2 = HplaceCompanyFormPolicyFactory.create().fieldRules();
        var rules = new ArrayList<FieldRule>();
        rules.add(rule("englishName.familyFirst", FormControl.TEXT, new DerivedBinding(DerivedRecipe.ENGLISH_FULL_NAME_FAMILY_FIRST)));
        for (String key : List.of("birthday", "emergencyPhone", "serviceStartDate", "serviceEndDate", "veteranNumber")) {
            rules.add(rule(key, FormControl.TEXT, mrs2Binding(mrs2, key)));
        }
        rules.add(rule("militarySpecialty", FormControl.TEXT, new DirectBinding("military.military.militarySpecialty")));
        rules.add(rule("disabilityRegistrationNumber", FormControl.TEXT,
            new DirectBinding("disability.disability.disabilityRegistrationNumber")));
        // Current address: the extension writes the three page inputs only through the site's address dialog.
        // Same profile keys as the MRS2 current-address triplet.
        rules.add(rule("postalCode", FormControl.TEXT, new DirectBinding("contact.contact.postalCode")));
        rules.add(rule("addressLine1", FormControl.TEXT, new DirectBinding("contact.contact.addressLine1")));
        rules.add(rule("addressLine2", FormControl.TEXT, new DirectBinding("contact.contact.addressLine2")));
        for (String key : List.of("gender", "militaryStatus", "disabilityStatus", "veteranStatus")) {
            rules.add(rule(key, FormControl.RADIO, mrs2Binding(mrs2, key)));
        }
        for (String key : List.of("militaryRank", "dischargeType", "disabilityGrade", "disabilityType", "nationality")) {
            rules.add(rule(key, FormControl.SELECT, mrs2Binding(mrs2, key)));
        }
        rules.add(rule("militaryBranch", FormControl.SELECT, new LookupBinding("military.military.militaryBranch", Map.of(
            "육군", "육군", "해군", "해군", "공군", "공군", "해병대", "해병", "전투경찰", "전경",
            "해양경찰", "해경", "의무경찰", "의경", "의무소방", "의무소방"))));
        rules.add(rule("veteranRelation", FormControl.SELECT, new LookupBinding("veteran.veteran.veteranRelation",
            HplaceCompanyFormPolicyFactory.identity("부", "모", "조부", "조모", "외조부", "외조모", "형제", "자매", "남매", "배우자", "자녀"))));
        rules.addAll(historyRules());
        var structures = rules.stream().map(rule -> new FieldStructure(rule.structuralName(), rule.element(), rule.control())).toList();
        // Step 1 accepts no action and step 2 accepts any subset of the add actions, including none: the Hplace
        // fingerprint enforces both. The structures below only feed the action resolver lookup.
        var preparation = new PreparationFingerprint(Set.of(HplaceFormFingerprint.V1_HISTORY_SECTION),
            List.of(button(HplaceFormFingerprint.V1_HISTORY_CARD_ADDS)), List.of(button(HplaceFormFingerprint.V1_HISTORY_MAJOR_ADDS)));
        var actions = new ArrayList<ActionRule>();
        for (String name : HplaceFormFingerprint.V1_HISTORY_CARD_ADDS) actions.add(new ActionRule(name, ActionKind.ADD, null));
        for (String name : HplaceFormFingerprint.V1_HISTORY_MAJOR_ADDS) actions.add(new ActionRule(name, ActionKind.ADD, null));
        return CompanyFormPolicy.create("hplace", VERSION, preparation,
            new FieldsFingerprint(Set.of(HplaceFormFingerprint.V1_SECTION, HplaceFormFingerprint.V1_HISTORY_SECTION), structures),
            actions, rules, isSupportedProfileKey);
    }

    /** One rule per allowed history name; the binding depends only on the group and the field. */
    private static List<FieldRule> historyRules() {
        var bindings = historyBindings();
        var rules = new ArrayList<FieldRule>();
        HplaceFormFingerprint.V1_HISTORY_TEMPLATES.forEach((group, templates) -> {
            for (int i = 0; i < HplaceFormFingerprint.historyCards(group); i++) {
                for (var template : templates.entrySet()) {
                    var binding = bindings.get(group + "." + template.getKey());
                    if (binding == null) throw new IllegalStateException("Missing Hplace v1 history binding");
                    rules.add(rule(group + "." + i + "." + template.getKey(), template.getValue(), binding));
                }
            }
        });
        return rules;
    }

    private static Map<String, ValueBinding> historyBindings() {
        var mrs2 = HplaceCompanyFormPolicyFactory.createNative().fieldRules();
        var regions = new LinkedHashMap<String, String>();
        String[][] pairs = {{"seoul", "서울"}, {"busan", "부산"}, {"daegu", "대구"}, {"incheon", "인천"}, {"gwangju", "광주"},
            {"daejeon", "대전"}, {"ulsan", "울산"}, {"sejong", "세종"}, {"gyeonggi", "경기"}, {"gangwon", "강원"},
            {"chungbuk", "충북"}, {"chungnam", "충남"}, {"jeonbuk", "전북"}, {"jeonnam", "전남"}, {"gyeongbuk", "경북"},
            {"gyeongnam", "경남"}, {"jeju", "제주"}};
        for (String[] pair : pairs) regions.put("region:" + pair[0], pair[1]);
        var bindings = new LinkedHashMap<String, ValueBinding>();
        bindings.put("highschool.graduationTypeCode", nativeBinding(mrs2, "highschool.graduationTypeCode"));
        bindings.put("highschool.academyName", new DirectBinding("education.highSchool.schoolName"));
        bindings.put("highschool.locationCode", new LookupBinding("education.highSchool.schoolRegion", regions));
        bindings.put("highschool.dayOrNight", new LookupBinding("education.highSchool.attendanceType",
            Map.of("attendance:day", "주간", "attendance:night", "야간")));
        bindings.put("highschool.entranceDate", new DirectBinding("education.highSchool.startDate"));
        bindings.put("highschool.graduationDate", new DirectBinding("education.highSchool.endDate"));
        for (String group : List.of("college", "graduateSchool")) {
            String profile = "college".equals(group) ? "education.university." : "education.graduateSchool.";
            bindings.put(group + ".academyName", new DirectBinding(profile + "schoolName"));
            bindings.put(group + ".entranceDate", new DirectBinding(profile + "startDate"));
            bindings.put(group + ".graduationDate", new DirectBinding(profile + "endDate"));
            bindings.put(group + ".graduationTypeCode", nativeBinding(mrs2, group + ".graduationTypeCode"));
            bindings.put(group + ".score", new DirectBinding(profile + "gpaScore"));
            bindings.put(group + ".perfectScore", nativeBinding(mrs2, group + ".perfectScore"));
            bindings.put(group + ".major0.majorName", new DirectBinding(profile + "majorName"));
        }
        bindings.put("college.degreeTypeCode", new LookupBinding("education.university.degreeLevel",
            HplaceCompanyFormPolicyFactory.identity("학사", "전문학사")));
        bindings.put("college.entranceTypeCode", nativeBinding(mrs2, "college.entranceTypeCode"));
        bindings.put("graduateSchool.degreeTypeCode", new LookupBinding("education.graduateSchool.degreeLevel",
            HplaceCompanyFormPolicyFactory.identity("석사", "박사")));
        bindings.put("graduateSchool.entranceTypeCode", new LookupBinding("education.graduateSchool.admissionType",
            HplaceCompanyFormPolicyFactory.identity("입학", "편입")));
        bindings.put("career.employmentType", nativeBinding(mrs2, "career.careerCriteriaCodeSn"));
        bindings.put("career.workingStatus", new LookupBinding("careers.career.employmentStatus",
            Map.of("재직중", "재직중", "퇴직", "퇴사")));
        bindings.put("career.entranceDate", new DirectBinding("careers.career.startDate"));
        bindings.put("career.leavingDate", new DirectBinding("careers.career.endDate"));
        bindings.put("career.company", new DirectBinding("careers.career.companyName"));
        bindings.put("career.department", new DirectBinding("careers.career.department"));
        bindings.put("career.position", new DirectBinding("careers.career.position"));
        bindings.put("career.assignedTask", new DirectBinding("careers.career.responsibilities"));
        return bindings;
    }

    private static ActionStructure button(List<String> names) {
        return new ActionStructure(names, PreparationAnalysisRequest.FormElement.BUTTON, PreparationAnalysisRequest.FormControl.BUTTON);
    }

    private static ValueBinding mrs2Binding(List<FieldRule> mrs2, String key) {
        String name = "hplace.detail." + key;
        return mrs2.stream().filter(rule -> name.equals(rule.structuralName())).findFirst().orElseThrow().valueBinding();
    }

    private static ValueBinding nativeBinding(List<FieldRule> mrs2, String key) {
        String name = "hplace.mrs2." + key;
        return mrs2.stream().filter(rule -> name.equals(rule.structuralName())).findFirst().orElseThrow().valueBinding();
    }

    private static FieldRule rule(String key, FormControl control, ValueBinding binding) {
        String name = "hplace.v1." + key;
        return new FieldRule(name, control == FormControl.SELECT ? FormElement.SELECT : FormElement.INPUT,
            control, binding, false, name);
    }
}
