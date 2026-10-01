package com.careerform.formanalysis.infrastructure.persistence.mongo;

import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import com.careerform.formanalysis.application.policy.CompanyFormPolicy.ActionKind;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.ActionRule;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.ActionStructure;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldRule;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldStructure;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldsFingerprint;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.PreparationFingerprint;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DirectBinding;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DerivedBinding;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DerivedRecipe;
import com.careerform.formanalysis.application.port.FieldMappingResolver.LookupBinding;
import com.careerform.formanalysis.application.port.FieldMappingResolver.ButtonOptionBinding;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;

@Component
@Profile("local")
final class LocalCompanyFormPolicySeeder implements ApplicationRunner {

    static final String COMPANY_KEY = "sk";
    static final long VERSION = 25;
    static final long HYUNDAI_VERSION = 8;

    private final FormAnalysisCompanyMongoRepository companies;
    private final FormAnalysisPolicyMongoRepository policies;

    LocalCompanyFormPolicySeeder(
        FormAnalysisCompanyMongoRepository companies,
        FormAnalysisPolicyMongoRepository policies
    ) {
        this.companies = companies;
        this.policies = policies;
    }

    @Override
    public void run(ApplicationArguments arguments) {
        policies.save(skPolicy());
        companies.save(new FormAnalysisCompanyDocument(
            COMPANY_KEY,
            COMPANY_KEY,
            "www.skcareers.com",
            List.of("/Application/Index/"),
            VERSION
        ));
        policies.save(HyundaiCompanyFormPolicyFactory.create());
        companies.save(new FormAnalysisCompanyDocument(
            "hyundai",
            "hyundai",
            "talent.hyundai.com",
            List.of("/apply/applyWrite.hc"),
            HYUNDAI_VERSION
        ));
    }


