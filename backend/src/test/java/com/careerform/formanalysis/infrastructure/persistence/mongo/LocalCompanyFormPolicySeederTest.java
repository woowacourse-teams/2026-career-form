package com.careerform.formanalysis.infrastructure.persistence.mongo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;

@DisplayName("로컬 회사 지원서 정책 seed")
class LocalCompanyFormPolicySeederTest {

    @Test
    @DisplayName("SK 검색 입력은 ID와 이름을 검증하고 ID 없는 시험 점수 선택을 지원한다")
    void seedsExactAutocompleteInputsAndExamGradeSelect() {
        var companies = mock(FormAnalysisCompanyMongoRepository.class);
        var policies = mock(FormAnalysisPolicyMongoRepository.class);
        var captured = ArgumentCaptor.forClass(FormAnalysisPolicyDocument.class);
        new LocalCompanyFormPolicySeeder(companies, policies).run(null);
        org.mockito.Mockito.verify(policies, org.mockito.Mockito.times(2)).save(captured.capture());
        var sk = captured.getAllValues().stream()
            .filter(policy -> policy.companyKey().equals("sk")).findFirst().orElseThrow();
        for (var entry : java.util.Map.of(
            "eduEducationName", "education.university.schoolName",
            "cerCertName", "certifications.certificate.name",
            "lngExamName", "languages.languageTest.testName",
            "lngExamScore", "languages.languageTest.grade",
            "lngExamScoreSel", "languages.languageTest.grade"
        ).entrySet()) {
            var matches = sk.fieldRules().stream()
                .filter(rule -> rule.structuralName().equals(entry.getKey())).toList();
            assertThat(matches).hasSize(1);
            var rule = matches.getFirst();
            if (entry.getKey().equals("lngExamScoreSel")) {
                assertThat(rule.requiredDomName()).isNull();
                assertThat(rule.element()).isEqualTo(
                    com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement.SELECT
                );
                assertThat(rule.control()).isEqualTo(
                    com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl.SELECT
                );
            } else {
                assertThat(rule.requiredDomName()).isEqualTo(entry.getKey());
            }
            assertThat(rule.profileFieldKey()).isEqualTo(entry.getValue());
        }
    }

    @Test
    @DisplayName("SK 대학 날짜는 일자를 포함하지 않는 년월 바인딩으로 저장한다")
    void seedsUniversityDatesAsYearMonth() {
        var companies = mock(FormAnalysisCompanyMongoRepository.class);
        var policies = mock(FormAnalysisPolicyMongoRepository.class);
        var captured = ArgumentCaptor.forClass(FormAnalysisPolicyDocument.class);
        new LocalCompanyFormPolicySeeder(companies, policies).run(null);
        org.mockito.Mockito.verify(policies, org.mockito.Mockito.times(2)).save(captured.capture());
        var sk = captured.getAllValues().stream()
            .filter(policy -> policy.companyKey().equals("sk")).findFirst().orElseThrow();
        for (var entry : java.util.Map.of(
            "eduFromDate", "education.university.startDate",
            "eduToDate", "education.university.endDate"
        ).entrySet()) {
            var rule = sk.fieldRules().stream()
                .filter(candidate -> candidate.structuralName().equals(entry.getKey()))
                .findFirst().orElseThrow();
            assertThat(rule.valueBinding()).isEqualTo(
                new com.careerform.formanalysis.application.port.FieldMappingResolver.DerivedBinding(
                    com.careerform.formanalysis.application.port.FieldMappingResolver.DerivedRecipe.YEAR_MONTH,
                    entry.getValue(), null, null
                )
            );
            assertThat(rule.requiredDomName()).isEqualTo(entry.getKey());
        }
    }

    @Test
    @DisplayName("정적 회사 정책 카탈로그의 SK와 Hyundai 등록을 모두 저장한다")
    void savesStaticCompanyCatalog() {
        FormAnalysisCompanyMongoRepository companies = mock(FormAnalysisCompanyMongoRepository.class);
        FormAnalysisPolicyMongoRepository policies = mock(FormAnalysisPolicyMongoRepository.class);
        new LocalCompanyFormPolicySeeder(companies, policies).run(null);

        org.mockito.Mockito.verify(companies, org.mockito.Mockito.times(2))
            .save(org.mockito.Mockito.any(FormAnalysisCompanyDocument.class));
        org.mockito.Mockito.verify(policies, org.mockito.Mockito.times(2))
            .save(org.mockito.Mockito.any(FormAnalysisPolicyDocument.class));
    }

