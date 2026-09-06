package com.careerform.formanalysis.application.policy;

import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldRule;
import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FieldCandidate;

public final class StoredPolicyFieldMappingResolver implements FieldMappingResolver {

    private final Map<String, FieldRule> rules;

    public StoredPolicyFieldMappingResolver(CompanyFormPolicy policy) {
        rules = policy.fieldRules().stream().collect(Collectors.toUnmodifiableMap(
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
        FieldRule rule = PolicyStructuralMetadata.find(
            rules, candidate.domId(), candidate.domName(), null
        );
        if (rule == null) {
            String structuralName = candidate.domName() != null
                ? candidate.domName()
                : candidate.domId();
            if (structuralName != null) {
                rule = rules.get(baseStructuralName(structuralName));
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

    private static String baseStructuralName(String value) {
        int separator = value.lastIndexOf('_');
        if (separator < 0 || separator == value.length() - 1) return value;
        String suffix = value.substring(separator + 1);
        return (suffix.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
                || suffix.matches("[1-9][0-9]*"))
            ? value.substring(0, separator)
            : value;
    }
}