    static FormAnalysisPolicyDocument skPolicy() {
        return new FormAnalysisPolicyDocument(
            "sk-policy-v8",
            COMPANY_KEY,
            VERSION,
            new PreparationFingerprint(
                Set.of("section-1"),
                List.of(
                    actionStructure("btnSearchAddress")
                ),
                List.of(
                    new ActionStructure(
                        "prsMilitarySvcStatus",
                        PreparationAnalysisRequest.FormElement.SELECT,
                        PreparationAnalysisRequest.FormControl.SELECT
                    ),
                    new ActionStructure("prsMilitarySvcYN", PreparationAnalysisRequest.FormElement.INPUT,
                        PreparationAnalysisRequest.FormControl.RADIO, "prsMilitarySvcYN"),
                    new ActionStructure("prsVeteranBenefitYN", PreparationAnalysisRequest.FormElement.INPUT,
                        PreparationAnalysisRequest.FormControl.RADIO, "prsVeteranBenefitYN"),
                    new ActionStructure("prsDisabledYN", PreparationAnalysisRequest.FormElement.INPUT,
                        PreparationAnalysisRequest.FormControl.RADIO, "prsDisabledYN"),
                    actionStructure("대학 학력 정보 추가"),
                    actionStructure(List.of("btnAddEducationHigh", "고등학교 학력 정보 추가")),
                    actionStructure(List.of("btnAddEducationGrad", "대학원 학력 정보 추가")),
                    actionStructure(List.of("btnAddCareer", "경력 사항 추가")),
                    actionStructure(List.of("btnAddCert", "자격/면허 추가")),
                    actionStructure(List.of("btnAddLangExam", "공인 외국어 시험 추가", "어학 항목 추가")),
                    radioStructure("eduMajorDoubleYN"),
                    radioStructure("eduMajorSubYN")
                )
            ),
            new FieldsFingerprint(
                Set.of("section-1"),
                List.of(
                    textStructure("prsApplicantName"),
                    textStructure("prsEmail"),
                    textStructure("prsPhone")
                )
            ),
            List.of(
                new ActionRule("btnSearchAddress", ActionKind.SEARCH_ADDRESS, null),
                new ActionRule(
                    "prsMilitarySvcYN", ActionKind.CHOOSE_RADIO,
                    "section-1", "military.military.militaryStatus", "대상",
                    List.of("prsMilitarySvcStatus"), List.of("군필", "미필", "면제", "복무중")
                ),
                new ActionRule(
                    "prsMilitarySvcStatus", ActionKind.SELECT_OPTION,
                    "section-1", "military.military.militaryStatus", null, null,
                    List.of("군필", "미필", "면제", "복무중")
                ),
                new ActionRule("prsVeteranBenefitYN", ActionKind.CHOOSE_RADIO, "section-1", "veteran.veteran.veteranStatus", "대상", List.of("prsVeteranBenefitNumber", "prsVeteranBenefitRelation")),
                new ActionRule("prsDisabledYN", ActionKind.CHOOSE_RADIO, "section-1", "disability.disability.disabilityStatus", "대상", List.of("prsDisabledType", "prsDisabledTypeDtl"), List.of("장애", "예", "대상", "해당", "있음")),
                addRule("대학 학력 정보 추가", "eduEducationName"),
                addRule(List.of("btnAddEducationHigh", "고등학교 학력 정보 추가"), "eduhgEducationName"),
                addRule(List.of("btnAddEducationGrad", "대학원 학력 정보 추가"), "edugdEducationName"),
                addRule(List.of("btnAddCareer", "경력 사항 추가")),
                addRule(List.of("btnAddCert", "자격/면허 추가"), "cerCertName"),
                addRule(
                    List.of("btnAddLangExam", "공인 외국어 시험 추가", "어학 항목 추가"),
                    "lngLanguageType",
                    "lngExamName",
                    "lngExamScore",
                    "lngScoreDate",
                    "lngCertNumber"
                ),
                new ActionRule("eduMajorDoubleYN", ActionKind.CHOOSE_RADIO,
                    "section-3", "education.university.doubleMajorStatus", "있음", List.of("eduMajorDouble"), null,
                    Map.of("eduMajorDouble", "education.university.additionalMajorName")),
                new ActionRule("eduMajorSubYN", ActionKind.CHOOSE_RADIO,
                    "section-3", "education.university.minorStatus", "있음", List.of("eduMajorSub"), null,
                    Map.of("eduMajorSub", "education.university.minorName"))
            ),
            List.of(
                derivedTextRule(
                    "prsApplicantName", DerivedRecipe.KOREAN_FULL_NAME
                ),
                textRule("prsEmail", "contact.contact.email"),
                textRule("prsEmailSub", "contact.contact.secondaryEmail"),
                textRule("prsPhone", "contact.contact.phoneNumber"),
                textRule(
                    "prsPhoneEmergency",
                    "contact.contact.emergencyPhoneNumber"
                ),
                selectRule(
                    "prsResidenceNation",
                    "contact.contact.residenceCountry"
                ),
                constrainedLookupSelectRule(
                    "prsNationality",
                    "prsNationality",
                    "personal.personal.nationality",
                    Map.of("대한민국", "대한민국")
                ),
                textRule("prsEngFirstName", "personal.personal.englishGivenName"),
                textRule("prsEngLastName", "personal.personal.englishFamilyName"),
                readonlyTextRule("prsZipCode", "contact.contact.postalCode"),
                readonlyTextRule("prsAddress", "contact.contact.addressLine1"),
                textRule("prsAddressDtl", "contact.contact.addressLine2"),
                constrainedTextRule(
                    "carCorpName",
                    "carCorpName",
                    "careers.career.companyName"
                ),
                constrainedTextRule(
                    "carDeptName",
                    "carDeptName",
                    "careers.career.department"
                ),
                constrainedTextRule(
                    "carPosition",
                    "carPosition",
                    "careers.career.position"
                ),
                constrainedTextareaRule(
                    "carDescription",
                    "carDescription",
                    "careers.career.responsibilities"
                ),
                constrainedDerivedTextRule(
                    "carFromDate",
                    "carFromDate",
                    DerivedRecipe.YEAR_MONTH,
                    "careers.career.startDate"
                ),
                constrainedDerivedTextRule(
                    "carToDate",
                    "carToDate",
                    DerivedRecipe.YEAR_MONTH,
                    "careers.career.endDate"
                ),
                lookupSelectRule(
                    "carWorkingYN",
                    "careers.career.employmentStatus",
                    Map.of("재직중", "재직 중", "퇴사", "퇴사")
                ),
                constrainedTextareaRule(
                    "carRetireDesc",
                    "carRetireDesc",
                    "careers.career.terminationReason"
                ),
                derivedRadioRule(
                    "prsVeteranBenefitYN", DerivedRecipe.BOOLEAN_YN,
                    "veteran.veteran.veteranStatus", "대상", "비대상"
                ),
                textRule(
                    "prsVeteranBenefitNumber",
                    "veteran.veteran.veteranNumber"
                ),
                textRule(
                    "prsVeteranBenefitRelation",
                    "veteran.veteran.veteranRelation"
                ),
                derivedRadioRule(
                    "prsDisabledYN", DerivedRecipe.BOOLEAN_YN,
                    "disability.disability.disabilityStatus", "대상", "비대상"
                ),
                constrainedLookupSelectRule(
                    "prsDisabledType",
                    "prsDisabledType",
                    "disability.disability.disabilityGrade",
                    Map.of(
                        "중증", "중증(기존1급~3급)",
                        "경증", "경증(기존4급~6급)"
                    )
                ),
                selectRule(
                    "prsDisabledTypeDtl",
                    "disability.disability.disabilityType"
                ),
                textRule(
                    "prsDisabledNumber",
                    "disability.disability.disabilityRegistrationNumber"
                ),
                selectRule(
                    "prsMilitarySvcStatus",
                    "military.military.militaryStatus"
                ),
                new FieldRule(
                    "prsMilitarySvcYN", FieldsAnalysisRequest.FormElement.INPUT,
                    FieldsAnalysisRequest.FormControl.RADIO,
                    new LookupBinding("military.military.militaryStatus", Map.of(
                        "군필", "대상", "미필", "대상", "면제", "대상", "복무중", "대상", "비대상", "비대상"
                    ))
                ),
                selectRule(
                    "prsMilitarySvcType",
                    "military.military.militaryType"
                ),
                selectRule(
                    "prsMilitarySvcCategory",
                    "military.military.militaryBranch"
                ),
                selectRule(
                    "prsMilitarySvcLevel",
                    "military.military.militaryRank"
                ),
                textRule(
                    "prsMilitarySvcFromDate",
                    "military.military.serviceStartDate"
                ),
                textRule(
                    "prsMilitarySvcToDate",
                    "military.military.serviceEndDate"
                ),
                textRule(
                    "prsMilitarySvcTypeReason",
                    "military.military.exemptionReason"
                ),
                constrainedTextRule("cerCertName", "cerCertName", "certifications.certificate.name"),
                textRule("cerCertSource", "certifications.certificate.issuer"),
                textRule(
                    "cerCertDate",
                    "certifications.certificate.acquisitionDate"
                ),
                textRule(
                    "cerCertNumber",
                    "certifications.certificate.registrationNo"
                ),
                constrainedTextRule("eduEducationName", "eduEducationName", "education.university.schoolName"),
                selectRule("eduLastestEducationType", "education.university.latestEducationType"),
                lookupSelectRule(
                    "eduEducationType",
                    "education.university.degreeLevel",
                    Map.of(
                        "전문학사", "전문대학(전문학사)",
                        "학사", "대학(학사)"
                    )
                ),
                selectRule(
                    "eduEducationStatus",
                    "education.university.completionStatus"
                ),
                selectRule(
                    "eduEducationRegion",
                    "education.university.schoolRegion"
                ),
                lookupSelectRule(
                    "eduDaytimeYN",
                    "education.university.attendanceType",
                    attendanceOptions()
                ),
                textRule("eduMajor", "education.university.majorName"),
                textRule("eduCredit", "education.university.gpaScore"),
                selectRule("eduCreditBase", "education.university.gpaScale"),
                textRule("eduCreditTotal", "education.university.totalCredits"),
                radioRule("eduMajorTransferYN", "education.university.transferStatus"),
                radioRule("eduMajorDoubleYN", "education.university.doubleMajorStatus"),
                radioRule("eduMajorSubYN", "education.university.minorStatus"),
                textRule("eduMajorDouble", "education.university.additionalMajorName"),
                textRule("eduMajorSub", "education.university.minorName"),
                constrainedDerivedTextRule(
                    "eduFromDate", "eduFromDate", DerivedRecipe.YEAR_MONTH,
                    "education.university.startDate"
                ),
                constrainedDerivedTextRule(
                    "eduToDate", "eduToDate", DerivedRecipe.YEAR_MONTH,
                    "education.university.endDate"
                ),
                selectRule(
                    "edugdEducationType",
                    "education.graduateSchool.degreeLevel"
                ),
                selectRule(
                    "edugdEducationStatus",
                    "education.graduateSchool.completionStatus"
                ),
                selectRule(
                    "edugdEducationRegion",
                    "education.graduateSchool.schoolRegion"
                ),
                lookupSelectRule(
                    "edugdDaytimeYN",
                    "education.graduateSchool.attendanceType",
                    attendanceOptions()
                ),
                textRule(
                    "edugdEducationName",
                    "education.graduateSchool.schoolName"
                ),
                textRule("edugdMajor", "education.graduateSchool.majorName"),
                textRule("edugdCredit", "education.graduateSchool.gpaScore"),
                selectRule(
                    "edugdCreditBase",
                    "education.graduateSchool.gpaScale"
                ),
                textRule(
                    "edugdFromDate",
                    "education.graduateSchool.startDate"
                ),
                textRule("edugdToDate", "education.graduateSchool.endDate"),
                textRule("eduhgEducationName", "education.highSchool.schoolName"),
                selectRule(
                    "eduhgEducationStatus",
                    "education.highSchool.completionStatus"
                ),
                selectRule(
                    "eduhgEducationRegion",
                    "education.highSchool.schoolRegion"
                ),
                textRule("eduhgFromDate", "education.highSchool.startDate"),
                textRule("eduhgToDate", "education.highSchool.endDate"),
                selectRule("lngLanguageType", "languages.languageTest.language"),
                constrainedTextRule("lngExamName", "lngExamName", "languages.languageTest.testName"),
                constrainedTextRule("lngExamScore", "lngExamScore", "languages.languageTest.grade"),
                selectRule("lngExamScoreSel", "languages.languageTest.grade"),
                textRule(
                    "lngScoreDate",
                    "languages.languageTest.acquisitionDate"
                ),
                textRule(
                    "lngCertNumber",
                    "languages.languageTest.registrationNo"
                )
            )
        );
    }

