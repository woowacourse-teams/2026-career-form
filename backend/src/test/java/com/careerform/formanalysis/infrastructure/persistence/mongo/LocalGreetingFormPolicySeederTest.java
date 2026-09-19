package com.careerform.formanalysis.infrastructure.persistence.mongo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class LocalGreetingFormPolicySeederTest {

    @Test
    void storesOneSharedPolicyWithoutACompanyHostRow() {
        var policies = mock(FormAnalysisPolicyMongoRepository.class);
        var document = ArgumentCaptor.forClass(FormAnalysisPolicyDocument.class);

        new LocalGreetingFormPolicySeeder(policies).run(null);

        verify(policies).save(document.capture());
        assertThat(document.getValue().companyKey()).isEqualTo("greeting");
        assertThat(document.getValue().version()).isEqualTo(1);
    }
}
