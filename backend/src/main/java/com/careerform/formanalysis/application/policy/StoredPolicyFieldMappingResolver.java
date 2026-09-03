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
        if (candidate.domName() == null) {
            return new NoMatch(candidate.candidateId());
        }
        FieldRule rule = rules.get(candidate.domName());
        if (rule == null) {
            rule = rules.get(baseStructuralName(candidate.domName()));
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
        return suffix.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
            ? value.substring(0, separator)
            : value;
    }
}
