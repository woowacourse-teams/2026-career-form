package com.careerform.formanalysis.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class ProfileFieldCatalogTest {

    @Test
    void exposesExactlyTheCanonicalSeventySevenKeys() {
        assertThat(ProfileFieldCatalog.keys())
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
    void preservesTheApprovedAutofillPolicyDistribution() {
        assertThat(ProfileFieldCatalog.entries().values())
            .filteredOn(policy -> policy == AutofillPolicy.ALLOWED)
            .hasSize(29);
        assertThat(ProfileFieldCatalog.entries().values())
            .filteredOn(policy -> policy == AutofillPolicy.CONDITIONAL)
            .hasSize(28);
        assertThat(ProfileFieldCatalog.entries().values())
            .filteredOn(policy -> policy == AutofillPolicy.SENSITIVE_CONFIRMATION)
            .hasSize(20);
    }

    @Test
    void returnsThePolicyOnlyForCanonicalKeys() {
        assertThat(ProfileFieldCatalog.contains("contact.contact.email")).isTrue();
        assertThat(ProfileFieldCatalog.policyOf("contact.contact.email"))
            .contains(AutofillPolicy.ALLOWED);
        assertThat(ProfileFieldCatalog.contains("contact.email")).isFalse();
        assertThat(ProfileFieldCatalog.policyOf("contact.email")).isEmpty();
    }
}
