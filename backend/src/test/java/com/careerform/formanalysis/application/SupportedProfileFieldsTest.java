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
    @DisplayName("승인된 autofill policy 분포를 유지한다")
    void preservesTheApprovedAutofillPolicyDistribution() {
        assertThat(supportedFields.keys())
            .map(key -> supportedFields.policyOf(key).orElseThrow())
            .filteredOn(policy -> policy == AutofillPolicy.ALLOWED)
            .hasSize(29);
        assertThat(supportedFields.keys())
            .map(key -> supportedFields.policyOf(key).orElseThrow())
            .filteredOn(policy -> policy == AutofillPolicy.CONDITIONAL)
            .hasSize(28);
        assertThat(supportedFields.keys())
            .map(key -> supportedFields.policyOf(key).orElseThrow())
            .filteredOn(policy -> policy == AutofillPolicy.SENSITIVE_CONFIRMATION)
            .hasSize(20);
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
