package com.careerform.formanalysis.infrastructure.adapter.sk;

import com.careerform.formanalysis.application.port.ActionResolver;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.ActionCandidate;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.FormControl;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.FormElement;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.Visibility;
import com.careerform.formanalysis.infrastructure.adapter.sk.SkRuleCatalog.ActionKind;
import com.careerform.formanalysis.infrastructure.adapter.sk.SkRuleCatalog.ActionRule;

final class SkActionResolver implements ActionResolver {

    private final SkRuleCatalog catalog = new SkRuleCatalog();

    @Override
    public Resolution resolve(PreparationAnalysisRequest request) {
        return new Resolution(
            request.schemaVersion(),
            request.snapshotId(),
            request.actionCandidatesInTraversalOrder().stream()
                .map(this::resolve)
                .toList()
        );
    }

    private Result resolve(ActionCandidate candidate) {
        if (!isEligible(candidate)) {
            return new NoAction(candidate.candidateId());
        }
        return catalog.actionRule(candidate.domName())
            .map(rule -> toResult(candidate.candidateId(), rule))
            .orElseGet(() -> new NoAction(candidate.candidateId()));
    }

    private static boolean isEligible(ActionCandidate candidate) {
        return candidate.element() == FormElement.BUTTON
            && candidate.control() == FormControl.BUTTON
            && candidate.visibility() == Visibility.VISIBLE
            && !Boolean.TRUE.equals(candidate.disabled())
            && !Boolean.TRUE.equals(candidate.readonly())
            && !Boolean.TRUE.equals(candidate.inert());
    }

    private static Result toResult(String candidateId, ActionRule rule) {
        return rule.kind() == ActionKind.REVEAL
            ? new RevealAction(candidateId, rule.targetSectionId())
            : new AddAction(candidateId);
    }
}
