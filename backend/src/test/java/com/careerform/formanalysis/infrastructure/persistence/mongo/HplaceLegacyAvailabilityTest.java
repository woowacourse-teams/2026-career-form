package com.careerform.formanalysis.infrastructure.persistence.mongo;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.data.mongodb.core.MongoTemplate;
import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.Available;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.Unavailable;
import com.careerform.formanalysis.application.port.GreetingDomainEvidence;
import com.careerform.formanalysis.dto.ExecutionPolicy;

class HplaceLegacyAvailabilityTest {
    private final FormAnalysisCompanyMongoRepository companies = mock(FormAnalysisCompanyMongoRepository.class);
    private final FormAnalysisPolicyMongoRepository policies = mock(FormAnalysisPolicyMongoRepository.class);
    private final GreetingDomainEvidence domains = mock(GreetingDomainEvidence.class);
    private final MongoGreetingPolicyProvider greeting = mock(MongoGreetingPolicyProvider.class);

    private MongoHplacePolicyProvider provider(long version) {
        return new MongoHplacePolicyProvider(policies, new SupportedProfileFields(), version);
    }
    private ExecutionPolicyLookup lookup(long version) {
        return new ExecutionPolicyLookup(companies, policies, domains, greeting, mock(MongoTemplate.class), provider(version));
    }
    private void legacy() {
        when(policies.findByCompanyKeyAndVersion("hplace", 3)).thenReturn(Optional.of(HplaceCompanyFormPolicyFactory.create()));
    }
    @Test void validLegacyRollbackReturnsNoNativeExecutionWithoutGenericFallback() {
        legacy();
        assertThat(lookup(3).find("tenant.recruiter.co.kr", "/mrs2/applicant/resume/writeResume")).isNull();
        verifyNoInteractions(domains, greeting);
    }
    @Test void absentV4PreservesOnlyTheThreeAndSeventeenLegacyBindings() {
        legacy();
        assertThat(provider(4).find()).isInstanceOfSatisfying(Available.class, available -> {
            assertThat(available.policy().version()).isEqualTo(3);
            assertThat(available.policy().fieldRules()).hasSize(20);
            assertThat(available.policy().sectionContracts()).isEmpty();
            assertThat(available.policy().executionPolicy()).isNull();
        });
        assertThat(lookup(4).find("tenant.recruiter.im", "/mrs2/applicant/resume/writeResume")).isNull();
        assertThat(lookup(4).find("tenant.recruiter.im", "/app/applicant/registResume")).isNull();
        verifyNoInteractions(domains, greeting);
    }
    @Test void invalidExistingV4NeverFallsBackToV3() {
        legacy();
        when(policies.findByCompanyKeyAndVersion("hplace", 4)).thenReturn(Optional.of(
            HplaceCompanyFormPolicyFactory.createNative().withExecutionPolicy(
                new ExecutionPolicy(1, List.of(), List.of(), null, Map.of("schemaVersion", 2)))));
        assertThat(provider(4).find()).isInstanceOf(Unavailable.class);
        verify(policies, never()).findByCompanyKeyAndVersion("hplace", 3);
    }
    @Test void failedV4LookupNeverFallsBackToV3() {
        when(policies.findByCompanyKeyAndVersion("hplace", 4)).thenThrow(new IllegalStateException("synthetic failure"));
        assertThat(provider(4).find()).isInstanceOf(Unavailable.class);
        verify(policies, never()).findByCompanyKeyAndVersion("hplace", 3);
    }
}
