package com.careerform.formanalysis.infrastructure.persistence.mongo;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import com.careerform.formanalysis.application.FormAnalysisRouter;
import com.careerform.formanalysis.application.PreparationAnalysisService;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;
import tools.jackson.databind.ObjectMapper;

class AddressAnalysisServiceTest {
    private CompanyFormPolicy policy(String companyKey) throws Exception {
        var companies = mock(FormAnalysisCompanyMongoRepository.class);
        var policies = mock(FormAnalysisPolicyMongoRepository.class);
        new LocalCompanyFormPolicySeeder(companies, policies).run(null);
        var captured = ArgumentCaptor.forClass(FormAnalysisPolicyDocument.class);
        verify(policies, org.mockito.Mockito.times(2)).save(captured.capture());
        var p = captured.getAllValues().stream().filter(x -> x.companyKey().equals(companyKey)).findFirst().orElseThrow();
        return CompanyFormPolicy.create(p.companyKey(), p.version(), p.preparationFingerprint(),
            p.fieldsFingerprint(), p.actionRules(), p.fieldRules(), key -> true);
    }

    private CompanyFormPolicy policy() throws Exception {
        return policy("sk");
    }


    private PreparationAnalysisRequest request(String host, String domId, boolean disabled) {
        var action = new PreparationAnalysisRequest.ActionCandidate("address-action",
            PreparationAnalysisRequest.FormElement.BUTTON, PreparationAnalysisRequest.FormControl.BUTTON,
            PreparationAnalysisRequest.Visibility.VISIBLE, "우편번호 찾기", domId, null,
            disabled ? true : null, null, null);
        return new PreparationAnalysisRequest(2, "prep",
            new PreparationAnalysisRequest.Site(host, "/Application/Index/:id"),
            List.of(new PreparationAnalysisRequest.Section("section-1", null, null, List.of(action), null)));
    }
    @Test
    void includesSearchOnlyWhenClientOptsIn() throws Exception {
        var p = policy();
        var service = new PreparationAnalysisService(Optional.empty(),
            new FormAnalysisRouter((host, path) ->
                host.equals("www.skcareers.com")
                    ? new CompanyFormPolicyProvider.Available(p)
                    : new CompanyFormPolicyProvider.NotRegistered()));
        var request = request("www.skcareers.com", "btnSearchAddress", false);
        assertThat(new ObjectMapper().writeValueAsString(service.analyze(request)))
            .doesNotContain("SEARCH_ADDRESS");
        assertThat(new ObjectMapper().writeValueAsString(service.analyze(request, true)))
            .contains("\"command\":\"SEARCH_ADDRESS\"").contains("\"expectedEffect\":\"ADDRESS_SELECTED\"");
    }
    @Test
    void deniesForeignHostDisabledAndInexactIdentity() throws Exception {
        var p = policy();
        var service = new PreparationAnalysisService(Optional.empty(),
            new FormAnalysisRouter((host, path) ->
                host.equals("www.skcareers.com")
                    ? new CompanyFormPolicyProvider.Available(p)
                    : new CompanyFormPolicyProvider.NotRegistered()));
        for (var request : List.of(request("example.test", "btnSearchAddress", false),
            request("www.skcareers.com", "btnSearchAddress", true),
            request("www.skcareers.com", "btnSearchAddress_1", false))) {
            assertThat(new ObjectMapper().writeValueAsString(service.analyze(request, true)))
                .doesNotContain("SEARCH_ADDRESS");
        }
    }

    @Test
    void includesHyundaiSearchWhenRegisteredPolicyAndClientCapabilityMatch() throws Exception {
        var p = policy("hyundai");
        var service = new PreparationAnalysisService(Optional.empty(),
            new FormAnalysisRouter((host, path) -> new CompanyFormPolicyProvider.Available(p)));
        var address = new PreparationAnalysisRequest.ActionCandidate(
            "hyundai-address-action",
            PreparationAnalysisRequest.FormElement.INPUT,
            PreparationAnalysisRequest.FormControl.BUTTON,
            PreparationAnalysisRequest.Visibility.VISIBLE,
            "우편번호",
            "hyundai:search:address",
            "postCd",
            null,
            null,
            null
        );
        var request = new PreparationAnalysisRequest(
            2,
            "hyundai-prep",
            new PreparationAnalysisRequest.Site(
                "talent.hyundai.com", "/apply/applyWrite.hc"
            ),
            List.of(new PreparationAnalysisRequest.Section(
                "section-root", null, null, List.of(
                    address,
                    hyundaiAction("career"),
                    hyundaiAction("project"),
                    hyundaiAction("foreign"),
                    hyundaiAction("foreignAbility"),
                    hyundaiAction("licence"),
                    hyundaiAction("publication")
                ), null
            ))
        );

        assertThat(new ObjectMapper().writeValueAsString(service.analyze(request)))
            .doesNotContain("SEARCH_ADDRESS");
        assertThat(new ObjectMapper().writeValueAsString(service.analyze(request, true)))
            .contains("\"command\":\"SEARCH_ADDRESS\"")
            .contains("\"expectedEffect\":\"ADDRESS_SELECTED\"");
    }

    private static PreparationAnalysisRequest.ActionCandidate hyundaiAction(
        String scope
    ) {
        return new PreparationAnalysisRequest.ActionCandidate(
            "hyundai-" + scope,
            PreparationAnalysisRequest.FormElement.BUTTON,
            PreparationAnalysisRequest.FormControl.BUTTON,
            PreparationAnalysisRequest.Visibility.VISIBLE,
            "항목 추가",
            "hyundai:add:" + scope,
            null,
            null,
            null,
            null
        );
    }
}
