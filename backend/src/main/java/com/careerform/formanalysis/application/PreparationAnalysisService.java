package com.careerform.formanalysis.application;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import com.careerform.formanalysis.application.port.ActionResolver;
import com.careerform.formanalysis.domain.ActionResolution;
import com.careerform.formanalysis.domain.PreparationAnalysis;
import com.careerform.formanalysis.domain.PreparationSnapshot;

public final class PreparationAnalysisService {

    private final Optional<ActionResolver> resolver;
    private final SnapshotValidator snapshotValidator;
    private final ActionResolutionValidator resolutionValidator;

    public PreparationAnalysisService(
        Optional<ActionResolver> resolver,
        SnapshotValidator snapshotValidator,
        ActionResolutionValidator resolutionValidator
    ) {
        this.resolver = resolver;
        this.snapshotValidator = snapshotValidator;
        this.resolutionValidator = resolutionValidator;
    }

    public PreparationAnalysis analyze(PreparationSnapshot snapshot) {
        snapshotValidator.validate(snapshot);
        if (resolver.isEmpty()) {
            return PreparationAnalysis.llmUnavailable(snapshot.snapshotId());
        }
        if (snapshot.actionCandidateIdsInTraversalOrder().isEmpty()) {
            return PreparationAnalysis.complete(snapshot.snapshotId(), List.of());
        }
        try {
            ActionResolution resolution = resolver.orElseThrow().resolve(snapshot);
            resolutionValidator.validate(snapshot, resolution);
            return PreparationAnalysis.complete(
                snapshot.snapshotId(),
                mapPlansInRequestOrder(snapshot, resolution)
            );
        }
        catch (ResolverUnavailableException | InvalidResolverOutputException exception) {
            return PreparationAnalysis.llmUnavailable(snapshot.snapshotId());
        }
    }

    private List<PreparationAnalysis.PreparationPlan> mapPlansInRequestOrder(
        PreparationSnapshot snapshot,
        ActionResolution resolution
    ) {
        Map<String, ActionResolution.Result> byCandidate = new HashMap<>();
        for (ActionResolution.Result result : resolution.results()) {
            byCandidate.put(result.candidateId(), result);
        }
        return snapshot.actionCandidateIdsInTraversalOrder().stream()
            .map(byCandidate::get)
            .filter(result -> !(result instanceof ActionResolution.NoAction))
            .map(PreparationAnalysisService::toPlan)
            .toList();
    }

    private static PreparationAnalysis.PreparationPlan toPlan(
        ActionResolution.Result result
    ) {
        if (result instanceof ActionResolution.RevealAction reveal) {
            return new PreparationAnalysis.RevealSectionPlan(
                reveal.candidateId(),
                PreparationAnalysis.Command.REVEAL_SECTION,
                PreparationAnalysis.ExpectedEffect.TARGET_VISIBLE,
                reveal.targetSectionId()
            );
        }
        ActionResolution.AddAction add = (ActionResolution.AddAction) result;
        return new PreparationAnalysis.AddRepeatableGroupPlan(
            add.candidateId(),
            PreparationAnalysis.Command.ADD_REPEATABLE_GROUP,
            PreparationAnalysis.ExpectedEffect.GROUP_COUNT_INCREMENT
        );
    }
}
