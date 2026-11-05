package com.careerform.formanalysis.infrastructure.adapter.openai;

import java.util.ArrayList;
import java.util.List;

import org.springframework.context.annotation.Conditional;
import com.careerform.formanalysis.infrastructure.InteractionProviderConditions;
import org.springframework.stereotype.Component;

import com.careerform.formanalysis.application.port.InteractionDecisionProvider;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.Role;
import com.careerform.formanalysis.exception.ResolverException;

@Component
@Conditional(InteractionProviderConditions.OpenAiOnly.class)
public final class OpenAiInteractionDecisionProvider
    implements InteractionDecisionProvider {

    private static final String INVALID_RESPONSE_MESSAGE =
        "LLM 동적 판단 응답 계약을 확인할 수 없습니다";
    static final String SYSTEM_PROMPT = """
        Choose roles from a bounded, de-identified application-form observation.
        Return every decision exactly once, either in selections or abstentions.
        A selection contains only decisionId, the requested role, and one candidateId
        from that decision's observed candidates. Abstain whenever the role is
        ambiguous, unsupported, hidden, disabled, inert, readonly, or structurally
        unrelated. SEARCH_POPUP_OPENER selects only a visible enabled button-like
        control in the target field group or repeat row. SEARCH_QUERY_INPUT selects
        only a visible writable text/search input in the dialog. SEARCH_SUBMIT selects
        only a visible enabled search submit control in the dialog. CALENDAR_OPENER
        selects only a visible enabled control in the target field group or repeat row.
        Calendar roles use only calendarStructure: YEAR_TRIGGER requires none, YEAR_CONTROL
        requires year-options, MONTH_CONTROL requires month-options, DAY_CONTROL requires day-grid,
        NAVIGATION requires previous or next, and APPLY requires apply. Calendar controls
        must be mechanically activatable and owned by the bounded target surface. Do not
        invent selectors, identifiers, values, actions, code, results, or execution claims.
        The browser performs all DOM actions and verifies every effect locally.
        SEARCH_RESULT_CONTAINER, SEARCH_RESULT_ITEM and SEARCH_RESULT_ACTION classify
        structural shapes shared across the complete result set, never an answer row.
        Use only finite structure evidence. A result action requires mechanical activation
        evidence. Result data is absent; the browser compares it locally after classification.
        """;

    private final OpenAiClient client;

    public OpenAiInteractionDecisionProvider(OpenAiClient client) {
        this.client = client;
    }

    @Override
    public Resolution decide(Batch batch) {
        ProviderOutput output = client.generateInteraction(
            SYSTEM_PROMPT,
            batch,
            ProviderOutput.class
        );
        try {
            List<Result> results = new ArrayList<>();
            output.selections().forEach(selection -> results.add(
                new Selected(
                    selection.decisionId(),
                    selection.role(),
                    selection.candidateId()
                )
            ));
            output.abstentions().forEach(abstention -> results.add(
                new Abstained(abstention.decisionId(), abstention.role())
            ));
            return new Resolution(
                output.schemaVersion(),
                results
            );
        }
        catch (RuntimeException exception) {
            throw new ResolverException(INVALID_RESPONSE_MESSAGE);
        }
    }

    record ProviderOutput(
        int schemaVersion,
        List<Selection> selections,
        List<Abstention> abstentions
    ) {
    }

    record Selection(String decisionId, Role role, String candidateId) {
    }

    record Abstention(String decisionId, Role role) {
    }
}