    static ActionRule addRule(String name, String... expectedFieldNames) {
        return expectedFieldNames.length == 0
            ? new ActionRule(name, ActionKind.ADD, null)
            : new ActionRule(name, ActionKind.ADD, null, null, null, List.of(expectedFieldNames));
    }

    static ActionStructure actionStructure(List<String> names) {
        return new ActionStructure(names, PreparationAnalysisRequest.FormElement.BUTTON, PreparationAnalysisRequest.FormControl.BUTTON);
    }

    static ActionRule addRule(List<String> names, String... expectedFieldNames) {
        return expectedFieldNames.length == 0
            ? new ActionRule(names, ActionKind.ADD, null)
            : new ActionRule(names, ActionKind.ADD, null, null, null, List.of(expectedFieldNames), null);
    }

    static ActionRule addRule(String name) {
        return new ActionRule(name, ActionKind.ADD, null);
    }

    static ActionStructure actionStructure(String name) {
        return new ActionStructure(
            name,
            PreparationAnalysisRequest.FormElement.BUTTON,
            PreparationAnalysisRequest.FormControl.BUTTON
        );
    }

    static ActionStructure radioStructure(String name) {
        return new ActionStructure(
            name,
            PreparationAnalysisRequest.FormElement.INPUT,
            PreparationAnalysisRequest.FormControl.RADIO
        );
    }

