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
    @DisplayName("SK 공통 구조 v25와 직무별 option lookup을 결정적으로 저장한다")
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
        assertThat(policy.getValue().version()).isEqualTo(25);
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
                    null
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
        var disabilityGradeRule = policy.getValue().fieldRules().stream()
            .filter(rule -> rule.structuralName().equals("prsDisabledType"))
            .findFirst().orElseThrow();
        assertThat(disabilityGradeRule.requiredDomName()).isEqualTo("prsDisabledType");
        assertThat(disabilityGradeRule.valueBinding())
            .isEqualTo(new com.careerform.formanalysis.application.port.FieldMappingResolver.LookupBinding(
                "disability.disability.disabilityGrade",
                java.util.Map.of(
                    "중증", "중증(기존1급~3급)",
                    "경증", "경증(기존4급~6급)"
                )
            ));
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
            25
        ));
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
}
