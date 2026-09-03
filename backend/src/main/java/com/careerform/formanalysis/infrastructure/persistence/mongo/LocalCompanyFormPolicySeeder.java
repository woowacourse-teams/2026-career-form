package com.careerform.formanalysis.infrastructure.persistence.mongo;

import java.util.List;
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
import com.careerform.formanalysis.application.port.FieldMappingResolver.DerivedBinding;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DerivedRecipe;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;

@Component
@Profile("local")
final class LocalCompanyFormPolicySeeder implements ApplicationRunner {

    private static final String COMPANY_KEY = "sk";
    private static final long VERSION = 12;

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
        policies.save(policy());
        companies.save(new FormAnalysisCompanyDocument(
            COMPANY_KEY,
            COMPANY_KEY,
            "www.skcareers.com",
            List.of("/Application/Index/"),
            VERSION
        ));
        policies.save(hyundaiPolicy());
        companies.save(new FormAnalysisCompanyDocument(
            "hyundai",
            "hyundai",
            "talent.hyundai.com",
            List.of("/apply/applyWrite.hc"),
            1
        ));
    }

    private static FormAnalysisPolicyDocument hyundaiPolicy() {
        return new FormAnalysisPolicyDocument(
            "hyundai-policy-v1",
            "hyundai",
            1,
            new PreparationFingerprint(
                Set.of("section-1"),
                List.of(actionStructure("hyundai-static-marker"))
            ),
            new FieldsFingerprint(
                Set.of("section-root"),
                List.of(
                    textStructure("engNm"),
                    textStructure("engFamilyNm"),
                    textStructure("addrDtl"),
                    textStructure("emeTel")
                )
            ),
            List.of(addRule("hyundai-static-marker")),
            List.of(
                textRule("engNm", "personal.personal.englishGivenName"),
                textRule("engFamilyNm", "personal.personal.englishFamilyName"),
                textRule("addrDtl", "contact.contact.addressLine2"),
                textRule("emeTel", "contact.contact.phoneNumber"),
                textRule("schNm_1", "education.university.schoolName"),
                textRule("whiStDt_1", "education.university.startDate"),
                textRule("whiEndDt_1", "education.university.endDate"),
                textRule("milStartDt", "military.military.serviceStartDate"),
                textRule("milEndDt", "military.military.serviceEndDate")
            )
        );
    }

    private static FormAnalysisPolicyDocument policy() {
        return new FormAnalysisPolicyDocument(
            "sk-policy-v3",
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
                    new ActionStructure("prsVeteranBenefitYN", PreparationAnalysisRequest.FormElement.INPUT, PreparationAnalysisRequest.FormControl.RADIO),
                    new ActionStructure("prsDisabledYN", PreparationAnalysisRequest.FormElement.INPUT, PreparationAnalysisRequest.FormControl.RADIO),
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
                new ActionRule(
                    "prsMilitarySvcStatus", ActionKind.SELECT_OPTION,
                    "section-1", "military.military.militaryStatus"
                ),
                new ActionRule("prsVeteranBenefitYN", ActionKind.CHOOSE_RADIO, "section-1", "veteran.veteran.veteranStatus", "대상", List.of("prsVeteranBenefitNumber", "prsVeteranBenefitRelation")),
                new ActionRule("prsDisabledYN", ActionKind.CHOOSE_RADIO, "section-1", "disability.disability.disabilityStatus", "대상", List.of("prsDisabledTypeDtl")),
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
                    "section-3", "education.university.doubleMajorStatus", "있음", List.of("eduMajorDouble")),
                new ActionRule("eduMajorSubYN", ActionKind.CHOOSE_RADIO,
                    "section-3", "education.university.minorStatus", "있음", List.of("eduMajorSub"))
            ),
            List.of(
                derivedTextRule(
                    "prsApplicantName", DerivedRecipe.KOREAN_FULL_NAME
                ),
                textRule("prsEmail", "contact.contact.email"),
                textRule("prsPhone", "contact.contact.phoneNumber"),
                textRule("prsEngFirstName", "personal.personal.englishGivenName"),
                textRule("prsEngLastName", "personal.personal.englishFamilyName"),
                readonlyTextRule("prsZipCode", "contact.contact.postalCode"),
                readonlyTextRule("prsAddress", "contact.contact.addressLine1"),
                textRule("prsAddressDtl", "contact.contact.addressLine2"),
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
                selectRule(
                    "prsDisabledTypeDtl",
                    "disability.disability.disabilityType"
                ),
                selectRule(
                    "prsMilitarySvcStatus",
                    "military.military.militaryStatus"
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
                textRule("cerCertName", "certifications.certificate.name"),
                textRule("cerCertSource", "certifications.certificate.issuer"),
                textRule(
                    "cerCertDate",
                    "certifications.certificate.acquisitionDate"
                ),
                textRule(
                    "cerCertNumber",
                    "certifications.certificate.registrationNo"
                ),
                textRule("eduEducationName", "education.university.schoolName"),
                selectRule("eduLastestEducationType", "education.university.latestEducationType"),
                derivedSelectRule("eduEducationType", DerivedRecipe.EDUCATION_TYPE_AND_DEGREE),
                selectRule(
                    "eduEducationStatus",
                    "education.university.completionStatus"
                ),
                textRule("eduMajor", "education.university.majorName"),
                textRule("eduCredit", "education.university.gpaScore"),
                selectRule("eduCreditBase", "education.university.gpaScale"),
                radioRule("eduMajorTransferYN", "education.university.transferStatus"),
                radioRule("eduMajorDoubleYN", "education.university.doubleMajorStatus"),
                radioRule("eduMajorSubYN", "education.university.minorStatus"),
                textRule("eduMajorDouble", "education.university.additionalMajorName"),
                textRule("eduMajorSub", "education.university.minorName"),
                textRule("eduFromDate", "education.university.startDate"),
                textRule("eduToDate", "education.university.endDate"),
                selectRule(
                    "edugdEducationType",
                    "education.graduateSchool.degreeLevel"
                ),
                selectRule(
                    "edugdEducationStatus",
                    "education.graduateSchool.completionStatus"
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
                textRule("eduhgFromDate", "education.highSchool.startDate"),
                textRule("eduhgToDate", "education.highSchool.endDate"),
                selectRule("lngLanguageType", "languages.languageTest.language"),
                textRule("lngExamName", "languages.languageTest.testName"),
                textRule("lngExamScore", "languages.languageTest.grade"),
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

    private static ActionRule addRule(String name, String... expectedFieldNames) {
        return expectedFieldNames.length == 0
            ? new ActionRule(name, ActionKind.ADD, null)
            : new ActionRule(name, ActionKind.ADD, null, null, null, List.of(expectedFieldNames));
    }

    private static ActionStructure actionStructure(List<String> names) {
        return new ActionStructure(names, PreparationAnalysisRequest.FormElement.BUTTON, PreparationAnalysisRequest.FormControl.BUTTON);
    }

    private static ActionRule addRule(List<String> names, String... expectedFieldNames) {
        return expectedFieldNames.length == 0
            ? new ActionRule(names, ActionKind.ADD, null)
            : new ActionRule(names, ActionKind.ADD, null, null, null, List.of(expectedFieldNames));
    }

    private static ActionRule addRule(String name) {
        return new ActionRule(name, ActionKind.ADD, null);
    }

    private static ActionStructure actionStructure(String name) {
        return new ActionStructure(
            name,
            PreparationAnalysisRequest.FormElement.BUTTON,
            PreparationAnalysisRequest.FormControl.BUTTON
        );
    }

    private static ActionStructure radioStructure(String name) {
        return new ActionStructure(
            name,
            PreparationAnalysisRequest.FormElement.INPUT,
            PreparationAnalysisRequest.FormControl.RADIO
        );
    }

    private static FieldStructure textStructure(String name) {
        return new FieldStructure(
            name,
            FieldsAnalysisRequest.FormElement.INPUT,
            FieldsAnalysisRequest.FormControl.TEXT
        );
    }

    private static FieldStructure selectStructure(String name) {
        return new FieldStructure(
            name,
            FieldsAnalysisRequest.FormElement.SELECT,
            FieldsAnalysisRequest.FormControl.SELECT
        );
    }

    private static FieldRule textRule(String name, String profileFieldKey) {
        return new FieldRule(
            name,
            FieldsAnalysisRequest.FormElement.INPUT,
            FieldsAnalysisRequest.FormControl.TEXT,
            profileFieldKey
        );
    }

    private static FieldRule derivedTextRule(String name, DerivedRecipe recipe) {
        return new FieldRule(
            name,
            FieldsAnalysisRequest.FormElement.INPUT,
            FieldsAnalysisRequest.FormControl.TEXT,
            new DerivedBinding(recipe)
        );
    }

    private static FieldRule readonlyTextRule(
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

    private static FieldRule selectRule(String name, String profileFieldKey) {
        return new FieldRule(
            name,
            FieldsAnalysisRequest.FormElement.SELECT,
            FieldsAnalysisRequest.FormControl.SELECT,
            profileFieldKey
        );
    }

    private static FieldRule derivedSelectRule(String name, DerivedRecipe recipe) {
        return new FieldRule(
            name,
            FieldsAnalysisRequest.FormElement.SELECT,
            FieldsAnalysisRequest.FormControl.SELECT,
            new DerivedBinding(recipe)
        );
    }

    private static FieldRule radioRule(String name, String profileFieldKey) {
        return new FieldRule(
            name,
            FieldsAnalysisRequest.FormElement.INPUT,
            FieldsAnalysisRequest.FormControl.RADIO,
            profileFieldKey
        );
    }

    private static FieldRule derivedRadioRule(
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
