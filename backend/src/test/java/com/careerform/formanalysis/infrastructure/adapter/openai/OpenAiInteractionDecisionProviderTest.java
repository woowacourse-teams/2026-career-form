package com.careerform.formanalysis.infrastructure.adapter.openai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import com.careerform.formanalysis.application.port.InteractionDecisionProvider;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.Role;

class OpenAiInteractionDecisionProviderTest {
    @ParameterizedTest
    @EnumSource(value = Role.class, names = {"SEARCH_RESULT_CONTAINER", "SEARCH_RESULT_ITEM", "SEARCH_RESULT_ACTION"})
    void retainsRequestedResultRoleAndExplicitAbstention(Role role) {
        OpenAiClient client = mock(OpenAiClient.class);
        when(client.generateInteraction(anyString(), any(), eq(OpenAiInteractionDecisionProvider.ProviderOutput.class)))
            .thenReturn(new OpenAiInteractionDecisionProvider.ProviderOutput(2,
                List.of(new OpenAiInteractionDecisionProvider.Selection("shape", role, "candidate")),
                List.of(new OpenAiInteractionDecisionProvider.Abstention("unknown-shape", role))));
        var result = new OpenAiInteractionDecisionProvider(client).decide(new InteractionDecisionProvider.Batch(2,
            List.of(new InteractionDecisionProvider.Decision("shape", role, "education.university.schoolName", List.of()),
                new InteractionDecisionProvider.Decision("unknown-shape", role, "education.university.schoolName", List.of()))));
        assertThat(result.results()).containsExactly(
            new InteractionDecisionProvider.Selected("shape", role, "candidate"),
            new InteractionDecisionProvider.Abstained("unknown-shape", role));
    }
}
