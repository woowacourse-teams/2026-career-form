package com.careerform.formanalysis.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verifyNoInteractions;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import tools.jackson.databind.json.JsonMapper;
import com.careerform.formanalysis.application.port.ActionResolver;
import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.application.port.InteractionDecisionProvider;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.Role;
import com.careerform.formanalysis.exception.ResolverException;
import com.careerform.formanalysis.infrastructure.adapter.openai.OpenAiClient;
import com.careerform.formanalysis.infrastructure.adapter.openai.OpenAiActionResolver;
import com.careerform.formanalysis.infrastructure.adapter.openai.OpenAiFieldMappingResolver;
import com.careerform.formanalysis.infrastructure.adapter.jev.JevClient;

@SpringBootTest(properties = {
    "spring.mongodb.uri=mongodb://localhost/career-form-test",
    "career-form.analysis.enabled=true",
    "career-form.analysis.provider=openai",
    "career-form.analysis.search-provider=openai",
    "spring.ai.openai.api-key=synthetic-test-key"
})
class SplitSearchProviderContextTest {
    @Autowired ApplicationContext context;
    @Autowired InteractionDecisionProvider provider;
    @MockitoBean OpenAiClient openai;
    @MockitoBean JevClient jev;

    @Test
    void leavesPreparationAndFieldMappingOnOpenAi() {
        assertThat(context.getBean(ActionResolver.class)).isInstanceOf(OpenAiActionResolver.class);
        assertThat(context.getBean(FieldMappingResolver.class)).isInstanceOf(OpenAiFieldMappingResolver.class);
        assertThat(context.getBeansOfType(InteractionDecisionProvider.class)).hasSize(1);
    }

    @Test
    void sendsSearchRolesToConfiguredSearchProviderAndCalendarRolesToDefaultJev() {
        var calendars = List.of(Role.CALENDAR_OPENER, Role.CALENDAR_YEAR_TRIGGER, Role.CALENDAR_YEAR_CONTROL,
            Role.CALENDAR_MONTH_CONTROL, Role.CALENDAR_DAY_CONTROL, Role.CALENDAR_NAVIGATION, Role.CALENDAR_APPLY);
        when(jev.choose(any(), any())).thenAnswer(call -> {
            Map<String, JevClient.Choice> questions = call.getArgument(1);
            assertThat(questions.keySet()).containsExactlyInAnyOrderElementsOf(calendars.stream().map(Enum::name).toList());
            return questions.keySet().stream().collect(java.util.stream.Collectors.toMap(id -> id, id -> JevClient.ABSTAIN));
        });
        when(openai.generateInteraction(anyString(), any(), any())).thenAnswer(call -> {
            InteractionDecisionProvider.Batch batch = call.getArgument(1);
            assertThat(batch.decisions()).extracting(InteractionDecisionProvider.Decision::role)
                .containsExactly(Role.SEARCH_POPUP_OPENER, Role.SEARCH_QUERY_INPUT, Role.SEARCH_SUBMIT,
                    Role.SEARCH_RESULT_CONTAINER, Role.SEARCH_RESULT_ITEM, Role.SEARCH_RESULT_ACTION);
            return JsonMapper.builder().build().convertValue(Map.of("schemaVersion", 2, "selections", List.of(),
                "abstentions", batch.decisions().stream().map(d -> Map.of("decisionId", d.decisionId(), "role", d.role())).toList()),
                (Class<?>) call.getArgument(2));
        });
        var decisions = java.util.Arrays.stream(Role.values()).map(role ->
            new InteractionDecisionProvider.Decision(role.name(), role, "education.university.schoolName", List.of())).toList();
        var result = provider.decide(new InteractionDecisionProvider.Batch(2, decisions));
        assertThat(result.results()).hasSize(decisions.size()).allMatch(r -> r instanceof InteractionDecisionProvider.Abstained);
        assertThat(result.results()).extracting(InteractionDecisionProvider.Result::decisionId)
            .containsExactlyElementsOf(decisions.stream().map(InteractionDecisionProvider.Decision::decisionId).toList());
    }

    @Test
    void doesNotFallbackToOpenAiWhenJevCalendarFails() {
        when(jev.choose(any(), any())).thenThrow(new ResolverException("synthetic unavailable"));
        assertThatThrownBy(() -> provider.decide(new InteractionDecisionProvider.Batch(2, List.of(
            new InteractionDecisionProvider.Decision("calendar", Role.CALENDAR_OPENER,
                "education.university.startDate", List.of())))))
            .isInstanceOf(ResolverException.class);
        verifyNoInteractions(openai);
    }

    @Test
    void rejectsAnOpenAiResponseClaimingADecisionAssignedToJev() {
        when(openai.generateInteraction(anyString(), any(), any())).thenAnswer(call ->
            JsonMapper.builder().build().convertValue(Map.of("schemaVersion", 2, "selections", List.of(),
                "abstentions", List.of(Map.of("decisionId", "calendar", "role", "CALENDAR_OPENER"))),
                (Class<?>) call.getArgument(2)));
        assertThatThrownBy(() -> provider.decide(new InteractionDecisionProvider.Batch(2, List.of(
            new InteractionDecisionProvider.Decision("search", Role.SEARCH_RESULT_ITEM,
                "education.university.schoolName", List.of()),
            new InteractionDecisionProvider.Decision("calendar", Role.CALENDAR_OPENER,
                "education.university.startDate", List.of())))))
            .isInstanceOf(ResolverException.class);
        verifyNoInteractions(jev);
    }
}
