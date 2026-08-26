package com.careerform.formanalysis.application;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.domain.AutofillPolicy;
import com.careerform.formanalysis.domain.FieldMappingResolution;
import com.careerform.formanalysis.domain.FieldsAnalysis;
import com.careerform.formanalysis.domain.FieldsSnapshot;
import com.careerform.formanalysis.domain.ProfileFieldCatalog;

public final class FieldsAnalysisService {

    private final Optional<FieldMappingResolver> resolver;
    private final SnapshotValidator snapshotValidator;
    private final FieldMappingResolutionValidator resolutionValidator;
    private final FieldInteractionPolicy interactionPolicy;

    public FieldsAnalysisService(
        Optional<FieldMappingResolver> resolver,
        SnapshotValidator snapshotValidator,
        FieldMappingResolutionValidator resolutionValidator,
        FieldInteractionPolicy interactionPolicy
    ) {
        this.resolver = resolver;
        this.snapshotValidator = snapshotValidator;
        this.resolutionValidator = resolutionValidator;
        this.interactionPolicy = interactionPolicy;
    }

    public FieldsAnalysis analyze(FieldsSnapshot snapshot) {
        snapshotValidator.validate(snapshot);
        if (resolver.isEmpty()) {
            return FieldsAnalysis.llmUnavailable(snapshot.snapshotId());
        }
        if (snapshot.fieldCandidateIdsInTraversalOrder().isEmpty()) {
            return FieldsAnalysis.complete(snapshot.snapshotId(), List.of());
        }
        try {
            FieldMappingResolution resolution = resolver.orElseThrow().resolve(snapshot);
            resolutionValidator.validate(snapshot, resolution);
            return FieldsAnalysis.complete(
                snapshot.snapshotId(),
                mapFieldsInRequestOrder(snapshot, resolution)
            );
        }
        catch (ResolverUnavailableException | InvalidResolverOutputException exception) {
            return FieldsAnalysis.llmUnavailable(snapshot.snapshotId());
        }
    }

    private List<FieldsAnalysis.FieldAnalysis> mapFieldsInRequestOrder(
        FieldsSnapshot snapshot,
        FieldMappingResolution resolution
    ) {
        Map<String, FieldMappingResolution.Result> mappings = new HashMap<>();
        for (FieldMappingResolution.Result result : resolution.results()) {
            mappings.put(result.candidateId(), result);
        }
        return snapshot.fieldCandidatesInTraversalOrder().stream()
            .map(candidate -> toAnalysis(candidate, mappings.get(candidate.candidateId())))
            .toList();
    }

    private FieldsAnalysis.FieldAnalysis toAnalysis(
        FieldsSnapshot.FieldCandidate candidate,
        FieldMappingResolution.Result mapping
    ) {
        FieldInteractionPolicy.Decision decision =
            interactionPolicy.evaluate(candidate, mapping);
        if (mapping instanceof FieldMappingResolution.NoMatch) {
            return new FieldsAnalysis.NoMatchFieldAnalysis(
                candidate.candidateId(),
                FieldsAnalysis.MatchType.NO_MATCH,
                FieldsAnalysis.MappingStatus.LLM_SUGGESTED,
                decision.interactionStatus(),
                decision.reasonCodes()
            );
        }
        FieldMappingResolution.Match match = (FieldMappingResolution.Match) mapping;
        AutofillPolicy autofillPolicy = ProfileFieldCatalog
            .policyOf(match.profileFieldKey())
            .orElseThrow();
        return new FieldsAnalysis.MatchedFieldAnalysis(
            candidate.candidateId(),
            FieldsAnalysis.MatchType.MATCH,
            match.profileFieldKey(),
            autofillPolicy,
            FieldsAnalysis.MappingStatus.LLM_SUGGESTED,
            decision.interactionStatus(),
            decision.writePlan()
        );
    }
}
