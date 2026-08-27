package com.careerform.formanalysis.infrastructure.adapter.sk;

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

@DisplayName("SK 준비 동작 Resolver")
class SkActionResolverTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    @DisplayName("검증된 reveal과 repeatable add 규칙을 후보 순서대로 분류한다")
    void resolvesVerifiedActionsInCandidateOrder() throws Exception {
        PreparationAnalysisRequest request = objectMapper.readValue(
            fixture("sk-preparation-snapshot-a-v2.json"),
            PreparationAnalysisRequest.class
        );

        ActionResolver.Resolution resolution = new SkActionResolver().resolve(request);

        assertThat(resolution).isEqualTo(new ActionResolver.Resolution(
            2,
            "sk-snapshot-a-synthetic",
            List.of(
                new ActionResolver.RevealAction(
                    "action-reveal-detail",
                    "section-detail"
                ),
                new ActionResolver.AddAction("action-add-credential")
            )
        ));
    }

    @Test
    @DisplayName("알려진 구조 이름도 실행 불가능한 후보이면 NO_ACTION으로 닫는다")
    void rejectsKnownRulesForIneligibleCandidates() {
        PreparationAnalysisRequest request = new PreparationAnalysisRequest(
            2,
            "sk-ineligible-actions",
            new Site("www.skcareers.com", "/Recruit/Apply/{postingId}"),
            List.of(
                new Section(
                    "section-profile",
                    null,
                    null,
                    List.of(
                        action(
                            "action-hidden",
                            "credential-add",
                            FormElement.BUTTON,
                            FormControl.BUTTON,
                            Visibility.HIDDEN,
                            null,
                            null,
                            null
                        ),
                        action(
                            "action-disabled",
                            "detail-toggle",
                            FormElement.BUTTON,
                            FormControl.BUTTON,
                            Visibility.VISIBLE,
                            true,
                            null,
                            null
                        ),
                        action(
                            "action-readonly",
                            "credential-add",
                            FormElement.BUTTON,
                            FormControl.BUTTON,
                            Visibility.VISIBLE,
                            null,
                            true,
                            null
                        ),
                        action(
                            "action-wrong-control",
                            "credential-add",
                            FormElement.CUSTOM,
                            FormControl.CUSTOM,
                            Visibility.VISIBLE,
                            null,
                            null,
                            null
                        ),
                        action(
                            "action-missing-name",
                            null,
                            FormElement.BUTTON,
                            FormControl.BUTTON,
                            Visibility.VISIBLE,
                            null,
                            null,
                            null
                        )
                    ),
                    null
                ),
                new Section(
                    "section-detail",
                    "section-profile",
                    null,
                    List.of(),
                    null
                )
            )
        );

        ActionResolver.Resolution resolution = new SkActionResolver().resolve(request);

        assertThat(resolution.results()).containsExactly(
            new ActionResolver.NoAction("action-hidden"),
            new ActionResolver.NoAction("action-disabled"),
            new ActionResolver.NoAction("action-readonly"),
            new ActionResolver.NoAction("action-wrong-control"),
            new ActionResolver.NoAction("action-missing-name")
        );
    }

    private static ActionCandidate action(
        String candidateId,
        String domName,
        FormElement element,
        FormControl control,
        Visibility visibility,
        Boolean disabled,
        Boolean readonly,
        Boolean inert
    ) {
        return new ActionCandidate(
            candidateId,
            element,
            control,
            visibility,
            null,
            null,
            domName,
            disabled,
            readonly,
            inert
        );
    }

    private static String fixture(String name) throws Exception {
        return new ClassPathResource("formanalysis/" + name)
            .getContentAsString(StandardCharsets.UTF_8);
    }
}