    @Test
    @DisplayName("SK 공통 구조 v24와 직무별 option lookup을 결정적으로 저장한다")
    void overwritesTheDeterministicSkSeedOnEveryRun() throws Exception {
        FormAnalysisCompanyMongoRepository companies = mock(
            FormAnalysisCompanyMongoRepository.class
        );
        FormAnalysisPolicyMongoRepository policies = mock(
            FormAnalysisPolicyMongoRepository.class
        );
        LocalCompanyFormPolicySeeder seeder = new LocalCompanyFormPolicySeeder(
            companies,
            policies
        );
        ArgumentCaptor<FormAnalysisPolicyDocument> policy = ArgumentCaptor.forClass(
            FormAnalysisPolicyDocument.class
        );
        ArgumentCaptor<FormAnalysisCompanyDocument> company = ArgumentCaptor.forClass(
            FormAnalysisCompanyDocument.class
        );

        seeder.run(null);

        InOrder order = inOrder(policies, companies);
        order.verify(policies).save(policy.capture());
        order.verify(companies).save(company.capture());
        assertThat(policy.getValue().id()).isEqualTo("sk-policy-v8");
        assertThat(policy.getValue().companyKey()).isEqualTo("sk");
        assertThat(policy.getValue().version()).isEqualTo(24);
        assertThat(policy.getValue().preparationFingerprint().requiredSectionIds())
            .containsExactly("section-1");
        assertThat(policy.getValue().preparationFingerprint().requiredActions())
            .extracting("structuralName")
            .containsExactly("btnSearchAddress");
        assertThat(policy.getValue().preparationFingerprint().optionalActions())
            .extracting("structuralName")
            .contains(
                "prsMilitarySvcStatus",
                "btnAddCareer",
                "btnAddCert",
                "btnAddLangExam",
                "eduMajorDoubleYN",
                "eduMajorSubYN"
            );
        assertThat(policy.getValue().actionRules())
            .extracting("structuralName")
            .contains(
                "prsMilitarySvcStatus",
                "대학 학력 정보 추가",
                "btnAddCareer",
                "btnAddCert",
                "btnAddLangExam"
            );
        assertThat(policy.getValue().preparationFingerprint().optionalActions().stream()
            .filter(action -> action.structuralName().equals("btnAddCert"))
            .findFirst().orElseThrow().structuralNames())
            .containsExactly("btnAddCert", "자격/면허 추가");
        assertThat(policy.getValue().actionRules())
            .extracting("structuralName", "expectedFieldNames", "selectableProfileValues")
            .contains(
                org.assertj.core.groups.Tuple.tuple(
                    "prsVeteranBenefitYN",
                    java.util.List.of("prsVeteranBenefitNumber", "prsVeteranBenefitRelation"),
                    null
                ),
                org.assertj.core.groups.Tuple.tuple(
                    "prsDisabledYN",
                    java.util.List.of("prsDisabledType", "prsDisabledTypeDtl"),
                    java.util.List.of("장애", "예", "대상", "해당", "있음")
                )
            );
        assertThat(policy.getValue().fieldsFingerprint().requiredSectionIds())
            .containsExactly("section-1");
        assertThat(policy.getValue().fieldsFingerprint().requiredFields())
            .extracting("structuralName")
            .containsExactlyInAnyOrder("prsApplicantName", "prsEmail", "prsPhone");
        assertThat(policy.getValue().fieldRules())
            .extracting("structuralName", "profileFieldKey")
            .contains(
                org.assertj.core.groups.Tuple.tuple(
                    "prsEmail",
                    "contact.contact.email"
                ),
                org.assertj.core.groups.Tuple.tuple(
                    "prsEmailSub",
                    "contact.contact.secondaryEmail"
                ),
                org.assertj.core.groups.Tuple.tuple(
                    "prsResidenceNation",
                    "contact.contact.residenceCountry"
                ),
                org.assertj.core.groups.Tuple.tuple(
                    "prsPhoneEmergency",
                    "contact.contact.emergencyPhoneNumber"
                ),
                org.assertj.core.groups.Tuple.tuple(
                    "prsDisabledNumber",
                    "disability.disability.disabilityRegistrationNumber"
                ),
                org.assertj.core.groups.Tuple.tuple(
                    "prsDisabledType",
                    "disability.disability.disabilityGrade"
                ),
                org.assertj.core.groups.Tuple.tuple(
                    "prsDisabledTypeDtl",
                    "disability.disability.disabilityType"
                ),
                org.assertj.core.groups.Tuple.tuple(
                    "prsPhone",
                    "contact.contact.phoneNumber"
                ),
                org.assertj.core.groups.Tuple.tuple(
                    "prsMilitarySvcStatus",
                    "military.military.militaryStatus"
                ),
                org.assertj.core.groups.Tuple.tuple(
                    "cerCertName",
                    "certifications.certificate.name"
                ),
                org.assertj.core.groups.Tuple.tuple(
                    "cerCertSource",
                    "certifications.certificate.issuer"
                ),
                org.assertj.core.groups.Tuple.tuple(
                    "eduEducationName",
                    "education.university.schoolName"
                ),
                org.assertj.core.groups.Tuple.tuple(
                    "eduEducationStatus",
                    "education.university.completionStatus"
                ),
                org.assertj.core.groups.Tuple.tuple(
                    "eduhgEducationStatus",
                    "education.highSchool.completionStatus"
                ),
                org.assertj.core.groups.Tuple.tuple(
                    "eduhgEducationRegion",
                    "education.highSchool.schoolRegion"
                ),
                org.assertj.core.groups.Tuple.tuple(
                    "eduEducationRegion",
                    "education.university.schoolRegion"
                ),
                org.assertj.core.groups.Tuple.tuple(
                    "eduCreditTotal",
                    "education.university.totalCredits"
                )
            );
        assertThat(policy.getValue().fieldRules().stream()
            .filter(rule -> rule.structuralName().equals("eduEducationType"))
            .findFirst().orElseThrow().valueBinding())
            .isEqualTo(new com.careerform.formanalysis.application.port.FieldMappingResolver.LookupBinding(
                "education.university.degreeLevel",
                java.util.Map.of(
                    "전문학사", "전문대학(전문학사)",
                    "학사", "대학(학사)"
                )
            ));
        var nationalityRule = policy.getValue().fieldRules().stream()
            .filter(rule -> rule.structuralName().equals("prsNationality"))
            .findFirst().orElseThrow();
        assertThat(nationalityRule.requiredDomName()).isEqualTo("prsNationality");
        assertThat(nationalityRule.valueBinding())
            .isEqualTo(new com.careerform.formanalysis.application.port.FieldMappingResolver.LookupBinding(
                "personal.personal.nationality",
                java.util.Map.of("대한민국", "대한민국")
            ));
        assertThat(company.getValue()).isEqualTo(new FormAnalysisCompanyDocument(
            "sk",
            "sk",
            "www.skcareers.com",
            java.util.List.of("/Application/Index/"),
            24
        ));
    }

