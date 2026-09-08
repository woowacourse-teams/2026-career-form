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

    private static final String COMPANY_KEY = "sk";
    private static final long VERSION = 23;
    private static final long HYUNDAI_VERSION = 5;

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
            HYUNDAI_VERSION
        ));
    }

    private static FormAnalysisPolicyDocument hyundaiPolicy() {
        return new FormAnalysisPolicyDocument(
            "hyundai-policy-v4",
            "hyundai",
            HYUNDAI_VERSION,
            new PreparationFingerprint(
                Set.of("section-root"),
                List.of(
                    new ActionStructure(
                        "hyundai:search:address",
                        PreparationAnalysisRequest.FormElement.INPUT,
                        PreparationAnalysisRequest.FormControl.BUTTON,
                        "postCd"
                    ),
                    actionStructure("hyundai:add:career"),
                    actionStructure("hyundai:add:project"),
                    actionStructure("hyundai:add:foreign"),
                    actionStructure("hyundai:add:foreignAbility"),
                    actionStructure("hyundai:add:licence"),
                    actionStructure("hyundai:add:publication")
                ),
                List.of(
                    actionStructure("hyundai:add:academic")
                )
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
            List.of(
                new ActionRule(
                    "hyundai:search:address",
                    ActionKind.SEARCH_ADDRESS,
                    null
                ),
                addRule("hyundai:add:career", "jobNm"),
                addRule("hyundai:add:project", "prjNm"),
                addRule("hyundai:add:foreign", "foreLang"),
                addRule("hyundai:add:foreignAbility", "foreLangAbility"),
                addRule("hyundai:add:licence", "nationLicNm"),
                addRule("hyundai:add:publication", "typeGb"),
                addRule("hyundai:add:academic", "schGb")
            ),
            List.of(
                textRule("engNm", "personal.personal.englishGivenName"),
                textRule("engFamilyNm", "personal.personal.englishFamilyName"),
                constrainedLookupTextRule(
                    "nationCd1Nm",
                    "nationCd1Nm",
                    "personal.personal.nationality",
                    Map.of("대한민국", "대한민국")
                ),
                readonlyTextRule("postCd", "contact.contact.postalCode"),
                readonlyTextRule("addr", "contact.contact.addressLine1"),
                textRule("addrDtl", "contact.contact.addressLine2"),
                textRule("emeTel", "contact.contact.emergencyPhoneNumber"),
                contextualTextRule(
                    "schNm", "schNm", "educationhighschool",
                    "education.highSchool.schoolName"
                ),
                contextualDerivedTextRule(
                    "whiStDt", "whiStDt", "educationhighschool",
                    DerivedRecipe.YEAR_MONTH, "education.highSchool.startDate"
                ),
                contextualDerivedTextRule(
                    "whiEndDt", "whiEndDt", "educationhighschool",
                    DerivedRecipe.YEAR_MONTH, "education.highSchool.endDate"
                ),
                contextualTextRule(
                    "schNm", "schNm", "educationuniversity",
                    "education.university.schoolName"
                ),
                contextualTextRule(
                    "majorNm", "majorNm", "educationuniversity",
                    "education.university.majorName"
                ),
                contextualTextRule(
                    "dblMajorNm", "dblMajorNm", "educationuniversity",
                    "education.university.additionalMajorName"
                ),
                contextualTextRule(
                    "minorNm", "minorNm", "educationuniversity",
                    "education.university.minorName"
                ),
                new FieldRule(
                    "rcdPerf",
                    FieldsAnalysisRequest.FormElement.INPUT,
                    FieldsAnalysisRequest.FormControl.BUTTON,
                    new ButtonOptionBinding(
                        "education.university.gpaScale",
                        Map.of("4.00", "4.0", "4.30", "4.3", "4.50", "4.5", "100.00", "100"),
                        Map.of("4.0", "4", "4.3", "4.3", "4.5", "4.5", "100", "100")
                    ),
                    false, null, "educationuniversity"
                ),
                contextualDerivedTextRule(
                    "whiStDt", "whiStDt", "educationuniversity",
                    DerivedRecipe.YEAR_MONTH, "education.university.startDate"
                ),
                contextualDerivedTextRule(
                    "whiEndDt", "whiEndDt", "educationuniversity",
                    DerivedRecipe.YEAR_MONTH,
                    "education.university.endDate"
                ),
                contextualTextRule(
                    "rcd", "rcd", "educationuniversity",
                    "education.university.gpaScore"
                ),
                contextualCompletionStatusRule(
                    "educationuniversity",
                    "education.university.completionStatus"
                ),
                contextualTextRule(
                    "schNm", "schNm", "educationgraduateschool",
                    "education.graduateSchool.schoolName"
                ),
                contextualTextRule(
                    "majorNm", "majorNm", "educationgraduateschool",
                    "education.graduateSchool.majorName"
                ),
                contextualDerivedTextRule(
                    "whiStDt", "whiStDt", "educationgraduateschool",
                    DerivedRecipe.YEAR_MONTH,
                    "education.graduateSchool.startDate"
                ),
                contextualDerivedTextRule(
                    "whiEndDt", "whiEndDt", "educationgraduateschool",
                    DerivedRecipe.YEAR_MONTH,
                    "education.graduateSchool.endDate"
                ),
                contextualTextRule(
                    "rcd", "rcd", "educationgraduateschool",
                    "education.graduateSchool.gpaScore"
                ),
                contextualCompletionStatusRule(
                    "educationgraduateschool",
                    "education.graduateSchool.completionStatus"
                ),
                textRule("collDepartNm", "education.graduateSchool.labName"),
                textRule("labProfNm", "education.graduateSchool.labProfessorName"),
                textRule("thesisTitle", "education.graduateSchool.thesisTitle"),
                textareaRule("thesisSum", "education.graduateSchool.thesisSummary"),
                textRule("prjNm", "projects.project.projectName"),
                derivedTextRule(
                    "prjStDt", DerivedRecipe.YEAR_MONTH,
                    "projects.project.startDate"
                ),
                derivedTextRule(
                    "prjEndDt", DerivedRecipe.YEAR_MONTH,
                    "projects.project.endDate"
                ),
                textRule("prjRoleNm", "projects.project.role"),
                textareaRule("prjRoleDtl", "projects.project.activityDetails"),
                buttonOptionRule(
                    "hireTypeCd",
                    "careers.career.employmentType",
                    Map.ofEntries(
                        Map.entry("정규", "정규"), Map.entry("계약", "계약"),
                        Map.entry("인턴", "인턴"), Map.entry("파견", "파견"),
                        Map.entry("프리랜서", "프리랜서"), Map.entry("아르바이트", "아르바이트"),
                        Map.entry("개인사업", "개인사업"), Map.entry("병역특례", "병역특례"),
                        Map.entry("기타", "기타")
                    ),
                    Map.ofEntries(
                        Map.entry("정규", "1"), Map.entry("계약", "2"),
                        Map.entry("인턴", "3"), Map.entry("파견", "4"),
                        Map.entry("프리랜서", "5"), Map.entry("아르바이트", "6"),
                        Map.entry("개인사업", "7"), Map.entry("병역특례", "8"),
                        Map.entry("기타", "9")
                    )
                ),
                derivedTextRule("tranStartDt", DerivedRecipe.YEAR_MONTH, "careers.career.startDate"),
                derivedTextRule("tranEndDt", DerivedRecipe.YEAR_MONTH, "careers.career.endDate"),
                textRule("workDpt", "careers.career.department"),
                buttonOptionRule(
                    "lastPosCd",
                    "careers.career.position",
                    Map.ofEntries(
                        Map.entry("사원", "사원"), Map.entry("주임", "주임"), Map.entry("대리", "대리"),
                        Map.entry("과장", "과장"), Map.entry("책임", "책임"), Map.entry("선임", "선임"),
                        Map.entry("차장", "차장"), Map.entry("수석", "수석"), Map.entry("부장", "부장"),
                        Map.entry("이사대우", "이사대우"), Map.entry("이사", "이사"), Map.entry("상무", "상무"),
                        Map.entry("전무", "전무"), Map.entry("부사장", "부사장"), Map.entry("사장", "사장")
                    ),
                    Map.ofEntries(
                        Map.entry("사원", "001"), Map.entry("주임", "002"), Map.entry("대리", "003"),
                        Map.entry("과장", "004"), Map.entry("책임", "014"), Map.entry("선임", "013"),
                        Map.entry("차장", "005"), Map.entry("수석", "015"), Map.entry("부장", "006"),
                        Map.entry("이사대우", "007"), Map.entry("이사", "008"), Map.entry("상무", "009"),
                        Map.entry("전무", "010"), Map.entry("부사장", "011"), Map.entry("사장", "012")
                    )
                ),
                textareaRule("ownWork", "careers.career.responsibilities"),
                textRule("retResEtcCont", "careers.career.terminationReason"),
                verifiedButtonOptionRule(
                    "foreLang",
                    "languages.languageTest.language",
                    Map.ofEntries(
                        Map.entry("한국어", "01"), Map.entry("영어", "02"),
                        Map.entry("중국어", "03"), Map.entry("아랍어", "04"),
                        Map.entry("스페인어", "07"), Map.entry("포르투갈어", "08"),
                        Map.entry("프랑스어", "09"), Map.entry("독일어", "10"),
                        Map.entry("러시아어", "11"), Map.entry("일본어", "12"),
                        Map.entry("베트남어", "16"), Map.entry("인도네시아어", "18"),
                        Map.entry("이탈리아어", "21")
                    ),
                    Map.of()
                ),
                verifiedButtonOptionRule(
                    "foreExamCd",
                    "languages.languageTest.testName",
                    Map.ofEntries(
                        Map.entry("WPT", "60"), Map.entry("IELTS", "64"),
                        Map.entry("TOEIC", "01"), Map.entry("TEPS", "03"),
                        Map.entry("New TEPS", "47"), Map.entry("TOEFL(IBT)", "10"),
                        Map.entry("SPA", "12"), Map.entry("TOEIC SPEAKING", "15"),
                        Map.entry("OPIC", "16"), Map.entry("TEPS SPEAKING", "42"),
                        Map.entry("TOEIC Writing", "57")
                    ),
                    Map.ofEntries(
                        Map.entry("OPIc", "OPIC"),
                        Map.entry("오픽", "OPIC"),
                        Map.entry("토익", "TOEIC"),
                        Map.entry("TOEIC Speaking", "TOEIC SPEAKING"),
                        Map.entry("토익스피킹", "TOEIC SPEAKING")
                    )
                ),
                verifiedButtonOptionRule(
                    "gradeForeLang",
                    "languages.languageTest.grade",
                    Map.ofEntries(
                        Map.entry("IM", "35"), Map.entry("Superior", "42"),
                        Map.entry("AH", "41"), Map.entry("AM", "40"),
                        Map.entry("AL", "33"), Map.entry("IH", "34"),
                        Map.entry("IM3", "147"), Map.entry("IM2", "146"),
                        Map.entry("IM1", "145"), Map.entry("IL", "36"),
                        Map.entry("NH", "37"), Map.entry("NM", "38"),
                        Map.entry("NL", "39")
                    ),
                    Map.of()
                ),
                constrainedTextRule(
                    "acqDtForeLang",
                    "acqDt",
                    "languages.languageTest.acquisitionDate"
                ),
                textRule("point", "languages.languageTest.grade"),
                textRule("acqNm", "languages.languageTest.registrationNo"),
                verifiedButtonOptionRule(
                    "foreLangAbility",
                    "languages.languageSkill.language",
                    Map.ofEntries(
                        Map.entry("한국어", "01"), Map.entry("영어", "02"),
                        Map.entry("중국어", "03"), Map.entry("아랍어", "04"),
                        Map.entry("스페인어", "07"), Map.entry("포르투갈어", "08"),
                        Map.entry("프랑스어", "09"), Map.entry("독일어", "10"),
                        Map.entry("러시아어", "11"), Map.entry("일본어", "12"),
                        Map.entry("이탈리아어", "21")
                    ),
                    Map.of()
                ),
                verifiedButtonOptionRule(
                    "speak",
                    "languages.languageSkill.conversationalLevel",
                    Map.of(
                        "Native (원어민 수준)", "01",
                        "Advanced (비즈니스 가능)", "02",
                        "Intermediate (일상생활 가능)", "03",
                        "Elementary (초급 수준)", "04"
                    ),
                    Map.ofEntries(
                        Map.entry("Native", "Native (원어민 수준)"),
                        Map.entry("원어민 수준", "Native (원어민 수준)"),
                        Map.entry("Advanced", "Advanced (비즈니스 가능)"),
                        Map.entry("비즈니스 가능", "Advanced (비즈니스 가능)"),
                        Map.entry("Intermediate", "Intermediate (일상생활 가능)"),
                        Map.entry("일상생활 가능", "Intermediate (일상생활 가능)"),
                        Map.entry("Elementary", "Elementary (초급 수준)"),
                        Map.entry("초급 수준", "Elementary (초급 수준)")
                    )
                ),
                constrainedTextRule(
                    "nationLicNm",
                    "nationLicNm",
                    "certifications.certificate.name"
                ),
                constrainedTextRule(
                    "acqDt",
                    "acqDt",
                    "certifications.certificate.acquisitionDate"
                ),
                textRule("regNo", "certifications.certificate.registrationNo"),
                textRule("issueOrg", "certifications.certificate.issuer"),
                textRule("hopePos", "compensation.compensation.desiredPosition"),
                textRule("hopeSal", "compensation.compensation.desiredSalary"),
                textRule("lastSal", "compensation.compensation.previousSalary"),
                textRule("title", "publications.publicationPatent.title"),
                textareaRule("cont", "publications.publicationPatent.details"),
                derivedTextRule(
                    "milStartDt", DerivedRecipe.YEAR_MONTH,
                    "military.military.serviceStartDate"
                ),
                derivedTextRule(
                    "milEndDt", DerivedRecipe.YEAR_MONTH,
                    "military.military.serviceEndDate"
                )
            )
        );
    }

    private static FormAnalysisPolicyDocument policy() {
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
                selectRule(
                    "prsDisabledType",
                    "disability.disability.disabilityGrade"
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
            : new ActionRule(names, ActionKind.ADD, null, null, null, List.of(expectedFieldNames), null);
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

    private static FieldRule constrainedTextRule(
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

    private static FieldRule constrainedTextareaRule(
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

    private static FieldRule constrainedDerivedTextRule(
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

    private static FieldRule textareaRule(String name, String profileFieldKey) {
        return new FieldRule(
            name,
            FieldsAnalysisRequest.FormElement.TEXTAREA,
            FieldsAnalysisRequest.FormControl.TEXTAREA,
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

    private static FieldRule derivedTextRule(
        String name, DerivedRecipe recipe, String profileFieldKey
    ) {
        return new FieldRule(
            name,
            FieldsAnalysisRequest.FormElement.INPUT,
            FieldsAnalysisRequest.FormControl.TEXT,
            new DerivedBinding(recipe, profileFieldKey)
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

    private static FieldRule lookupSelectRule(
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

    private static FieldRule constrainedLookupSelectRule(
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

    private static FieldRule constrainedLookupTextRule(
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

    private static FieldRule contextualTextRule(
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

    private static FieldRule contextualDerivedTextRule(
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

    private static FieldRule contextualCompletionStatusRule(
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

    private static FieldRule buttonOptionRule(
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

    private static FieldRule verifiedButtonOptionRule(
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