    static FieldStructure textStructure(String name) {
        return new FieldStructure(
            name,
            FieldsAnalysisRequest.FormElement.INPUT,
            FieldsAnalysisRequest.FormControl.TEXT
        );
    }

    static FieldStructure selectStructure(String name) {
        return new FieldStructure(
            name,
            FieldsAnalysisRequest.FormElement.SELECT,
            FieldsAnalysisRequest.FormControl.SELECT
        );
    }

    static FieldRule textRule(String name, String profileFieldKey) {
        return new FieldRule(
            name,
            FieldsAnalysisRequest.FormElement.INPUT,
            FieldsAnalysisRequest.FormControl.TEXT,
            profileFieldKey
        );
    }

    static FieldRule constrainedTextRule(
        String name,
        String requiredDomName,
        String profileFieldKey
    ) {
        return new FieldRule(
            name,
            FieldsAnalysisRequest.FormElement.INPUT,
            FieldsAnalysisRequest.FormControl.TEXT,
            new DirectBinding(profileFieldKey),
            false,
            requiredDomName
        );
    }

    static FieldRule constrainedTextareaRule(
        String name,
        String requiredDomName,
        String profileFieldKey
    ) {
        return new FieldRule(
            name,
            FieldsAnalysisRequest.FormElement.TEXTAREA,
            FieldsAnalysisRequest.FormControl.TEXTAREA,
            new DirectBinding(profileFieldKey),
            false,
            requiredDomName
        );
    }