    @Test
    @DisplayName("현대 v3 정책은 충돌하는 취득일과 자격증명을 정확한 DOM 쌍으로 저장한다")
    void seedsConstrainedHyundaiFields() {
        FormAnalysisCompanyMongoRepository companies = mock(FormAnalysisCompanyMongoRepository.class);
        FormAnalysisPolicyMongoRepository policies = mock(FormAnalysisPolicyMongoRepository.class);
        ArgumentCaptor<FormAnalysisPolicyDocument> savedPolicies = ArgumentCaptor.forClass(
            FormAnalysisPolicyDocument.class
        );
        ArgumentCaptor<FormAnalysisCompanyDocument> savedCompanies = ArgumentCaptor.forClass(
            FormAnalysisCompanyDocument.class
        );

        new LocalCompanyFormPolicySeeder(companies, policies).run(null);

        org.mockito.Mockito.verify(policies, org.mockito.Mockito.times(2))
            .save(savedPolicies.capture());
        org.mockito.Mockito.verify(companies, org.mockito.Mockito.times(2))
            .save(savedCompanies.capture());
        FormAnalysisPolicyDocument hyundaiPolicy = savedPolicies.getAllValues().stream()
            .filter(policy -> policy.companyKey().equals("hyundai"))
            .findFirst()
            .orElseThrow();
        FormAnalysisCompanyDocument hyundaiCompany = savedCompanies.getAllValues().stream()
            .filter(company -> company.companyKey().equals("hyundai"))
            .findFirst()
            .orElseThrow();

        assertThat(hyundaiPolicy.id()).isEqualTo("hyundai-policy-v4");
        assertThat(hyundaiPolicy.version()).isEqualTo(7);
        assertThat(hyundaiCompany.activePolicyVersion()).isEqualTo(7);
        assertThat(hyundaiPolicy.fieldRules().stream()
            .filter(rule -> java.util.Set.of(
                "acqDtForeLang", "acqDt", "nationLicNm"
            ).contains(rule.structuralName())))
            .extracting("structuralName", "requiredDomName", "profileFieldKey")
            .containsExactlyInAnyOrder(
                org.assertj.core.groups.Tuple.tuple(
                    "acqDtForeLang",
                    "acqDt",
                    "languages.languageTest.acquisitionDate"
                ),
                org.assertj.core.groups.Tuple.tuple(
                    "acqDt",
                    "acqDt",
                    "certifications.certificate.acquisitionDate"
                ),
                org.assertj.core.groups.Tuple.tuple(
                    "nationLicNm",
                    "nationLicNm",
                    "certifications.certificate.name"
                )
            );
    }

    @Test
    @DisplayName("현대 v4 정책은 주소 검색과 국적1 및 학력 준비를 exact 구조로 제한한다")
    void seedsHyundaiAddressNationalityAndEducationPreparation() {
        FormAnalysisCompanyMongoRepository companies = mock(FormAnalysisCompanyMongoRepository.class);
        FormAnalysisPolicyMongoRepository policies = mock(FormAnalysisPolicyMongoRepository.class);
        ArgumentCaptor<FormAnalysisPolicyDocument> savedPolicies = ArgumentCaptor.forClass(
            FormAnalysisPolicyDocument.class
        );

        new LocalCompanyFormPolicySeeder(companies, policies).run(null);

        org.mockito.Mockito.verify(policies, org.mockito.Mockito.times(2))
            .save(savedPolicies.capture());
        FormAnalysisPolicyDocument hyundaiPolicy = savedPolicies.getAllValues().stream()
            .filter(policy -> policy.companyKey().equals("hyundai"))
            .findFirst()
            .orElseThrow();

        assertThat(hyundaiPolicy.preparationFingerprint().requiredActions().stream()
            .filter(action -> action.structuralName().equals("hyundai:search:address"))
            .findFirst().orElseThrow())
            .extracting("element", "control", "requiredDomName")
            .containsExactly(
                com.careerform.formanalysis.dto.PreparationAnalysisRequest.FormElement.INPUT,
                com.careerform.formanalysis.dto.PreparationAnalysisRequest.FormControl.BUTTON,
                "postCd"
            );
        assertThat(hyundaiPolicy.preparationFingerprint().optionalActions())
            .extracting("structuralName", "element", "control")
            .contains(
                org.assertj.core.groups.Tuple.tuple(
                    "hyundai:add:academic",
                    com.careerform.formanalysis.dto.PreparationAnalysisRequest.FormElement.BUTTON,
                    com.careerform.formanalysis.dto.PreparationAnalysisRequest.FormControl.BUTTON
                )
            );
        assertThat(hyundaiPolicy.actionRules())
            .extracting("structuralName", "kind", "expectedFieldNames")
            .contains(
                org.assertj.core.groups.Tuple.tuple(
                    "hyundai:search:address",
                    com.careerform.formanalysis.application.policy.CompanyFormPolicy.ActionKind.SEARCH_ADDRESS,
                    null
                ),
                org.assertj.core.groups.Tuple.tuple(
                    "hyundai:add:academic",
                    com.careerform.formanalysis.application.policy.CompanyFormPolicy.ActionKind.ADD,
                    java.util.List.of("schGb")
                )
            );

        var nationality = hyundaiPolicy.fieldRules().stream()
            .filter(rule -> rule.structuralName().equals("nationCd1Nm"))
            .findFirst().orElseThrow();
        assertThat(nationality.requiredDomName()).isEqualTo("nationCd1Nm");
        assertThat(nationality.valueBinding()).isEqualTo(
            new com.careerform.formanalysis.application.port.FieldMappingResolver.LookupBinding(
                "personal.personal.nationality",
                java.util.Map.of("대한민국", "대한민국")
            )
        );

        assertThat(hyundaiPolicy.fieldRules().stream()
            .filter(rule -> rule.structuralName().equals("postCd")
                || rule.structuralName().equals("addr"))
            .toList())
            .extracting("structuralName", "profileFieldKey", "allowReadonlyWrite")
            .containsExactlyInAnyOrder(
                org.assertj.core.groups.Tuple.tuple(
                    "postCd", "contact.contact.postalCode", true
                ),
                org.assertj.core.groups.Tuple.tuple(
                    "addr", "contact.contact.addressLine1", true
                )
            );
    }

