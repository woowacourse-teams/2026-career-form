package com.careerform.formanalysis.api;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.NotRegistered;

@TestConfiguration(proxyBeanMethods = false)
class NotRegisteredPolicyConfiguration {

    @Bean
    @Primary
    CompanyFormPolicyProvider notRegisteredCompanyFormPolicyProvider() {
        return (host, path) -> new NotRegistered();
    }
}
