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
        rules.add(new FieldRule("basicInformation.englishName", FormElement.INPUT, FormControl.TEXT,
            new DerivedBinding(DerivedRecipe.ENGLISH_FULL_NAME_GIVEN_FIRST), false, "basicInformation.englishName"));
        add(rules, GreetingFormFingerprint.PHONE, FormControl.TEXT, "contact.contact.phoneNumber", null);
        add(rules, "basicInformation.email", FormControl.TEXT, "contact.contact.email", null);
        add(rules, "basicInformation.nationalityCode", FormControl.TEXT, "personal.personal.nationality", null);
        add(rules, "basicInformation.birthdate", FormControl.BUTTON, "personal.personal.birthDate", null);
        add(rules, "personalInformation.currentAddress.postalCode", FormControl.TEXT, "contact.contact.postalCode", null);
        add(rules, "personalInformation.currentAddress.address", FormControl.TEXT, "contact.contact.addressLine1", null);
        add(rules, "personalInformation.currentAddress.detailedAddress", FormControl.TEXT, "contact.contact.addressLine2", null);
        add(rules, "militaryServicePreferentialEmploymentStatus.militaryService.militaryServiceStatus",
            FormControl.BUTTON, "military.military.militaryStatus", null);
        add(rules, "militaryServicePreferentialEmploymentStatus.disability.disabilityStatus",
            FormControl.RADIO, "disability.disability.disabilityStatus", null);
        add(rules, "militaryServicePreferentialEmploymentStatus.veteran.veteranStatus",
            FormControl.RADIO, "veteran.veteran.veteranStatus", null);
        remainingFields(rules);
        conditionalDetails(rules);
        education(rules, "universities", "university", "educationuniversity");
        education(rules, "graduateSchools", "graduateSchool", "educationgraduateschool");
        return List.copyOf(rules);
    }

    private static void remainingFields(List<FieldRule> rules) {
        lookup(rules, "basicInformation.gender", "personal.personal.gender", Map.of(
            "남성", "남성", "여성", "여성", "남자", "남성", "여자", "여성"));
        String high = "educationalBackground.highSchool.";
        add(rules, high + "schoolName", FormControl.TEXT, "education.highSchool.schoolName", "educationhighschool");
        add(rules, high + "completionStatus", FormControl.BUTTON, "education.highSchool.completionStatus", "educationhighschool");
        add(rules, high + "enrollmentPeriod.startDate", FormControl.BUTTON, "education.highSchool.startDate", "educationhighschool");
        add(rules, high + "enrollmentPeriod.endDate", FormControl.BUTTON, "education.highSchool.endDate", "educationhighschool");

        String work = "workHistory.workExperiences.*.";
        lookup(rules, work + "employmentType", "careers.career.employmentType", Map.of(
            "정규", "정규직", "계약", "계약직", "파견", "파견직", "프리랜서", "프리랜서",
            "개인사업", "개인사업", "병역특례", "병역특례", "인턴", "인턴", "아르바이트", "아르바이트", "기타", "기타"), "careerscareer");
        add(rules, work + "companyName", FormControl.TEXT, "careers.career.companyName", "careerscareer");
        add(rules, work + "employmentPeriod.startDate", FormControl.BUTTON, "careers.career.startDate", "careerscareer");
        add(rules, work + "employmentPeriod.endDate", FormControl.BUTTON, "careers.career.endDate", "careerscareer");
        add(rules, work + "employmentStatus", FormControl.CHECKBOX, "careers.career.employmentStatus", "careerscareer");
        add(rules, work + "department", FormControl.TEXT, "careers.career.department", "careerscareer");
        add(rules, work + "positionRank", FormControl.TEXT, "careers.career.position", "careerscareer");
        rules.add(new FieldRule(work + "dutiesResponsibility", FormElement.TEXTAREA, FormControl.TEXTAREA,
            new DirectBinding("careers.career.responsibilities"), false, work + "dutiesResponsibility", "careerscareer"));
        add(rules, work + "reasonForResignation", FormControl.TEXT, "careers.career.terminationReason", "careerscareer");

        String project = "workHistory.projects.*.";
        add(rules, project + "projectName", FormControl.TEXT, "projects.project.projectName", "projectsproject");
        add(rules, project + "roleParticipationRole", FormControl.TEXT, "projects.project.role", "projectsproject");
        add(rules, project + "projectPeriod.startDate", FormControl.BUTTON, "projects.project.startDate", "projectsproject");
        add(rules, project + "projectPeriod.endDate", FormControl.BUTTON, "projects.project.endDate", "projectsproject");
        rules.add(new FieldRule(project + "projectDescription", FormElement.TEXTAREA, FormControl.TEXTAREA,
            new DirectBinding("projects.project.activityDetails"), false, project + "projectDescription", "projectsproject"));

        String activities = "languagesCertificationsAndOtherActivity.";
        String test = activities + "certifiedLanguageTests.*.";
        add(rules, test + "foreignLanguage", FormControl.BUTTON, "languages.languageTest.language", "languageslanguagetest");
        add(rules, test + "testName", FormControl.TEXT, "languages.languageTest.testName", "languageslanguagetest");
        add(rules, test + "acquisitionDate", FormControl.BUTTON, "languages.languageTest.acquisitionDate", "languageslanguagetest");
        add(rules, test + "grade", FormControl.BUTTON, "languages.languageTest.grade", "languageslanguagetest");
        add(rules, test + "score.score", FormControl.TEXT, "languages.languageTest.grade", "languageslanguagetest");
        add(rules, test + "registrationNumber", FormControl.TEXT, "languages.languageTest.registrationNo", "languageslanguagetest");
        String skill = activities + "foreignLanguageProficiencies.*.";
        add(rules, skill + "foreignLanguage", FormControl.BUTTON, "languages.languageSkill.language", "languageslanguageskill");
        lookup(rules, skill + "conversationalProficiency", "languages.languageSkill.conversationalLevel", Map.of(
            "기초수준", "기초수준", "일상 대화", "일상 대화 가능", "일상 대화 가능", "일상 대화 가능", "비즈니스 가능", "비즈니스 가능", "원어민 수준", "원어민 수준"), "languageslanguageskill");
        String certificate = activities + "certificatesLicenses.*.";
        add(rules, certificate + "credentials", FormControl.TEXT, "certifications.certificate.name", "certificationscertificate");
        add(rules, certificate + "issuingAgency", FormControl.TEXT, "certifications.certificate.issuer", "certificationscertificate");
        add(rules, certificate + "acquisitionDate", FormControl.BUTTON, "certifications.certificate.acquisitionDate", "certificationscertificate");
        add(rules, certificate + "rating", FormControl.TEXT, "certifications.certificate.grade", "certificationscertificate");
        add(rules, certificate + "registrationNumber", FormControl.TEXT, "certifications.certificate.registrationNo", "certificationscertificate");
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
        add(rules, prefix + "militaryService.militaryOccupationalSpecialty", FormControl.TEXT,
            "military.military.militarySpecialty", null);
        add(rules, prefix + "disability.disabilityRegistrationNumber", FormControl.TEXT,
            "disability.disability.disabilityRegistrationNumber", null);
        lookup(rules, prefix + "militaryService.militaryServiceClassification", "military.military.militaryType", Map.of(
            "현역병", "현역병", "상근예비역", "상근예비역", "공익근무요원", "공익근무요원",
            "전문연구요원", "전문연구요원", "산업기능요원", "산업기능요원"));
        lookup(rules, prefix + "militaryService.dischargeType", "military.military.dischargeType", Map.ofEntries(
            Map.entry("만기전역", "만기제대"), Map.entry("만기제대", "만기제대"),
            Map.entry("의가사전역", "의가사제대"), Map.entry("의가사제대", "의가사제대"),
            Map.entry("의병전역", "의병제대"), Map.entry("의병제대", "의병제대"),
            Map.entry("상이전역", "상이제대"), Map.entry("상이제대", "상이제대"),
            Map.entry("소집해제", "소집해제"), Map.entry("불명예제대", "불명예제대")));
        lookup(rules, prefix + "veteranStatus.veteranRelationship", "veteran.veteran.veteranRelation", Map.ofEntries(
            Map.entry("부", "부"), Map.entry("모", "모"), Map.entry("조부", "조부"), Map.entry("조모", "조모"),
            Map.entry("외조부", "외조부"), Map.entry("외조모", "외조모"), Map.entry("형제", "형제"),
            Map.entry("자매", "자매"), Map.entry("남매", "남매"), Map.entry("배우자", "배우자"),
            Map.entry("자녀", "자녀"), Map.entry("본인", "본인")));
    }

    private static void lookup(List<FieldRule> rules, String name, String key, Map<String, String> options) {
        lookup(rules, name, key, options, null);
    }

    private static void lookup(List<FieldRule> rules, String name, String key, Map<String, String> options, String groupId) {
        rules.add(new FieldRule(name, FormElement.INPUT, FormControl.BUTTON,
            new LookupBinding(key, options), false, name, groupId));
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
        lookup(rules, name + "schoolLocation", key + "schoolRegion", Map.ofEntries(
            Map.entry("서울", "서울"), Map.entry("부산", "부산"), Map.entry("대구", "대구"), Map.entry("인천", "인천"),
            Map.entry("광주", "광주"), Map.entry("대전", "대전"), Map.entry("울산", "울산"), Map.entry("세종", "세종"),
            Map.entry("경기", "경기"), Map.entry("강원", "강원"), Map.entry("충북", "충북"), Map.entry("충남", "충남"),
            Map.entry("전북", "전북"), Map.entry("전남", "전남"), Map.entry("경북", "경북"), Map.entry("경남", "경남"),
            Map.entry("제주", "제주"), Map.entry("해외", "해외")), groupId);
        if (siteGroup.equals("universities"))
            add(rules, name + "totalCreditsEarned", FormControl.TEXT, key + "totalCredits", groupId);
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
            for (int slot : List.of(1, 2)) {
                String major = name + "majors." + slot;
                rules.add(new FieldRule(major, FormElement.INPUT, FormControl.TEXT,
                    new DerivedBinding(slot == 1 ? DerivedRecipe.UNIVERSITY_ADDITIONAL_MAJOR_1_NAME : DerivedRecipe.UNIVERSITY_ADDITIONAL_MAJOR_2_NAME),
                    false, major, groupId));
                rules.add(new FieldRule(major + ".majorClassification", FormElement.INPUT, FormControl.BUTTON,
                    new DerivedBinding(slot == 1 ? DerivedRecipe.UNIVERSITY_ADDITIONAL_MAJOR_1_CLASSIFICATION : DerivedRecipe.UNIVERSITY_ADDITIONAL_MAJOR_2_CLASSIFICATION),
                    false, major + ".majorClassification", groupId));
            }
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