    @Test
    @DisplayName("현대 v4 정책은 공통 학력 DOM을 검증된 학력 종류별 item group에만 연결한다")
    void seedsContextualHyundaiEducationFields() {
        FormAnalysisCompanyMongoRepository companies = mock(FormAnalysisCompanyMongoRepository.class);
        FormAnalysisPolicyMongoRepository policies = mock(FormAnalysisPolicyMongoRepository.class);
        ArgumentCaptor<FormAnalysisPolicyDocument> savedPolicies = ArgumentCaptor.forClass(
            FormAnalysisPolicyDocument.class
        );
        new LocalCompanyFormPolicySeeder(companies, policies).run(null);
        org.mockito.Mockito.verify(policies, org.mockito.Mockito.times(2))
            .save(savedPolicies.capture());
        FormAnalysisPolicyDocument hyundaiPolicy = savedPolicies.getAllValues().stream()
            .filter(policy -> policy.companyKey().equals("hyundai"))
            .findFirst()
            .orElseThrow();

        assertThat(hyundaiPolicy.fieldRules().stream()
            .filter(rule -> rule.requiredItemGroupId() != null)
            .toList())
            .extracting("structuralName", "requiredDomName", "requiredItemGroupId", "profileFieldKey")
            .contains(
                org.assertj.core.groups.Tuple.tuple(
                    "schNm", "schNm", "educationhighschool",
                    "education.highSchool.schoolName"
                ),
                org.assertj.core.groups.Tuple.tuple(
                    "whiStDt", "whiStDt", "educationhighschool", null
                ),
                org.assertj.core.groups.Tuple.tuple(
                    "whiEndDt", "whiEndDt", "educationhighschool", null
                ),
                org.assertj.core.groups.Tuple.tuple(
                    "schNm", "schNm", "educationuniversity",
                    "education.university.schoolName"
                ),
                org.assertj.core.groups.Tuple.tuple(
                    "majorNm", "majorNm", "educationuniversity",
                    "education.university.majorName"
                ),
                org.assertj.core.groups.Tuple.tuple(
                    "rcd", "rcd", "educationuniversity",
                    "education.university.gpaScore"
                ),
                org.assertj.core.groups.Tuple.tuple(
                    "schNm", "schNm", "educationgraduateschool",
                    "education.graduateSchool.schoolName"
                ),
                org.assertj.core.groups.Tuple.tuple(
                    "majorNm", "majorNm", "educationgraduateschool",
                    "education.graduateSchool.majorName"
                ),
                org.assertj.core.groups.Tuple.tuple(
                    "rcd", "rcd", "educationgraduateschool",
                    "education.graduateSchool.gpaScore"
                )
            );
        assertThat(hyundaiPolicy.fieldRules())
            .noneMatch(rule -> rule.structuralName().equals("rcdM"));

        assertThat(hyundaiPolicy.fieldRules().stream()
            .filter(rule -> rule.structuralName().equals("graGb"))
            .toList())
            .extracting("requiredItemGroupId", "valueBinding")
            .containsExactlyInAnyOrder(
                org.assertj.core.groups.Tuple.tuple(
                    "educationuniversity",
                    completionStatusBinding("education.university.completionStatus")
                ),
                org.assertj.core.groups.Tuple.tuple(
                    "educationgraduateschool",
                    completionStatusBinding("education.graduateSchool.completionStatus")
                )
            );
    }

