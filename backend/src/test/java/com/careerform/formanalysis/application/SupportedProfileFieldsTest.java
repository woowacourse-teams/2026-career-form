package com.careerform.formanalysis.application;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.careerform.formanalysis.dto.FieldsAnalysisResponse.AutofillPolicy;

@DisplayName("지원 프로필 필드 목록")
class SupportedProfileFieldsTest {

    private final SupportedProfileFields supportedFields = new SupportedProfileFields();

    @Test
    @DisplayName("canonical profile key 77개만 제공한다")
    void exposesExactlyTheCanonicalSeventySevenKeys() {
        assertThat(supportedFields.keys())
            .hasSize(77)
            .contains(
                "personal.personal.koreanFamilyName",
                "contact.contact.phoneNumber",
                "education.graduateSchool.additionalMajorName",
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
            .hasSize(49);
        assertThat(supportedFields.keys())
            .map(key -> supportedFields.policyOf(key).orElseThrow())
            .filteredOn(policy -> policy == AutofillPolicy.CONDITIONAL)
            .hasSize(28);
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
}
