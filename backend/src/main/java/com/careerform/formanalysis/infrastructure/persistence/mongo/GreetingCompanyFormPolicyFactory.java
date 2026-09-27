package com.careerform.formanalysis.infrastructure.persistence.mongo;

import java.util.List;
import java.util.ArrayList;
import java.util.Map;

import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldRule;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldStructure;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldsFingerprint;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.PreparationFingerprint;
import com.careerform.formanalysis.application.policy.GreetingFormFingerprint;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DerivedBinding;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DerivedRecipe;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DirectBinding;
import com.careerform.formanalysis.application.port.FieldMappingResolver.LookupBinding;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement;

final class GreetingCompanyFormPolicyFactory {

    static final long VERSION = 1;

    private GreetingCompanyFormPolicyFactory() {
    }

    static FormAnalysisPolicyDocument create() {
        return new FormAnalysisPolicyDocument(
            "greeting-policy-v1",
            "greeting",
            VERSION,
            PreparationFingerprint.noActions(),
            FieldsFingerprint.anySections(List.of(
                new FieldStructure(GreetingFormFingerprint.NAME,
                    FormElement.INPUT, FormControl.TEXT),
                new FieldStructure(GreetingFormFingerprint.PHONE,
                    FormElement.INPUT, FormControl.TEXT)
            )),
            List.of(),
            fieldRules()
        );
    }

    private static List<FieldRule> fieldRules() {
        List<FieldRule> rules = new ArrayList<>();
        rules.add(new FieldRule(GreetingFormFingerprint.NAME, FormElement.INPUT, FormControl.TEXT,
            new DerivedBinding(DerivedRecipe.KOREAN_FULL_NAME), false, GreetingFormFingerprint.NAME));
        add(rules, GreetingFormFingerprint.PHONE, FormControl.TEXT, "contact.contact.phoneNumber", null);
        add(rules, "basicInformation.email", FormControl.TEXT, "contact.contact.email", null);
        add(rules, "basicInformation.nationalityCode", FormControl.TEXT, "personal.personal.nationality", null);
        add(rules, "basicInformation.birthdate", FormControl.BUTTON, "personal.personal.birthDate", null);
        add(rules, "militaryServicePreferentialEmploymentStatus.militaryService.militaryServiceStatus",
            FormControl.BUTTON, "military.military.militaryStatus", null);
        add(rules, "militaryServicePreferentialEmploymentStatus.disability.disabilityStatus",
            FormControl.RADIO, "disability.disability.disabilityStatus", null);
        add(rules, "militaryServicePreferentialEmploymentStatus.veteran.veteranStatus",
            FormControl.RADIO, "veteran.veteran.veteranStatus", null);
        conditionalDetails(rules);
        education(rules, "universities", "university", "educationuniversity");
        education(rules, "graduateSchools", "graduateSchool", "educationgraduateschool");
        return List.copyOf(rules);
    }

    private static void conditionalDetails(List<FieldRule> rules) {
        String prefix = "militaryServicePreferentialEmploymentStatus.";
        lookup(rules, prefix + "militaryService.branchOfService", "military.military.militaryBranch", Map.of(
            "육군", "육군", "해군", "해군", "공군", "공군", "해병대", "해병",
            "전투경찰", "전경", "해양경찰", "해경", "의무경찰", "의경", "의무소방", "의무소방"));
        lookup(rules, prefix + "militaryService.rank", "military.military.militaryRank", Map.of(
            "이병", "이병", "일병", "일병", "상병", "상병", "병장", "병장"));
        add(rules, prefix + "militaryService.servicePeriod.startDate", FormControl.BUTTON,
            "military.military.serviceStartDate", null);
        add(rules, prefix + "militaryService.servicePeriod.endDate", FormControl.BUTTON,
            "military.military.serviceEndDate", null);
        lookup(rules, prefix + "disability.degreeOfDisability", "disability.disability.disabilityGrade", Map.of(
            "중증", "중증(심한장애)", "경증", "경증(심하지 않은 장애)",
            "중증(심한장애)", "중증(심한장애)", "경증(심하지 않은 장애)", "경증(심하지 않은 장애)"));
        lookup(rules, prefix + "disability.descriptionOfDisability", "disability.disability.disabilityType",
            Map.ofEntries(
                Map.entry("지체장애", "지체장애"), Map.entry("뇌병변장애", "뇌병변장애"),
                Map.entry("뇌전증장애(간질장애)", "뇌전증장애(간질장애)"), Map.entry("시각장애", "시각장애"),
                Map.entry("청각장애", "청각장애"), Map.entry("언어장애", "언어장애"),
                Map.entry("지적장애(정신박약/정신지체)", "지적장애(정신박약/정신지체)"),
                Map.entry("자폐성장애(발달장애)", "자폐성장애(발달장애)"), Map.entry("정신장애", "정신장애"),
                Map.entry("신장장애", "신장장애"), Map.entry("심장장애", "심장장애"),
                Map.entry("호흡기장애", "호흡기장애"), Map.entry("간장애", "간장애"),
                Map.entry("안면장애", "안면장애"), Map.entry("장루・요루장애", "장루・요루장애"),
                Map.entry("기타", "기타")));
        add(rules, prefix + "veteranStatus.veteransRegistrationNumber", FormControl.TEXT,
            "veteran.veteran.veteranNumber", null);
    }

