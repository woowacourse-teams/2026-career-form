package com.careerform.formanalysis.infrastructure.dns;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import com.careerform.formanalysis.application.*;
import com.careerform.formanalysis.application.policy.CompanyFormPolicyFixture;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.Available;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.NotRegistered;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;
import com.careerform.formanalysis.dto.PreparationAnalysisResponse;
import com.careerform.formanalysis.infrastructure.dns.GreetingDnsEvidence.Alias;
import com.careerform.formanalysis.infrastructure.dns.GreetingDnsEvidence.LookupFailure;
import tools.jackson.databind.ObjectMapper;

class GreetingDnsRoutingIntegrationTest {
    private static final String HOST = "never-registered.example.org";

    @Test
    void sameCnameEvidenceRoutesPreparationAndFieldsWithoutSession() throws Exception {
        var router = router(new GreetingDnsEvidence(host -> new Alias("tenant.career.greetinghr.com.")));
        var preparation = new PreparationAnalysisService(Optional.empty(), router).analyze(preparation());
        var fields = service(router).analyze(fields());
        assertThat(preparation.mode()).isEqualTo(PreparationAnalysisResponse.Mode.ADAPTER);
        assertThat(preparation.analysisStatus()).isEqualTo(PreparationAnalysisResponse.AnalysisStatus.COMPLETE);
        assertThat(fields.mode()).isEqualTo(FieldsAnalysisResponse.Mode.ADAPTER);
        assertThat(fields.analysisStatus()).isEqualTo(FieldsAnalysisResponse.AnalysisStatus.COMPLETE);
        assertThat(fields.fields()).hasSize(3);
    }

    @Test
    void confirmedDomainWithChangedStructureNeverInvokesGenericResolver() throws Exception {
        var router = router(new GreetingDnsEvidence(host -> new Alias("tenant.career.greetinghr.com")));
        var original = fields();
        var changed = new FieldsAnalysisRequest(2, "changed", original.site(),
            List.of(new FieldsAnalysisRequest.Section("root", null, null, List.of(), null)));
        var service = new FieldsAnalysisService(Optional.of(request -> {
            throw new AssertionError("known Greeting mismatch must not invoke LLM");
        }), router, new FieldInteractionPolicy(), new SupportedProfileFields());
        assertThat(service.analyze(changed).blockCode())
            .isEqualTo(FieldsAnalysisResponse.BlockCode.ADAPTER_STRUCTURE_MISMATCH);
    }

    @Test
    void dnsFailureBlocksBothStagesUsingExistingContract() throws Exception {
        var router = router(new GreetingDnsEvidence(host -> new LookupFailure()));
        var preparation = new PreparationAnalysisService(Optional.empty(), router).analyze(preparation());
        assertThat(preparation.blockCode()).isEqualTo(PreparationAnalysisResponse.BlockCode.ADAPTER_POLICY_UNAVAILABLE);
        assertThat(service(router).analyze(fields()).blockCode())
            .isEqualTo(FieldsAnalysisResponse.BlockCode.ADAPTER_POLICY_UNAVAILABLE);
    }

    private static FormAnalysisRouter router(GreetingDnsEvidence evidence) {
        return new FormAnalysisRouter((host, path) -> new NotRegistered(), evidence,
            () -> new Available(CompanyFormPolicyFixture.greeting()));
    }

    private static FieldsAnalysisService service(FormAnalysisRouter router) {
        return new FieldsAnalysisService(Optional.empty(), router, new FieldInteractionPolicy(), new SupportedProfileFields());
    }

    private static PreparationAnalysisRequest preparation() throws Exception {
        var fixture = new ObjectMapper().readValue(new ClassPathResource("formanalysis/greeting-preparation-current-v2.json")
            .getContentAsString(StandardCharsets.UTF_8), PreparationAnalysisRequest.class);
        return new PreparationAnalysisRequest(2, "prepare", new PreparationAnalysisRequest.Site(HOST, "/ko/o/*/apply"), fixture.sections());
    }

    private static FieldsAnalysisRequest fields() throws Exception {
        var fixture = new ObjectMapper().readValue(new ClassPathResource("formanalysis/greeting-fields-current-v2.json")
            .getContentAsString(StandardCharsets.UTF_8), FieldsAnalysisRequest.class);
        return new FieldsAnalysisRequest(2, "fields", new FieldsAnalysisRequest.Site(HOST, "/ko/o/*/apply"), fixture.sections());
    }
}
