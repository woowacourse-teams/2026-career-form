package com.careerform.formanalysis.infrastructure.persistence.mongo;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.data.mongodb.core.MongoTemplate;
import com.careerform.formanalysis.application.port.GreetingDomainEvidence;
import com.careerform.formanalysis.dto.ExecutionPolicy;

class ExecutionPolicyLookupTest {
    private final FormAnalysisCompanyMongoRepository companies = mock(FormAnalysisCompanyMongoRepository.class);
    private final FormAnalysisPolicyMongoRepository policies = mock(FormAnalysisPolicyMongoRepository.class);
    private final GreetingDomainEvidence domains = mock(GreetingDomainEvidence.class);
    private final MongoGreetingPolicyProvider greeting = mock(MongoGreetingPolicyProvider.class);
    private final MongoTemplate mongo = mock(MongoTemplate.class);
    private final ExecutionPolicyLookup lookup = new ExecutionPolicyLookup(companies, policies, domains, greeting, mongo);

    @Test void resolvesUnregisteredHplaceTenant() {
        var doc = HplaceCompanyFormPolicyFactory.createNative();
        var execution = doc.executionPolicy();
        when(policies.findByCompanyKeyAndVersion("hplace", 4)).thenReturn(Optional.of(doc));
        when(domains.classify(any(), any())).thenReturn(GreetingDomainEvidence.Decision.NO_POSITIVE_EVIDENCE);
        assertThat(lookup.find("unregistered.recruiter.im", "/mrs2/applicant/resume/writeResume")).isEqualTo(execution);
        verifyNoInteractions(domains);
    }
    @Test void doesNotFallbackOnMissingHplacePolicy() {
        when(domains.classify(any(), any())).thenReturn(GreetingDomainEvidence.Decision.POSITIVE);
        assertThatThrownBy(() -> lookup.find("new-tenant.recruiter.co.kr", "/mrs2/applicant/resume/writeResume")).isInstanceOf(IllegalStateException.class);
        verifyNoInteractions(domains, greeting, mongo);
    }
    @Test void preservesRegisteredCompanyPrecedence() {
        when(companies.findByHost("registered.recruiter.im")).thenReturn(Optional.of(new FormAnalysisCompanyDocument("registered", "registered", "registered.recruiter.im", List.of("/other"), 1)));
        assertThat(lookup.find("registered.recruiter.im", "/mrs2/applicant/resume/writeResume")).isNull();
        verifyNoInteractions(domains, greeting, policies);
    }
    @Test void rejectsUnsupportedApplicantPathWithoutDnsFallback() {
        when(domains.classify(any(), any())).thenReturn(GreetingDomainEvidence.Decision.POSITIVE);
        assertThat(lookup.find("tenant.recruiter.im", "/mrs2/applicant/resume/preview")).isNull();
        verifyNoInteractions(domains, greeting);
    }
    @Test void doesNotFallbackOnInvalidHplaceExecutionPolicy() {
        var doc = HplaceCompanyFormPolicyFactory.createNative().withExecutionPolicy(
            new ExecutionPolicy(1, List.of(), List.of(), null, Map.of("schemaVersion", 2)));
        when(policies.findByCompanyKeyAndVersion("hplace", 4)).thenReturn(Optional.of(doc));
        assertThatThrownBy(() -> lookup.find("tenant.recruiter.im", "/mrs2/applicant/resume/writeResume")).isInstanceOf(IllegalStateException.class);
        verifyNoInteractions(domains, greeting, mongo);
    }
    @Test void rejectsSpoofedHostAsSupplierEvidence() {
        when(domains.classify(any(), any())).thenReturn(GreetingDomainEvidence.Decision.NO_POSITIVE_EVIDENCE);
        for (var host : List.of("tenant.recruiter.im.attacker.test", "a.b.recruiter.im", "tenant.recruiter.im:443", "https://tenant.recruiter.im")) {
            assertThat(lookup.find(host,"/mrs2/applicant/resume/writeResume")).isNull();
        }
        verifyNoInteractions(policies);
    }

}
