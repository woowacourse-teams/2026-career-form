package com.careerform.formanalysis.application.policy;

import java.util.ArrayList;
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
    private final boolean exactTopLevelDomName;

    public StoredPolicyFieldMappingResolver(CompanyFormPolicy policy) {
        this(policy, false);
    }

    public StoredPolicyFieldMappingResolver(
        CompanyFormPolicy policy,
        boolean exactTopLevelDomName
    ) {
        this.exactTopLevelDomName = exactTopLevelDomName;
        constrainedRules = policy.fieldRules().stream()
            .filter(rule -> rule.requiredDomName() != null
                || rule.requiredItemGroupId() != null)
            .toList();
        unconstrainedRules = policy.fieldRules().stream()
            .filter(rule -> rule.requiredDomName() == null
                && rule.requiredItemGroupId() == null)
            .collect(Collectors.toUnmodifiableMap(
                FieldRule::structuralName,
                Function.identity()
            ));
    }

    @Override
    public Resolution resolve(FieldsAnalysisRequest request) {
        List<Result> results = new ArrayList<>();
        for (FieldsAnalysisRequest.Section section : request.sections()) {
            section.fields().forEach(candidate ->
                results.add(resolve(candidate, null, false)));
            if (section.items() == null) continue;
            for (FieldsAnalysisRequest.Item item : section.items()) {
                item.fields().forEach(candidate ->
                    results.add(resolve(candidate, item.itemGroupId(), true)));
            }
        }
        return new Resolution(
            request.schemaVersion(),
            request.snapshotId(),
            List.copyOf(results)
        );
    }

    private Result resolve(
        FieldCandidate candidate,
        String itemGroupId,
        boolean insideRepeatableItem
    ) {
        if (exactTopLevelDomName) {
            if (insideRepeatableItem || candidate.domName() == null) {
                return new NoMatch(candidate.candidateId());
            }
            List<FieldRule> exactRules = constrainedRules.stream()
                .filter(rule -> candidate.domName().equals(rule.structuralName()))
                .filter(rule -> candidate.domName().equals(rule.requiredDomName()))
                .filter(rule -> rule.requiredItemGroupId() == null)
                .toList();
            if (exactRules.size() != 1) {
                return new NoMatch(candidate.candidateId());
            }
            FieldRule exactRule = exactRules.getFirst();
            return exactRule.element() == candidate.element()
                && exactRule.control() == candidate.control()
                ? new Match(candidate.candidateId(), exactRule.valueBinding(),
                    exactRule.allowReadonlyWrite())
                : new NoMatch(candidate.candidateId());
        }
        FieldRule rule = constrainedRule(candidate, itemGroupId);
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

    private FieldRule constrainedRule(
        FieldCandidate candidate,
        String itemGroupId
    ) {
        String baseDomId = baseStructuralName(candidate.domId());
        String domName = candidate.domName();
        List<FieldRule> matches = constrainedRules.stream()
            .filter(rule -> rule.structuralName().equals(baseDomId))
            .filter(rule -> rule.requiredDomName() == null
                || rule.requiredDomName().equals(domName))
            .filter(rule -> rule.requiredItemGroupId() == null
                || rule.requiredItemGroupId().equals(itemGroupId))
            .toList();
        return matches.size() == 1 ? matches.getFirst() : null;
    }

    private boolean matchesAnyConstrainedStructuralName(FieldCandidate candidate) {
        String baseDomId = baseStructuralName(candidate.domId());
        String domName = candidate.domName();
        return constrainedRules.stream().anyMatch(rule ->
            rule.structuralName().equals(baseDomId)
                || rule.requiredDomName() != null
                    && rule.requiredDomName().equals(domName)
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