    static FieldRule constrainedDerivedTextRule(
        String name,
        String requiredDomName,
        DerivedRecipe recipe,
        String profileFieldKey
    ) {
        return new FieldRule(
            name,
            FieldsAnalysisRequest.FormElement.INPUT,
            FieldsAnalysisRequest.FormControl.TEXT,
            new DerivedBinding(recipe, profileFieldKey),
            false,
            requiredDomName
        );
    }

    static FieldRule textareaRule(String name, String profileFieldKey) {
        return new FieldRule(
            name,
            FieldsAnalysisRequest.FormElement.TEXTAREA,
            FieldsAnalysisRequest.FormControl.TEXTAREA,
            profileFieldKey
        );
    }

    static FieldRule derivedTextRule(String name, DerivedRecipe recipe) {
        return new FieldRule(
            name,
            FieldsAnalysisRequest.FormElement.INPUT,
            FieldsAnalysisRequest.FormControl.TEXT,
            new DerivedBinding(recipe)
        );
    }

    static FieldRule derivedTextRule(
        String name, DerivedRecipe recipe, String profileFieldKey
    ) {
        return new FieldRule(
            name,
            FieldsAnalysisRequest.FormElement.INPUT,
            FieldsAnalysisRequest.FormControl.TEXT,
            new DerivedBinding(recipe, profileFieldKey)
        );
    }

    static FieldRule readonlyTextRule(
        String name,
        String profileFieldKey
    ) {
        return new FieldRule(
            name,
            FieldsAnalysisRequest.FormElement.INPUT,
            FieldsAnalysisRequest.FormControl.TEXT,
            profileFieldKey,
            true
        );
    }

    static FieldRule selectRule(String name, String profileFieldKey) {
        return new FieldRule(
            name,
            FieldsAnalysisRequest.FormElement.SELECT,
            FieldsAnalysisRequest.FormControl.SELECT,
            profileFieldKey
        );
    }

    static FieldRule lookupSelectRule(
        String name,
        String profileFieldKey,
        Map<String, String> optionMap
    ) {
        return new FieldRule(
            name,
            FieldsAnalysisRequest.FormElement.SELECT,
            FieldsAnalysisRequest.FormControl.SELECT,
            new LookupBinding(profileFieldKey, optionMap)
        );
    }

    static FieldRule constrainedLookupSelectRule(
        String name,
        String requiredDomName,
        String profileFieldKey,
        Map<String, String> optionMap
    ) {
        return new FieldRule(
            name,
            FieldsAnalysisRequest.FormElement.SELECT,
            FieldsAnalysisRequest.FormControl.SELECT,
            new LookupBinding(profileFieldKey, optionMap),
            false,
            requiredDomName
        );
    }

    static FieldRule constrainedLookupTextRule(
        String name,
        String requiredDomName,
        String profileFieldKey,
        Map<String, String> optionMap
    ) {
        return new FieldRule(
            name,
            FieldsAnalysisRequest.FormElement.INPUT,
            FieldsAnalysisRequest.FormControl.TEXT,
            new LookupBinding(profileFieldKey, optionMap),
            false,
            requiredDomName
        );
    }


    static FieldRule contextualButtonOptionRule(
        String name,
        String requiredItemGroupId,
        String profileFieldKey,
        Map<String, String> optionMap,
        Map<String, String> optionCodeMap
    ) {
        return new FieldRule(
            name,
            FieldsAnalysisRequest.FormElement.INPUT,
            FieldsAnalysisRequest.FormControl.BUTTON,
            new ButtonOptionBinding(profileFieldKey, optionMap, optionCodeMap),
            false,
            null,
            requiredItemGroupId
        );
    }

    static Map<String, String> attendanceOptions() {
        return Map.of("주간", "주간", "야간", "야간");
    }

    static Map<String, String> attendanceCodes() {
        return Map.of("주간", "D", "야간", "N");
    }

    static Map<String, String> domesticNationOptions() {
        return Map.ofEntries(
            Map.entry("서울", "대한민국"), Map.entry("부산", "대한민국"),
            Map.entry("대구", "대한민국"), Map.entry("인천", "대한민국"),
            Map.entry("광주", "대한민국"), Map.entry("대전", "대한민국"),
            Map.entry("울산", "대한민국"), Map.entry("세종", "대한민국"),
            Map.entry("경기", "대한민국"), Map.entry("강원", "대한민국"),
            Map.entry("충북", "대한민국"), Map.entry("충남", "대한민국"),
            Map.entry("전북", "대한민국"), Map.entry("전남", "대한민국"),
            Map.entry("경북", "대한민국"), Map.entry("경남", "대한민국"),
            Map.entry("제주", "대한민국")
        );
    }

