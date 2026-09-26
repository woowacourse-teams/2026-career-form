package com.careerform.formanalysis.infrastructure.persistence.mongo;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import com.careerform.formanalysis.application.policy.GreetingFormFingerprint;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DerivedBinding;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DerivedRecipe;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DirectBinding;

class GreetingCompanyFormPolicyFactoryTest {

    @Test
    void storesOneSharedPolicyWithExactNameAndPhoneRules() {
        FormAnalysisPolicyDocument document = GreetingCompanyFormPolicyFactory.create();

        assertThat(document.companyKey()).isEqualTo("greeting");
        assertThat(document.version()).isEqualTo(1);
        assertThat(document.preparationFingerprint().noActionPreparation()).isTrue();
        assertThat(document.actionRules()).isEmpty();
        assertThat(document.fieldRules()).extracting(rule -> rule.structuralName())
            .contains(GreetingFormFingerprint.NAME, GreetingFormFingerprint.PHONE);
        assertThat(document.fieldRules().get(0).valueBinding())
            .isEqualTo(new DerivedBinding(DerivedRecipe.KOREAN_FULL_NAME));
        assertThat(document.fieldRules().get(1).valueBinding())
            .isEqualTo(new DirectBinding("contact.contact.phoneNumber"));
    }
}