    @Test
    @DisplayName("현대 v3 정책은 검증된 외국어 버튼의 표시값과 코드를 저장한다")
    void seedsVerifiedHyundaiLanguageButtons() {
        FormAnalysisCompanyMongoRepository companies = mock(FormAnalysisCompanyMongoRepository.class);
        FormAnalysisPolicyMongoRepository policies = mock(FormAnalysisPolicyMongoRepository.class);
        ArgumentCaptor<FormAnalysisPolicyDocument> savedPolicies = ArgumentCaptor.forClass(
            FormAnalysisPolicyDocument.class
        );
        new LocalCompanyFormPolicySeeder(companies, policies).run(null);
        org.mockito.Mockito.verify(policies, org.mockito.Mockito.times(2))
            .save(savedPolicies.capture());
        FormAnalysisPolicyDocument hyundaiPolicy = savedPolicies.getAllValues().stream()
            .filter(policy -> policy.companyKey().equals("hyundai"))
            .findFirst()
            .orElseThrow();

        assertThat(buttonBinding(hyundaiPolicy, "foreLang")).isEqualTo(
            new com.careerform.formanalysis.application.port.FieldMappingResolver.ButtonOptionBinding(
                "languages.languageTest.language",
                languageOptionMap(false),
                languageCodeMap(false)
            )
        );
        assertThat(buttonBinding(hyundaiPolicy, "foreExamCd")).isEqualTo(
            new com.careerform.formanalysis.application.port.FieldMappingResolver.ButtonOptionBinding(
                "languages.languageTest.testName",
                java.util.Map.ofEntries(
                    java.util.Map.entry("WPT", "WPT"),
                    java.util.Map.entry("IELTS", "IELTS"),
                    java.util.Map.entry("TOEIC", "TOEIC"),
                    java.util.Map.entry("TEPS", "TEPS"),
                    java.util.Map.entry("New TEPS", "New TEPS"),
                    java.util.Map.entry("TOEFL(IBT)", "TOEFL(IBT)"),
                    java.util.Map.entry("SPA", "SPA"),
                    java.util.Map.entry("TOEIC SPEAKING", "TOEIC SPEAKING"),
                    java.util.Map.entry("TOEIC Speaking", "TOEIC SPEAKING"),
                    java.util.Map.entry("토익스피킹", "TOEIC SPEAKING"),
                    java.util.Map.entry("OPIC", "OPIC"),
                    java.util.Map.entry("OPIc", "OPIC"),
                    java.util.Map.entry("오픽", "OPIC"),
                    java.util.Map.entry("토익", "TOEIC"),
                    java.util.Map.entry("TEPS SPEAKING", "TEPS SPEAKING"),
                    java.util.Map.entry("TOEIC Writing", "TOEIC Writing")
                ),
                java.util.Map.ofEntries(
                    java.util.Map.entry("WPT", "60"),
                    java.util.Map.entry("IELTS", "64"),
                    java.util.Map.entry("TOEIC", "01"),
                    java.util.Map.entry("TEPS", "03"),
                    java.util.Map.entry("New TEPS", "47"),
                    java.util.Map.entry("TOEFL(IBT)", "10"),
                    java.util.Map.entry("SPA", "12"),
                    java.util.Map.entry("TOEIC SPEAKING", "15"),
                    java.util.Map.entry("OPIC", "16"),
                    java.util.Map.entry("TEPS SPEAKING", "42"),
                    java.util.Map.entry("TOEIC Writing", "57")
                )
            )
        );
        assertThat(buttonBinding(hyundaiPolicy, "gradeForeLang")).isEqualTo(
            new com.careerform.formanalysis.application.port.FieldMappingResolver.ButtonOptionBinding(
                "languages.languageTest.grade",
                java.util.Map.ofEntries(
                    java.util.Map.entry("IM", "IM"),
                    java.util.Map.entry("Superior", "Superior"),
                    java.util.Map.entry("AH", "AH"),
                    java.util.Map.entry("AM", "AM"),
                    java.util.Map.entry("AL", "AL"),
                    java.util.Map.entry("IH", "IH"),
                    java.util.Map.entry("IM3", "IM3"),
                    java.util.Map.entry("IM2", "IM2"),
                    java.util.Map.entry("IM1", "IM1"),
                    java.util.Map.entry("IL", "IL"),
                    java.util.Map.entry("NH", "NH"),
                    java.util.Map.entry("NM", "NM"),
                    java.util.Map.entry("NL", "NL")
                ),
                java.util.Map.ofEntries(
                    java.util.Map.entry("IM", "35"),
                    java.util.Map.entry("Superior", "42"),
                    java.util.Map.entry("AH", "41"),
                    java.util.Map.entry("AM", "40"),
                    java.util.Map.entry("AL", "33"),
                    java.util.Map.entry("IH", "34"),
                    java.util.Map.entry("IM3", "147"),
                    java.util.Map.entry("IM2", "146"),
                    java.util.Map.entry("IM1", "145"),
                    java.util.Map.entry("IL", "36"),
                    java.util.Map.entry("NH", "37"),
                    java.util.Map.entry("NM", "38"),
                    java.util.Map.entry("NL", "39")
                )
            )
        );
        assertThat(buttonBinding(hyundaiPolicy, "foreLangAbility")).isEqualTo(
            new com.careerform.formanalysis.application.port.FieldMappingResolver.ButtonOptionBinding(
                "languages.languageSkill.language",
                languageOptionMap(true),
                languageCodeMap(true)
            )
        );
        assertThat(buttonBinding(hyundaiPolicy, "speak")).isEqualTo(
            new com.careerform.formanalysis.application.port.FieldMappingResolver.ButtonOptionBinding(
                "languages.languageSkill.conversationalLevel",
                java.util.Map.ofEntries(
                    java.util.Map.entry("Native (원어민 수준)", "Native (원어민 수준)"),
                    java.util.Map.entry("Native", "Native (원어민 수준)"),
                    java.util.Map.entry("원어민 수준", "Native (원어민 수준)"),
                    java.util.Map.entry("Advanced (비즈니스 가능)", "Advanced (비즈니스 가능)"),
                    java.util.Map.entry("Advanced", "Advanced (비즈니스 가능)"),
                    java.util.Map.entry("비즈니스 가능", "Advanced (비즈니스 가능)"),
                    java.util.Map.entry("Intermediate (일상생활 가능)", "Intermediate (일상생활 가능)"),
                    java.util.Map.entry("Intermediate", "Intermediate (일상생활 가능)"),
                    java.util.Map.entry("일상생활 가능", "Intermediate (일상생활 가능)"),
                    java.util.Map.entry("Elementary (초급 수준)", "Elementary (초급 수준)"),
                    java.util.Map.entry("Elementary", "Elementary (초급 수준)"),
                    java.util.Map.entry("초급 수준", "Elementary (초급 수준)")
                ),
                java.util.Map.of(
                    "Native (원어민 수준)", "01",
                    "Advanced (비즈니스 가능)", "02",
                    "Intermediate (일상생활 가능)", "03",
                    "Elementary (초급 수준)", "04"
                )
            )
        );
    }


