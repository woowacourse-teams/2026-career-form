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
        assertThat(document.fieldRules()).filteredOn(rule -> GreetingFormFingerprint.NAME.equals(rule.structuralName()))
            .extracting(rule -> rule.valueBinding()).containsExactly(new DerivedBinding(DerivedRecipe.KOREAN_FULL_NAME));
        assertThat(document.fieldRules()).filteredOn(rule -> GreetingFormFingerprint.PHONE.equals(rule.structuralName()))
            .extracting(rule -> rule.valueBinding()).containsExactly(new DirectBinding("contact.contact.phoneNumber"));
        assertThat(document.fieldRules()).filteredOn(rule -> "basicInformation.englishName".equals(rule.structuralName()))
            .extracting(rule -> rule.valueBinding()).containsExactly(new DerivedBinding(DerivedRecipe.ENGLISH_FULL_NAME_GIVEN_FIRST));
    }
}
