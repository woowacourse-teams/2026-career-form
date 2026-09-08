package com.careerform.formanalysis.application.policy;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldRule;
import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FieldCandidate;

public final class StoredPolicyFieldMappingResolver implements FieldMappingResolver {

    private final List<FieldRule> constrainedRules;
    private final Map<String, FieldRule> unconstrainedRules;

    public StoredPolicyFieldMappingResolver(CompanyFormPolicy policy) {
        constrainedRules = policy.fieldRules().stream()
            .filter(rule -> rule.requiredDomName() != null)
            .toList();
        unconstrainedRules = policy.fieldRules().stream()
            .filter(rule -> rule.requiredDomName() == null)
            .collect(Collectors.toUnmodifiableMap(
                FieldRule::structuralName,
                Function.identity()
            ));
    }

    @Override
    public Resolution resolve(FieldsAnalysisRequest request) {
        return new Resolution(
            request.schemaVersion(),
            request.snapshotId(),
            request.fieldCandidatesInTraversalOrder().stream()
                .map(this::resolve)
                .toList()
        );
    }

    private Result resolve(FieldCandidate candidate) {
        FieldRule rule = constrainedRule(candidate);
        if (rule == null && matchesAnyConstrainedStructuralName(candidate)) {
            return new NoMatch(candidate.candidateId());
        }
        if (rule == null) {
            rule = PolicyStructuralMetadata.find(
                unconstrainedRules, candidate.domId(), candidate.domName(), null
            );
        }
        if (rule == null) {
            String structuralName = candidate.domName() != null
                ? candidate.domName()
                : candidate.domId();
            if (structuralName != null) {
                rule = unconstrainedRules.get(baseStructuralName(structuralName));
            }
        }
        if (rule == null
            || rule.element() != candidate.element()
            || rule.control() != candidate.control()) {
            return new NoMatch(candidate.candidateId());
        }
        return new Match(
            candidate.candidateId(),
            rule.valueBinding(),
            rule.allowReadonlyWrite()
        );
    }

    private FieldRule constrainedRule(FieldCandidate candidate) {
        String baseDomId = baseStructuralName(candidate.domId());
        String domName = candidate.domName();
        if (baseDomId == null || domName == null) return null;
        List<FieldRule> matches = constrainedRules.stream()
            .filter(rule -> baseDomId.equals(rule.structuralName()))
            .filter(rule -> domName.equals(rule.requiredDomName()))
            .toList();
        return matches.size() == 1 ? matches.getFirst() : null;
    }

    private boolean matchesAnyConstrainedStructuralName(FieldCandidate candidate) {
        String baseDomId = baseStructuralName(candidate.domId());
        String domName = candidate.domName();
        return constrainedRules.stream().anyMatch(rule ->
            rule.structuralName().equals(baseDomId)
                || rule.requiredDomName().equals(domName)
        );
    }

    private static String baseStructuralName(String value) {
        if (value == null) return null;
        int separator = value.lastIndexOf('_');
        if (separator < 0 || separator == value.length() - 1) return value;
        String suffix = value.substring(separator + 1);
        return (suffix.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
                || suffix.matches("[1-9][0-9]*"))
            ? value.substring(0, separator)
            : value;
    }
}