    @Test
    @DisplayName("CF-86 SK 정책은 ID 없는 정확한 학력 select 이름과 주야간 코드 계약을 저장한다")
    void seedsSkEducationRegionAndAttendanceWithNameOnlySelects() {
        var companies = mock(FormAnalysisCompanyMongoRepository.class);
        var policies = mock(FormAnalysisPolicyMongoRepository.class);
        var captured = ArgumentCaptor.forClass(FormAnalysisPolicyDocument.class);
        new LocalCompanyFormPolicySeeder(companies, policies).run(null);
        org.mockito.Mockito.verify(policies, org.mockito.Mockito.times(2)).save(captured.capture());
        var sk = captured.getAllValues().stream()
            .filter(policy -> policy.companyKey().equals("sk")).findFirst().orElseThrow();

        assertThat(sk.fieldRules().stream()
            .filter(rule -> java.util.Set.of(
                "eduEducationRegion", "eduhgEducationRegion", "edugdEducationRegion",
                "eduDaytimeYN", "edugdDaytimeYN"
            ).contains(rule.structuralName()))
            .toList())
            .extracting("structuralName", "requiredDomName", "element", "control", "profileFieldKey")
            .containsExactlyInAnyOrder(
                org.assertj.core.groups.Tuple.tuple("eduEducationRegion", null,
                    com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement.SELECT,
                    com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl.SELECT,
                    "education.university.schoolRegion"),
                org.assertj.core.groups.Tuple.tuple("eduhgEducationRegion", null,
                    com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement.SELECT,
                    com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl.SELECT,
                    "education.highSchool.schoolRegion"),
                org.assertj.core.groups.Tuple.tuple("edugdEducationRegion", null,
                    com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement.SELECT,
                    com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl.SELECT,
                    "education.graduateSchool.schoolRegion"),
                org.assertj.core.groups.Tuple.tuple("eduDaytimeYN", null,
                    com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement.SELECT,
                    com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl.SELECT,
                    null),
                org.assertj.core.groups.Tuple.tuple("edugdDaytimeYN", null,
                    com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement.SELECT,
                    com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl.SELECT,
                    null)
            );
        assertThat(sk.fieldRules().stream().filter(rule -> java.util.Set.of(
            "eduDaytimeYN", "edugdDaytimeYN").contains(rule.structuralName())).toList())
            .extracting("valueBinding")
            .containsExactlyInAnyOrder(
                new com.careerform.formanalysis.application.port.FieldMappingResolver.LookupBinding(
                    "education.university.attendanceType", java.util.Map.of("주간", "주간", "야간", "야간")
                ),
                new com.careerform.formanalysis.application.port.FieldMappingResolver.LookupBinding(
                    "education.graduateSchool.attendanceType", java.util.Map.of("주간", "주간", "야간", "야간")
                )
            );

        var policy = com.careerform.formanalysis.application.policy.CompanyFormPolicy.create(
            sk.companyKey(), sk.version(), sk.preparationFingerprint(), sk.fieldsFingerprint(),
            sk.actionRules(), sk.fieldRules(), ignored -> true
        );
        var request = new com.careerform.formanalysis.dto.FieldsAnalysisRequest(
            2, "sk-name-only-education-selects",
            new com.careerform.formanalysis.dto.FieldsAnalysisRequest.Site(
                "www.skcareers.com", "/Application/Index/"
            ),
            java.util.List.of(new com.careerform.formanalysis.dto.FieldsAnalysisRequest.Section(
                "section-1", null, null,
                java.util.List.of(
                    new com.careerform.formanalysis.dto.FieldsAnalysisRequest.FieldCandidate(
                        "university-region", com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement.SELECT,
                        com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl.SELECT,
                        com.careerform.formanalysis.dto.FieldsAnalysisRequest.Visibility.VISIBLE,
                        null, null, "eduEducationRegion", null, null, null, null, null
                    ),
                    new com.careerform.formanalysis.dto.FieldsAnalysisRequest.FieldCandidate(
                        "graduate-attendance", com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement.SELECT,
                        com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl.SELECT,
                        com.careerform.formanalysis.dto.FieldsAnalysisRequest.Visibility.VISIBLE,
                        null, null, "edugdDaytimeYN", null, null, null, null, null
                    )
                ), null
            ))
        );
        assertThat(new com.careerform.formanalysis.application.policy.StoredPolicyFieldMappingResolver(policy)
            .resolve(request).results())
            .containsExactly(
                new com.careerform.formanalysis.application.port.FieldMappingResolver.Match(
                    "university-region",
                    new com.careerform.formanalysis.application.port.FieldMappingResolver.DirectBinding(
                        "education.university.schoolRegion"
                    )
                ),
                new com.careerform.formanalysis.application.port.FieldMappingResolver.Match(
                    "graduate-attendance",
                    new com.careerform.formanalysis.application.port.FieldMappingResolver.LookupBinding(
                        "education.graduateSchool.attendanceType",
                        java.util.Map.of("주간", "주간", "야간", "야간")
                    )
                )
            );
    }

