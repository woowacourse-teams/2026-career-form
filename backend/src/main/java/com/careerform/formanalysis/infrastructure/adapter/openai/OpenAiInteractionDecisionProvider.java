package com.careerform.formanalysis.infrastructure.adapter.openai;

import java.util.ArrayList;
import java.util.List;

import org.springframework.context.annotation.Conditional;
import com.careerform.formanalysis.infrastructure.SelectedOpenAi;
import org.springframework.stereotype.Component;

import com.careerform.formanalysis.application.port.InteractionDecisionProvider;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.Role;
import com.careerform.formanalysis.exception.ResolverException;

@Component
@Conditional(SelectedOpenAi.class)
public final class OpenAiInteractionDecisionProvider
    implements InteractionDecisionProvider {

    private static final String INVALID_RESPONSE_MESSAGE =
        "LLM 동적 판단 응답 계약을 확인할 수 없습니다";
    private static final String SYSTEM_PROMPT = """
        Choose roles from a bounded, de-identified application-form observation.
        Return every decision exactly once, either in selections or abstentions.
        A selection contains only decisionId, the requested role, and one candidateId
        from that decision's observed candidates. Abstain whenever the role is
        ambiguous, unsupported, hidden, disabled, inert, readonly, or structurally
        unrelated. SEARCH_POPUP_OPENER selects only a visible enabled button-like
        control in the target field group or repeat row. SEARCH_QUERY_INPUT selects
        only a visible writable text/search input in the dialog. SEARCH_SUBMIT selects
        only a visible enabled search submit control in the dialog. Do not invent
        selectors, identifiers, values, actions, code, results, or execution claims.
        The browser performs all DOM actions and verifies every effect locally.
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
