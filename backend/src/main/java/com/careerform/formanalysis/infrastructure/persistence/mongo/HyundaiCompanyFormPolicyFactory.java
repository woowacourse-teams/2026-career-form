package com.careerform.formanalysis.infrastructure.persistence.mongo;

import static com.careerform.formanalysis.infrastructure.persistence.mongo.LocalCompanyFormPolicySeeder.*;
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

final class HyundaiCompanyFormPolicyFactory {

    private static final long VERSION = 8;

    static FormAnalysisPolicyDocument create() {
        return new FormAnalysisPolicyDocument(
            "hyundai-policy-v4",
            "hyundai",
            VERSION,
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
                contextualButtonOptionRule(
                    "schClass", "educationuniversity",
                    "education.university.attendanceType", attendanceOptions(), attendanceCodes()
                ),
                contextualTextButtonOptionRule(
                    "locNation", "educationuniversity",
                    "education.university.schoolRegion", domesticNationOptions(), domesticNationCodes()
                ),
                contextualTextButtonOptionRule(
                    "locCity", "educationuniversity",
                    "education.university.schoolRegion", cityOptions(), cityCodes()
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
                contextualButtonOptionRule(
                    "schClass", "educationgraduateschool",
                    "education.graduateSchool.attendanceType", attendanceOptions(), attendanceCodes()
                ),
                contextualTextButtonOptionRule(
                    "locNation", "educationgraduateschool",
                    "education.graduateSchool.schoolRegion", domesticNationOptions(), domesticNationCodes()
                ),
                contextualTextButtonOptionRule(
                    "locCity", "educationgraduateschool",
                    "education.graduateSchool.schoolRegion", cityOptions(), cityCodes()
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
                buttonOptionRule(
                    "milCd",
                    "military.military.militaryStatus",
                    Map.of(
                        "군필", "필",
                        "만기전역", "필",
                        "미필", "미필",
                        "면제", "면제",
                        "비대상", "비대상(여성/해외국적)"
                    ),
                    Map.of(
                        "필", "1",
                        "미필", "2",
                        "면제", "5",
                        "비대상(여성/해외국적)", "7"
                    )
                ),
                buttonOptionRule(
                    "milExcptCd",
                    "military.military.exemptionReason",
                    Map.of(
                        "신체문제", "신체문제",
                        "생계곤란", "생계곤란",
                        "기타사유", "기타사유",
                        "전시근로역", "전시근로역"
                    ),
                    Map.of(
                        "신체문제", "01",
                        "생계곤란", "02",
                        "기타사유", "03",
                        "전시근로역", "04"
                    )
                ),
                buttonOptionRule(
                    "milRank",
                    "military.military.militaryRank",
                    Map.of("병장", "병장", "상병", "상병", "일병", "일병", "이병", "이병"),
                    Map.of("병장", "41", "상병", "42", "일병", "43", "이병", "44")
                ),
                buttonOptionRule(
                    "milDitinc",
                    "military.military.militaryBranch",
                    Map.of("육군", "육군", "해군", "해군", "공군", "공군", "해병대", "해병대"),
                    Map.of("육군", "1", "해군", "2", "공군", "3", "해병대", "4")
                ),
                constrainedDerivedTextRule(
                    "milStartDt", "milStartDt", DerivedRecipe.YEAR_MONTH,
                    "military.military.serviceStartDate"
                ),
                constrainedDerivedTextRule(
                    "milEndDt", "milEndDt", DerivedRecipe.YEAR_MONTH,
                    "military.military.serviceEndDate"
                ),
                buttonOptionRule(
                    "branchYn",
                    "veteran.veteran.veteranStatus",
                    Map.of("대상", "예", "비대상", "아니오"),
                    Map.of("예", "Y", "아니오", "N")
                ),
                buttonOptionRule(
                    "branchRel",
                    "veteran.veteran.veteranRelation",
                    Map.of("본인", "대상(본인)", "가족", "대상(가족)", "유족", "대상(유족)"),
                    Map.of("대상(본인)", "1", "대상(가족)", "2", "대상(유족)", "3")
                ),
                constrainedTextRule("branchNo", "branchNo", "veteran.veteran.veteranNumber"),
                buttonOptionRule(
                    "injuryYn",
                    "disability.disability.disabilityStatus",
                    Map.of("대상", "예", "비대상", "아니오"),
                    Map.of("예", "Y", "아니오", "N")
                ),
                buttonOptionRule(
                    "injuryGrade",
                    "disability.disability.disabilityGrade",
                    Map.ofEntries(
                        Map.entry("중증", "심한 장애인"),
                        Map.entry("심한 장애인", "심한 장애인"),
                        Map.entry("경증", "심하지 않은 장애인"),
                        Map.entry("심하지 않은 장애인", "심하지 않은 장애인")
                    ),
                    Map.of("심한 장애인", "10", "심하지 않은 장애인", "11")
                ),
                buttonOptionRule(
                    "injuryType",
                    "disability.disability.disabilityType",
                    Map.ofEntries(
                        Map.entry("지체장애", "지체장애"), Map.entry("뇌병변장애", "뇌병변장애"),
                        Map.entry("시각장애", "시각장애"), Map.entry("청각장애", "청각장애"),
                        Map.entry("언어장애", "언어장애"), Map.entry("지적장애", "지적장애"),
                        Map.entry("정신장애", "정신장애"), Map.entry("자폐성장애", "자폐성장애"),
                        Map.entry("신장장애", "신장장애"), Map.entry("심장장애", "심장장애"),
                        Map.entry("호흡기장애", "호흡기장애"), Map.entry("간장애", "간장애"),
                        Map.entry("안면장애", "안면장애"), Map.entry("장루요루장애", "장루요루장애"),
                        Map.entry("뇌전증장애", "뇌전증장애"), Map.entry("췌장장애", "췌장장애"),
                        Map.entry("상이등급(국가유공)", "상이등급(국가유공)")
                    ),
                    Map.ofEntries(
                        Map.entry("지체장애", "10"), Map.entry("뇌병변장애", "20"),
                        Map.entry("시각장애", "30"), Map.entry("청각장애", "40"),
                        Map.entry("언어장애", "50"), Map.entry("지적장애", "60"),
                        Map.entry("정신장애", "70"), Map.entry("자폐성장애", "80"),
                        Map.entry("신장장애", "90"), Map.entry("심장장애", "A0"),
                        Map.entry("호흡기장애", "B0"), Map.entry("간장애", "C0"),
                        Map.entry("안면장애", "D0"), Map.entry("장루요루장애", "E0"),
                        Map.entry("뇌전증장애", "F0"), Map.entry("췌장장애", "H0"),
                        Map.entry("상이등급(국가유공)", "G0")
                    )
                )
            )
        );
    }
}
