package com.careerform.formanalysis.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import com.careerform.formanalysis.application.port.InteractionDecisionProvider;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.Role;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.TargetKind;
import com.careerform.formanalysis.infrastructure.adapter.jev.JevClient;
import com.careerform.formanalysis.infrastructure.adapter.openai.OpenAiClient;

class SearchRoutedInteractionDecisionProviderTest {

    @ParameterizedTest
    @EnumSource(value = Role.class, names = {"REPEAT_ADD", "SECTION_REVEAL", "ROW_KIND_OPTION"})
    void routesStructureRolesWithTheCalendarProvider(Role role) {
        OpenAiClient openai = mock(OpenAiClient.class);
        JevClient jev = mock(JevClient.class);
        when(jev.choose(any(), any())).thenReturn(Map.of("structure", JevClient.ABSTAIN));
        var provider = new SearchRoutedInteractionDecisionProvider(
            new AnalysisProviderSelection(true, "openai", "openai", "jev"), openai, jev);

        var resolution = provider.decide(new InteractionDecisionProvider.Batch(2, List.of(
            new InteractionDecisionProvider.Decision("structure", role, "education.university.schoolName", List.of(),
                role == Role.ROW_KIND_OPTION ? TargetKind.BACHELOR : null))));

        assertThat(resolution.results()).containsExactly(new InteractionDecisionProvider.Abstained("structure", role));
        verifyNoInteractions(openai);
    }
}
