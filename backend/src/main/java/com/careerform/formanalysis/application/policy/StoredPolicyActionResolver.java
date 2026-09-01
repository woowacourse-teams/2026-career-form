package com.careerform.formanalysis.application.policy;

import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.careerform.formanalysis.application.policy.CompanyFormPolicy.ActionKind;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.ActionRule;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.ActionStructure;
import com.careerform.formanalysis.application.port.ActionResolver;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.ActionCandidate;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.FormControl;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.FormElement;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.Visibility;

public final class StoredPolicyActionResolver implements ActionResolver {

    private final Map<String, ActionRule> rules;
    private final Map<String, ActionStructure> structures;

    public StoredPolicyActionResolver(CompanyFormPolicy policy) {
        rules = policy.actionRules().stream().collect(Collectors.toUnmodifiableMap(
            ActionRule::structuralName,
            Function.identity()
        ));
        structures = policy.preparationFingerprint().requiredActions().stream()
            .collect(Collectors.toUnmodifiableMap(
                ActionStructure::structuralName,
                Function.identity()
            ));
    }

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
        ActionRule rule = PolicyStructuralMetadata.find(
            rules,
            candidate.domId(),
            candidate.domName(),
            candidate.displayName()
        );
        ActionStructure structure = PolicyStructuralMetadata.find(
            structures,
            candidate.domId(),
            candidate.domName(),
            candidate.displayName()
        );
        if (!isEligible(candidate)
            || rule == null
            || structure == null
            || structure.element() != candidate.element()
            || structure.control() != candidate.control()) {
            return new NoAction(candidate.candidateId());
        }
        return switch (rule.kind()) {
            case REVEAL -> new RevealAction(candidate.candidateId(), rule.targetSectionId());
            case ADD -> new AddAction(candidate.candidateId());
            case SELECT_OPTION -> new SelectOptionAction(
                candidate.candidateId(), rule.profileFieldKey(), rule.targetSectionId());
        };
    }

    private static boolean isEligible(ActionCandidate candidate) {
        return (candidate.element() == FormElement.BUTTON
                && candidate.control() == FormControl.BUTTON
            || candidate.element() == FormElement.SELECT
                && candidate.control() == FormControl.SELECT)
            && candidate.visibility() == Visibility.VISIBLE
            && !Boolean.TRUE.equals(candidate.disabled())
            && !Boolean.TRUE.equals(candidate.readonly())
            && !Boolean.TRUE.equals(candidate.inert());
    }
}
