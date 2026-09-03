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
        rules = policy.actionRules().stream()
            .flatMap(rule -> rule.structuralNames().stream().map(name -> Map.entry(name, rule)))
            .collect(Collectors.toUnmodifiableMap(Map.Entry::getKey, Map.Entry::getValue));
        structures = policy.preparationFingerprint().actionStructures().stream()
            .flatMap(structure -> structure.structuralNames().stream().map(name -> Map.entry(name, structure)))
            .collect(Collectors.toUnmodifiableMap(Map.Entry::getKey, Map.Entry::getValue));
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
        if (rule == null && candidate.domName() != null) {
            String baseName = baseStructuralName(candidate.domName());
            rule = rules.entrySet().stream()
                .filter(entry -> baseStructuralName(entry.getKey()).equals(baseName))
                .map(Map.Entry::getValue)
                .findFirst()
                .orElse(null);
        }
        ActionStructure structure = PolicyStructuralMetadata.find(
            structures,
            candidate.domId(),
            candidate.domName(),
            candidate.displayName()
        );
        boolean structureMatches = structure != null
            && structure.element() == candidate.element()
            && structure.control() == candidate.control();
        if (!isEligible(candidate) || rule == null || !structureMatches) {
            return new NoAction(candidate.candidateId());
        }
        if (rule.kind() == ActionKind.CHOOSE_RADIO
            && !rule.optionDisplayName().equals(candidate.displayName())) {
            return new NoAction(candidate.candidateId());
        }
        return switch (rule.kind()) {
            case REVEAL -> new RevealAction(candidate.candidateId(), rule.targetSectionId());
            case ADD -> new AddAction(candidate.candidateId(), rule.expectedFieldNames());
            case SELECT_OPTION -> new SelectOptionAction(
                candidate.candidateId(), rule.profileFieldKey(), rule.optionDisplayName(), rule.targetSectionId(),
                rule.expectedFieldNames());
            case CHOOSE_RADIO -> new SelectOptionAction(
                candidate.candidateId(), rule.profileFieldKey(), rule.optionDisplayName(), rule.targetSectionId(),
                rule.expectedFieldNames());
        };
    }

    private static boolean isEligible(ActionCandidate candidate) {
        return (candidate.element() == FormElement.BUTTON
                && candidate.control() == FormControl.BUTTON
            || candidate.element() == FormElement.SELECT
                && candidate.control() == FormControl.SELECT
            || candidate.element() == FormElement.INPUT
                && candidate.control() == FormControl.RADIO)
            && candidate.visibility() == Visibility.VISIBLE
            && !Boolean.TRUE.equals(candidate.disabled())
            && !Boolean.TRUE.equals(candidate.readonly())
            && !Boolean.TRUE.equals(candidate.inert());
    }

    private static String baseStructuralName(String value) {
        int separator = value.lastIndexOf('_');
        if (separator < 0 || separator == value.length() - 1) return value;
        String suffix = value.substring(separator + 1);
        return suffix.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
            ? value.substring(0, separator)
            : value;
    }
}