    @Test
    @DisplayName("CF-86 현대 학력 버튼과 소재지는 대학 및 대학원 group에서만 exact 코드로 연결한다")
    void seedsContextualHyundaiAttendanceAndEducationLocations() {
        var companies = mock(FormAnalysisCompanyMongoRepository.class);
        var policies = mock(FormAnalysisPolicyMongoRepository.class);
        var captured = ArgumentCaptor.forClass(FormAnalysisPolicyDocument.class);
        new LocalCompanyFormPolicySeeder(companies, policies).run(null);
        org.mockito.Mockito.verify(policies, org.mockito.Mockito.times(2)).save(captured.capture());
        var hyundai = captured.getAllValues().stream()
            .filter(policy -> policy.companyKey().equals("hyundai")).findFirst().orElseThrow();

        assertThat(hyundai.fieldRules().stream().filter(rule -> java.util.Set.of(
            "schClass", "locNation", "locCity").contains(rule.structuralName())).toList())
            .extracting("structuralName", "requiredDomName", "requiredItemGroupId", "element", "control")
            .containsExactlyInAnyOrder(
                org.assertj.core.groups.Tuple.tuple("schClass", null, "educationuniversity",
                    com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement.INPUT,
                    com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl.BUTTON),
                org.assertj.core.groups.Tuple.tuple("schClass", null, "educationgraduateschool",
                    com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement.INPUT,
                    com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl.BUTTON),
                org.assertj.core.groups.Tuple.tuple("locNation", null, "educationuniversity",
                    com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement.INPUT,
                    com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl.TEXT),
                org.assertj.core.groups.Tuple.tuple("locNation", null, "educationgraduateschool",
                    com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement.INPUT,
                    com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl.TEXT),
                org.assertj.core.groups.Tuple.tuple("locCity", null, "educationuniversity",
                    com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement.INPUT,
                    com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl.TEXT),
                org.assertj.core.groups.Tuple.tuple("locCity", null, "educationgraduateschool",
                    com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement.INPUT,
                    com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl.TEXT)
            );
        assertThat(buttonBinding(hyundai, "schClass")).isEqualTo(
            new com.careerform.formanalysis.application.port.FieldMappingResolver.ButtonOptionBinding(
                "education.university.attendanceType",
                java.util.Map.of("주간", "주간", "야간", "야간"),
                java.util.Map.of("주간", "D", "야간", "N")
            )
        );

        var policy = com.careerform.formanalysis.application.policy.CompanyFormPolicy.create(
            hyundai.companyKey(), hyundai.version(), hyundai.preparationFingerprint(),
            hyundai.fieldsFingerprint(), hyundai.actionRules(), hyundai.fieldRules(), ignored -> true
        );
        var rawLocations = java.util.List.of(
            new com.careerform.formanalysis.dto.FieldsAnalysisRequest.FieldCandidate(
                "university-nation", com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement.INPUT,
                com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl.TEXT,
                com.careerform.formanalysis.dto.FieldsAnalysisRequest.Visibility.VISIBLE,
                null, "locNation_1", null, null, null, null, null, null
            ),
            new com.careerform.formanalysis.dto.FieldsAnalysisRequest.FieldCandidate(
                "graduate-city", com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement.INPUT,
                com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl.TEXT,
                com.careerform.formanalysis.dto.FieldsAnalysisRequest.Visibility.VISIBLE,
                null, "locCity_2", null, null, null, null, null, null
            )
        );
        var resolution = new com.careerform.formanalysis.application.policy.StoredPolicyFieldMappingResolver(policy)
            .resolve(new com.careerform.formanalysis.dto.FieldsAnalysisRequest(
                2, "hyundai-raw-location-triggers",
                new com.careerform.formanalysis.dto.FieldsAnalysisRequest.Site(
                    "talent.hyundai.com", "/apply/applyWrite.hc"
                ),
                java.util.List.of(new com.careerform.formanalysis.dto.FieldsAnalysisRequest.Section(
                    "section-root", null, null, java.util.List.of(),
                    java.util.List.of(
                        new com.careerform.formanalysis.dto.FieldsAnalysisRequest.Item(
                            "university", java.util.List.of(rawLocations.getFirst()), "educationuniversity"
                        ),
                        new com.careerform.formanalysis.dto.FieldsAnalysisRequest.Item(
                            "graduate", java.util.List.of(rawLocations.getLast()), "educationgraduateschool"
                        )
                    )
                ))
            ));
        assertThat(resolution.results()).allMatch(
            result -> result instanceof com.careerform.formanalysis.application.port.FieldMappingResolver.Match
        );
        var interaction = new com.careerform.formanalysis.application.FieldInteractionPolicy();
        assertThat(java.util.stream.IntStream.range(0, rawLocations.size())
            .mapToObj(index -> interaction.evaluate(rawLocations.get(index), resolution.results().get(index)))
            .toList())
            .extracting("interactionStatus", "writePlan")
            .containsExactly(
                org.assertj.core.groups.Tuple.tuple(
                    com.careerform.formanalysis.dto.FieldsAnalysisResponse.InteractionStatus.READY,
                    new com.careerform.formanalysis.dto.FieldsAnalysisResponse.WritePlan(
                        com.careerform.formanalysis.dto.FieldsAnalysisResponse.WriteCommand.SELECT_BUTTON_OPTION
                    )
                ),
                org.assertj.core.groups.Tuple.tuple(
                    com.careerform.formanalysis.dto.FieldsAnalysisResponse.InteractionStatus.READY,
                    new com.careerform.formanalysis.dto.FieldsAnalysisResponse.WritePlan(
                        com.careerform.formanalysis.dto.FieldsAnalysisResponse.WriteCommand.SELECT_BUTTON_OPTION
                    )
                )
            );
    }

