package com.careerform.formanalysis.application;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.careerform.formanalysis.dto.FieldsAnalysisResponse.AutofillPolicy;

@DisplayName("지원 프로필 필드 목록")
class SupportedProfileFieldsTest {

    private final SupportedProfileFields supportedFields = new SupportedProfileFields();

    @Test
    @DisplayName("canonical profile key 112개를 제공한다")
    void exposesExactlyTheCanonicalOneHundredTwelveKeys() {
        assertThat(supportedFields.keys())
            .hasSize(112)
            .contains(
                "personal.personal.koreanFamilyName",
                "contact.contact.phoneNumber",
                "contact.contact.secondaryEmail",
                "contact.contact.residenceCountry",
                "contact.contact.emergencyPhoneNumber",
                "education.graduateSchool.additionalMajorName",
                "education.graduateSchool.labName",
                "education.graduateSchool.labProfessorName",
                "education.graduateSchool.thesisTitle",
                "education.graduateSchool.thesisSummary",
                "education.university.transferStatus",
                "education.university.gpaScale",
                "education.university.minorName",
                "education.highSchool.academicProcess",
                "education.highSchool.completionStatus",
                "education.highSchool.schoolRegion",
                "education.university.schoolRegion",
                "education.university.totalCredits",
                "military.military.militaryType",
                "disability.disability.disabilityRegistrationNumber",
                "health.health.healthDetails"
            )
            .doesNotContain(
                "startDate",
                "grade",
                "testName",
                "languages.languageTest.evidenceDocumentPath",
                "certifications.certificate.evidenceDocumentPath"
            );
    }

    @Test
    @DisplayName("병역·보훈·장애·건강을 일반 자동 기입 정책으로 제공한다")
    void providesAllProfileFieldsWithoutSensitiveConfirmation() {
        assertThat(supportedFields.keys())
            .map(key -> supportedFields.policyOf(key).orElseThrow())
            .filteredOn(policy -> policy == AutofillPolicy.ALLOWED)
            .hasSize(68);
        assertThat(supportedFields.keys())
            .map(key -> supportedFields.policyOf(key).orElseThrow())
            .filteredOn(policy -> policy == AutofillPolicy.CONDITIONAL)
            .hasSize(44);
        assertThat(supportedFields.keys())
            .map(key -> supportedFields.policyOf(key).orElseThrow())
            .filteredOn(policy -> policy == AutofillPolicy.SENSITIVE_CONFIRMATION)
            .isEmpty();
    }

    @Test
    @DisplayName("canonical key에만 autofill policy를 반환한다")
    void returnsThePolicyOnlyForCanonicalKeys() {
        assertThat(supportedFields.contains("contact.contact.email")).isTrue();
        assertThat(supportedFields.policyOf("contact.contact.email"))
            .contains(AutofillPolicy.ALLOWED);
        assertThat(supportedFields.contains("contact.email")).isFalse();
        assertThat(supportedFields.policyOf("contact.email")).isEmpty();
        assertThat(supportedFields.contains(null)).isFalse();
    }

    @Test
    @DisplayName("보조 연락처와 장애등록번호를 조건부 자동 기입 필드로 제공한다")
    void providesSupplementaryContactAndDisabilityRegistrationFields() {
        assertThat(supportedFields.policyOf("contact.contact.secondaryEmail"))
            .contains(AutofillPolicy.CONDITIONAL);
        assertThat(supportedFields.policyOf("contact.contact.residenceCountry"))
            .contains(AutofillPolicy.CONDITIONAL);
        assertThat(supportedFields.policyOf("contact.contact.emergencyPhoneNumber"))
            .contains(AutofillPolicy.CONDITIONAL);
        assertThat(supportedFields.policyOf("disability.disability.disabilityRegistrationNumber"))
            .contains(AutofillPolicy.CONDITIONAL);
    }

    @Test
    @DisplayName("학력 과정·상태·소재지와 총 이수학점을 조건부 자동 기입 필드로 제공한다")
    void providesExtendedEducationFields() {
        assertThat(supportedFields.policyOf("education.highSchool.academicProcess"))
            .contains(AutofillPolicy.CONDITIONAL);
        assertThat(supportedFields.policyOf("education.highSchool.completionStatus"))
            .contains(AutofillPolicy.CONDITIONAL);
        assertThat(supportedFields.policyOf("education.highSchool.schoolRegion"))
            .contains(AutofillPolicy.CONDITIONAL);
        assertThat(supportedFields.policyOf("education.university.schoolRegion"))
            .contains(AutofillPolicy.CONDITIONAL);
        assertThat(supportedFields.policyOf("education.university.totalCredits"))
            .contains(AutofillPolicy.ALLOWED);
    }
}
