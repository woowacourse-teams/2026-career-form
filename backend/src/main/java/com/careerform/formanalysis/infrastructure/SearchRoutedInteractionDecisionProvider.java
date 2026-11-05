package com.careerform.formanalysis.infrastructure;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.context.annotation.Conditional;
import org.springframework.stereotype.Component;
import com.careerform.formanalysis.application.port.InteractionDecisionProvider;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.Role;
import com.careerform.formanalysis.exception.ResolverException;
import com.careerform.formanalysis.infrastructure.adapter.jev.JevClient;
import com.careerform.formanalysis.infrastructure.adapter.jev.JevInteractionDecisionProvider;
import com.careerform.formanalysis.infrastructure.adapter.openai.OpenAiClient;
import com.careerform.formanalysis.infrastructure.adapter.openai.OpenAiInteractionDecisionProvider;

@Component
@Conditional(InteractionProviderConditions.Split.class)
public final class SearchRoutedInteractionDecisionProvider implements InteractionDecisionProvider {
    private final AnalysisProviderSelection selection;
    private final Map<String, InteractionDecisionProvider> providers;

    public SearchRoutedInteractionDecisionProvider(AnalysisProviderSelection selection, OpenAiClient openai, JevClient jev) {
        this.selection = selection;
        this.providers = Map.of("openai", new OpenAiInteractionDecisionProvider(openai),
            "jev", new JevInteractionDecisionProvider(jev));
    }

    @Override
    public Resolution decide(Batch batch) {
        Map<String, List<Decision>> groups = new LinkedHashMap<>();
        for (Decision decision : batch.decisions()) {
            groups.computeIfAbsent(providerFor(decision.role()), ignored -> new ArrayList<>()).add(decision);
        }
        Map<String, Result> combined = new LinkedHashMap<>();
        for (var entry : groups.entrySet()) {
            var resolution = providers.get(entry.getKey()).decide(new Batch(batch.schemaVersion(), entry.getValue()));
            if (resolution == null || resolution.schemaVersion() != batch.schemaVersion() || resolution.results() == null
                || resolution.results().size() != entry.getValue().size()) throw invalid();
            for (Result result : resolution.results()) {
                if (result == null || entry.getValue().stream().noneMatch(d -> d.decisionId().equals(result.decisionId())
                    && d.role() == result.role()) || combined.putIfAbsent(result.decisionId(), result) != null) throw invalid();
            }
        }
        return new Resolution(batch.schemaVersion(), batch.decisions().stream().map(d -> combined.get(d.decisionId())).toList());
    }

    private String providerFor(Role role) {
        return switch (role) {
            case SEARCH_POPUP_OPENER, SEARCH_QUERY_INPUT, SEARCH_SUBMIT,
                SEARCH_RESULT_CONTAINER, SEARCH_RESULT_ITEM, SEARCH_RESULT_ACTION -> selection.searchProvider();
            case CALENDAR_OPENER, CALENDAR_YEAR_TRIGGER, CALENDAR_YEAR_CONTROL,
                CALENDAR_MONTH_CONTROL, CALENDAR_DAY_CONTROL, CALENDAR_NAVIGATION,
                CALENDAR_APPLY -> selection.calendarProvider();
        };
    }
    private static ResolverException invalid() {
        return new ResolverException("Invalid routed interaction response");
    }
}