    @Test
    @DisplayName("CF-86 현대 학력 주야간 trigger는 이름 없이도 exact id와 group에서만 button option으로 준비한다")
    void resolvesRawNamelessHyundaiAttendanceTriggerAndRejectsInvalidContext() {
        var companies = mock(FormAnalysisCompanyMongoRepository.class);
        var policies = mock(FormAnalysisPolicyMongoRepository.class);
        var captured = ArgumentCaptor.forClass(FormAnalysisPolicyDocument.class);
        new LocalCompanyFormPolicySeeder(companies, policies).run(null);
        org.mockito.Mockito.verify(policies, org.mockito.Mockito.times(2)).save(captured.capture());
        var hyundai = captured.getAllValues().stream()
            .filter(policy -> policy.companyKey().equals("hyundai")).findFirst().orElseThrow();
        var policy = com.careerform.formanalysis.application.policy.CompanyFormPolicy.create(
            hyundai.companyKey(), hyundai.version(), hyundai.preparationFingerprint(),
            hyundai.fieldsFingerprint(), hyundai.actionRules(), hyundai.fieldRules(), ignored -> true
        );
        var valid = rawField("attendance-valid", "schClass_1",
            com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl.BUTTON);
        var wrongGroup = rawField("attendance-wrong-group", "schClass_2",
            com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl.BUTTON);
        var wrongControl = rawField("attendance-wrong-control", "schClass_3",
            com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl.TEXT);
        var wrongId = rawField("attendance-wrong-id", "schoolClass_4",
            com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl.BUTTON);
        var resolution = new com.careerform.formanalysis.application.policy.StoredPolicyFieldMappingResolver(policy)
            .resolve(new com.careerform.formanalysis.dto.FieldsAnalysisRequest(
                2, "hyundai-raw-attendance-trigger",
                new com.careerform.formanalysis.dto.FieldsAnalysisRequest.Site(
                    "talent.hyundai.com", "/apply/applyWrite.hc"
                ),
                java.util.List.of(new com.careerform.formanalysis.dto.FieldsAnalysisRequest.Section(
                    "section-root", null, null, java.util.List.of(), java.util.List.of(
                        new com.careerform.formanalysis.dto.FieldsAnalysisRequest.Item(
                            "university", java.util.List.of(valid, wrongControl, wrongId), "educationuniversity"
                        ),
                        new com.careerform.formanalysis.dto.FieldsAnalysisRequest.Item(
                            "high-school", java.util.List.of(wrongGroup), "educationhighschool"
                        )
                    )
                ))
            ));
        assertThat(resolution.results()).containsExactly(
            new com.careerform.formanalysis.application.port.FieldMappingResolver.Match(
                "attendance-valid",
                new com.careerform.formanalysis.application.port.FieldMappingResolver.ButtonOptionBinding(
                    "education.university.attendanceType",
                    java.util.Map.of("주간", "주간", "야간", "야간"),
                    java.util.Map.of("주간", "D", "야간", "N")
                )
            ),
            new com.careerform.formanalysis.application.port.FieldMappingResolver.NoMatch("attendance-wrong-control"),
            new com.careerform.formanalysis.application.port.FieldMappingResolver.NoMatch("attendance-wrong-id"),
            new com.careerform.formanalysis.application.port.FieldMappingResolver.NoMatch("attendance-wrong-group")
        );
        assertThat(new com.careerform.formanalysis.application.FieldInteractionPolicy()
            .evaluate(valid, resolution.results().getFirst()))
            .extracting("interactionStatus", "writePlan")
            .containsExactly(
                com.careerform.formanalysis.dto.FieldsAnalysisResponse.InteractionStatus.READY,
                new com.careerform.formanalysis.dto.FieldsAnalysisResponse.WritePlan(
                    com.careerform.formanalysis.dto.FieldsAnalysisResponse.WriteCommand.SELECT_BUTTON_OPTION
                )
            );
    }

    private static com.careerform.formanalysis.dto.FieldsAnalysisRequest.FieldCandidate rawField(
        String candidateId,
        String domId,
        com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl control
    ) {
        return new com.careerform.formanalysis.dto.FieldsAnalysisRequest.FieldCandidate(
            candidateId, com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement.INPUT,
            control, com.careerform.formanalysis.dto.FieldsAnalysisRequest.Visibility.VISIBLE,
            null, domId, null, null, null, null, null, null
        );
    }

    private static com.careerform.formanalysis.application.port.FieldMappingResolver.ButtonOptionBinding
        buttonBinding(FormAnalysisPolicyDocument policy, String structuralName) {
        return (com.careerform.formanalysis.application.port.FieldMappingResolver.ButtonOptionBinding)
            policy.fieldRules().stream()
                .filter(rule -> rule.structuralName().equals(structuralName))
                .findFirst()
                .orElseThrow()
                .valueBinding();
    }

    private static com.careerform.formanalysis.application.port.FieldMappingResolver.ButtonOptionBinding
        completionStatusBinding(String profileFieldKey) {
        return new com.careerform.formanalysis.application.port.FieldMappingResolver.ButtonOptionBinding(
            profileFieldKey,
            java.util.Map.ofEntries(
                java.util.Map.entry("졸업", "졸업"),
                java.util.Map.entry("졸업예정", "졸업예정"),
                java.util.Map.entry("재학", "재학중"),
                java.util.Map.entry("재학중", "재학중"),
                java.util.Map.entry("중퇴", "중퇴"),
                java.util.Map.entry("수료", "수료")
            ),
            java.util.Map.of(
                "졸업", "01",
                "졸업예정", "02",
                "재학중", "03",
                "중퇴", "05",
                "수료", "10"
            )
        );
    }

    private static java.util.Map<String, String> languageOptionMap(boolean skill) {
        java.util.Map<String, String> options = new java.util.LinkedHashMap<>(java.util.Map.ofEntries(
            java.util.Map.entry("한국어", "한국어"),
            java.util.Map.entry("영어", "영어"),
            java.util.Map.entry("중국어", "중국어"),
            java.util.Map.entry("아랍어", "아랍어"),
            java.util.Map.entry("스페인어", "스페인어"),
            java.util.Map.entry("포르투갈어", "포르투갈어"),
            java.util.Map.entry("프랑스어", "프랑스어"),
            java.util.Map.entry("독일어", "독일어"),
            java.util.Map.entry("러시아어", "러시아어"),
            java.util.Map.entry("일본어", "일본어"),
            java.util.Map.entry("이탈리아어", "이탈리아어")
        ));
        if (!skill) {
            options.put("베트남어", "베트남어");
            options.put("인도네시아어", "인도네시아어");
        }
        return java.util.Map.copyOf(options);
    }

    private static java.util.Map<String, String> languageCodeMap(boolean skill) {
        java.util.Map<String, String> codes = new java.util.LinkedHashMap<>(java.util.Map.ofEntries(
            java.util.Map.entry("한국어", "01"),
            java.util.Map.entry("영어", "02"),
            java.util.Map.entry("중국어", "03"),
            java.util.Map.entry("아랍어", "04"),
            java.util.Map.entry("스페인어", "07"),
            java.util.Map.entry("포르투갈어", "08"),
            java.util.Map.entry("프랑스어", "09"),
            java.util.Map.entry("독일어", "10"),
            java.util.Map.entry("러시아어", "11"),
            java.util.Map.entry("일본어", "12"),
            java.util.Map.entry("이탈리아어", "21")
        ));
        if (!skill) {
            codes.put("베트남어", "16");
            codes.put("인도네시아어", "18");
        }
        return java.util.Map.copyOf(codes);
    }
}