    private static void lookup(List<FieldRule> rules, String name, String key, Map<String, String> options) {
        rules.add(new FieldRule(name, FormElement.INPUT, FormControl.BUTTON,
            new LookupBinding(key, options), false, name));
    }

    private static void education(List<FieldRule> rules, String siteGroup, String profileGroup, String groupId) {
        String name = "educationalBackground." + siteGroup + ".*.";
        String key = "education." + profileGroup + ".";
        add(rules, name + "schoolName", FormControl.TEXT, key + "schoolName", groupId);
        add(rules, name + "degreeLevel", siteGroup.equals("universities") ? FormControl.RADIO : FormControl.BUTTON,
            key + "degreeLevel", groupId);
        add(rules, name + "enrollmentPeriod.startDate", FormControl.BUTTON, key + "startDate", groupId);
        add(rules, name + "enrollmentPeriod.endDate", FormControl.BUTTON, key + "endDate", groupId);
        add(rules, name + "completionStatus", FormControl.BUTTON, key + "completionStatus", groupId);
        add(rules, name + "attendanceType", FormControl.RADIO, key + "attendanceType", groupId);
        add(rules, name + "gpa.score", FormControl.TEXT, key + "gpaScore", groupId);
        if (siteGroup.equals("universities")) {
            rules.add(new FieldRule(name + "gpa.scoreScale", FormElement.INPUT, FormControl.BUTTON,
                new LookupBinding(key + "gpaScale", Map.of(
                    "4.00", "4.0", "4.30", "4.3", "4.50", "4.5", "100.00", "100")),
                false, name + "gpa.scoreScale", groupId));
        } else {
            rules.add(new FieldRule(name + "gpa.scoreScale", FormElement.INPUT, FormControl.BUTTON,
                new LookupBinding(key + "gpaScale", Map.ofEntries(
                    Map.entry("4.00", "4.0"), Map.entry("4.30", "4.3"),
                    Map.entry("4.50", "4.5"), Map.entry("100.00", "100"),
                    Map.entry("3.0", "3.0"), Map.entry("3.5", "3.5"),
                    Map.entry("4.0", "4.0"), Map.entry("4.3", "4.3"),
                    Map.entry("4.5", "4.5"), Map.entry("5.0", "5.0"),
                    Map.entry("7.0", "7.0"), Map.entry("20", "20"), Map.entry("100", "100"))),
                false, name + "gpa.scoreScale", groupId));
        }
        add(rules, name + "majors.0", FormControl.TEXT, key + "majorName", groupId);
        if (siteGroup.equals("universities")) {
            rules.add(new FieldRule(name + "admissionType", FormElement.INPUT, FormControl.RADIO,
                new LookupBinding(key + "transferStatus", Map.of("비해당", "입학", "해당", "편입")),
                false, name + "admissionType", groupId));
        }
        if (siteGroup.equals("graduateSchools")) {
            add(rules, name + "admissionType", FormControl.RADIO, key + "admissionType", groupId);
            add(rules, name + "majors.0.majorClassification", FormControl.BUTTON, key + "majorClassification", groupId);
            add(rules, name + "majors.0.majorField", FormControl.BUTTON, key + "majorField", groupId);
            add(rules, name + "majors.1", FormControl.TEXT, key + "additionalMajorName", groupId);
            add(rules, name + "majors.1.majorClassification", FormControl.BUTTON, key + "additionalMajorClassification", groupId);
            add(rules, name + "majors.1.majorField", FormControl.BUTTON, key + "additionalMajorField", groupId);
        }
    }

    private static void add(List<FieldRule> rules, String name, FormControl control, String key, String groupId) {
        rules.add(new FieldRule(name, FormElement.INPUT, control, new DirectBinding(key), false, name, groupId));
    }
}
