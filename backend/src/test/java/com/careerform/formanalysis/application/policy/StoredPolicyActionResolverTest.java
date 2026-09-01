package com.careerform.formanalysis.application.policy;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import com.careerform.formanalysis.application.port.ActionResolver;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.ActionCandidate;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.FormControl;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.FormElement;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.Section;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.Site;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.Visibility;

import tools.jackson.databind.ObjectMapper;

@DisplayName("저장된 회사 정책 Action Resolver")
class StoredPolicyActionResolverTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    @DisplayName("저장된 실제 폼 add rule을 요청 후보 순서대로 반환한다")
    void resolvesStoredRulesInCandidateOrder() throws Exception {
        PreparationAnalysisRequest request = objectMapper.readValue(
            fixture("sk-preparation-current-v2.json"),
            PreparationAnalysisRequest.class
        );

        ActionResolver.Resolution resolution = new StoredPolicyActionResolver(
            CompanyFormPolicyFixture.sk()
        ).resolve(request);

        assertThat(resolution).isEqualTo(new ActionResolver.Resolution(
            2,
            "sk-current-preparation-redacted",
            List.of(
                new ActionResolver.AddAction("action-add-university"),
                new ActionResolver.AddAction("action-add-career"),
                new ActionResolver.AddAction("action-add-certificate")
            )
        ));
    }

    @Test
    @DisplayName("알려진 rule도 실행 불가능하거나 구조 이름이 없으면 NO_ACTION이다")
    void closesIneligibleAndUnnamedCandidates() {
        PreparationAnalysisRequest request = new PreparationAnalysisRequest(
            2,
            "stored-policy-ineligible-actions",
            new Site("www.skcareers.com", "/Application/Index/{postingId}"),
            List.of(new Section(
                "section-profile",
                null,
                null,
                List.of(
                    action(
                        "action-hidden",
                        "btnAddCert",
                        Visibility.HIDDEN,
                        null
                    ),
                    action(
                        "action-disabled",
                        "btnAddCareer",
                        Visibility.VISIBLE,
                        true
                    ),
                    action(
                        "action-unnamed",
                        null,
                        Visibility.VISIBLE,
                        null
                    )
                ),
                null
            ))
        );

        ActionResolver.Resolution resolution = new StoredPolicyActionResolver(
            CompanyFormPolicyFixture.sk()
        ).resolve(request);

        assertThat(resolution.results()).containsExactly(
            new ActionResolver.NoAction("action-hidden"),
            new ActionResolver.NoAction("action-disabled"),
            new ActionResolver.NoAction("action-unnamed")
        );
    }

    private static ActionCandidate action(
        String candidateId,
        String domName,
        Visibility visibility,
        Boolean disabled
    ) {
        return new ActionCandidate(
            candidateId,
            FormElement.BUTTON,
            FormControl.BUTTON,
            visibility,
            null,
            null,
            domName,
            disabled,
            null,
            null
        );
    }

    private static String fixture(String name) throws Exception {
        return new ClassPathResource("formanalysis/" + name)
            .getContentAsString(StandardCharsets.UTF_8);
    }
}