    static Map<String, String> domesticNationCodes() {
        return Map.of("대한민국", "KR");
    }

    static Map<String, String> cityOptions() {
        return Map.of("서울", "서울", "세종", "세종");
    }

    static Map<String, String> cityCodes() {
        return Map.of("서울", "95", "세종", "01356");
    }

    static FieldRule contextualTextButtonOptionRule(
        String name,
        String requiredItemGroupId,
        String profileFieldKey,
        Map<String, String> optionMap,
        Map<String, String> optionCodeMap
    ) {
        return new FieldRule(
            name,
            FieldsAnalysisRequest.FormElement.INPUT,
            FieldsAnalysisRequest.FormControl.TEXT,
            new ButtonOptionBinding(profileFieldKey, optionMap, optionCodeMap),
            false,
            null,
            requiredItemGroupId
        );
    }

    static FieldRule contextualTextRule(
        String name,
        String requiredDomName,
        String requiredItemGroupId,
        String profileFieldKey
    ) {
        return new FieldRule(
            name,
            FieldsAnalysisRequest.FormElement.INPUT,
            FieldsAnalysisRequest.FormControl.TEXT,
            new DirectBinding(profileFieldKey),
            false,
            requiredDomName,
            requiredItemGroupId
        );
    }

    static FieldRule contextualDerivedTextRule(
        String name,
        String requiredDomName,
        String requiredItemGroupId,
        DerivedRecipe recipe,
        String profileFieldKey
    ) {
        return new FieldRule(
            name,
            FieldsAnalysisRequest.FormElement.INPUT,
            FieldsAnalysisRequest.FormControl.TEXT,
            new DerivedBinding(recipe, profileFieldKey),
            false,
            requiredDomName,
            requiredItemGroupId
        );
    }

    static FieldRule contextualCompletionStatusRule(
        String requiredItemGroupId,
        String profileFieldKey
    ) {
        return new FieldRule(
            "graGb",
            FieldsAnalysisRequest.FormElement.INPUT,
            FieldsAnalysisRequest.FormControl.BUTTON,
            new ButtonOptionBinding(
                profileFieldKey,
                Map.ofEntries(
                    Map.entry("졸업", "졸업"),
                    Map.entry("졸업예정", "졸업예정"),
                    Map.entry("재학", "재학중"),
                    Map.entry("재학중", "재학중"),
                    Map.entry("중퇴", "중퇴"),
                    Map.entry("수료", "수료")
                ),
                Map.of(
                    "졸업", "01",
                    "졸업예정", "02",
                    "재학중", "03",
                    "중퇴", "05",
                    "수료", "10"
                )
            ),
            false,
            null,
            requiredItemGroupId
        );
    }

    static FieldRule buttonOptionRule(
        String name,
        String profileFieldKey,
        Map<String, String> optionMap,
        Map<String, String> optionCodeMap
    ) {
        return new FieldRule(
            name,
            FieldsAnalysisRequest.FormElement.INPUT,
            FieldsAnalysisRequest.FormControl.BUTTON,
            new ButtonOptionBinding(profileFieldKey, optionMap, optionCodeMap)
        );
    }

    static FieldRule verifiedButtonOptionRule(
        String name,
        String profileFieldKey,
        Map<String, String> optionCodeMap,
        Map<String, String> aliases
    ) {
        Map<String, String> optionMap = new java.util.LinkedHashMap<>();
        optionCodeMap.keySet().forEach(option -> optionMap.put(option, option));
        optionMap.putAll(aliases);
        return buttonOptionRule(
            name,
            profileFieldKey,
            Map.copyOf(optionMap),
            optionCodeMap
        );
    }

    static FieldRule radioRule(String name, String profileFieldKey) {
        return new FieldRule(
            name,
            FieldsAnalysisRequest.FormElement.INPUT,
            FieldsAnalysisRequest.FormControl.RADIO,
            profileFieldKey
        );
    }

    static FieldRule derivedRadioRule(
        String name, DerivedRecipe recipe, String profileFieldKey,
        String trueLabel, String falseLabel
    ) {
        return new FieldRule(
            name,
            FieldsAnalysisRequest.FormElement.INPUT,
            FieldsAnalysisRequest.FormControl.RADIO,
            new DerivedBinding(recipe, profileFieldKey, trueLabel, falseLabel)
        );
    }
}
