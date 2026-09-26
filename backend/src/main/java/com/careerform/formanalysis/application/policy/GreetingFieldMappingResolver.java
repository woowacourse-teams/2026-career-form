package com.careerform.formanalysis.application.policy;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Pattern;

import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldRule;
import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FieldCandidate;

/** Exact Greeting names, with independently verified education row metadata. */
public final class GreetingFieldMappingResolver implements FieldMappingResolver {
    private static final Pattern EDUCATION_NAME = Pattern.compile(
        "^educationalBackground\\.(universities|graduateSchools)\\.(0|[1-9][0-9]{0,2})\\.(.+)$");
    private final List<FieldRule> rules;

    public GreetingFieldMappingResolver(CompanyFormPolicy policy) {
        rules = policy.fieldRules();
    }

    @Override
    public Resolution resolve(FieldsAnalysisRequest request) {
        List<Result> results = new ArrayList<>();
        for (var section : request.sections()) {
            for (var candidate : section.fields()) {
                results.add(resolve(candidate, null, false));
            }
            if (section.items() == null) continue;
            for (var item : section.items()) {
                for (var candidate : item.fields()) {
                    results.add(resolve(candidate, item.itemGroupId(), true));
                }
            }
        }
        var candidates = request.fieldCandidatesInTraversalOrder();
        Map<String, Integer> matchedNames = new HashMap<>();
        for (int index = 0; index < results.size(); index++) {
            if (results.get(index) instanceof Match)
                matchedNames.merge(candidates.get(index).domName(), 1, Integer::sum);
        }
        for (int index = 0; index < results.size(); index++) {
            if (results.get(index) instanceof Match
                && matchedNames.get(candidates.get(index).domName()) > 1)
                results.set(index, new NoMatch(candidates.get(index).candidateId()));
        }
        return new Resolution(request.schemaVersion(), request.snapshotId(), List.copyOf(results));
    }

    private Result resolve(FieldCandidate candidate, String itemGroupId, boolean repeated) {
        String name = candidate.domName();
        if (name == null) return new NoMatch(candidate.candidateId());
        var education = EDUCATION_NAME.matcher(name);
        if (education.matches()) {
            String expectedGroup = education.group(1).equals("universities")
                ? "educationuniversity" : "educationgraduateschool";
            var repeat = candidate.semanticContext() == null ? null : candidate.semanticContext().repeat();
            int rowIndex = Integer.parseInt(education.group(2));
            if (!expectedGroup.equals(itemGroupId) || repeat == null
                || !expectedGroup.equals(repeat.groupId()) || repeat.rowIndex() == null
                || repeat.rowIndex() != rowIndex || repeat.rowCount() == null
                || rowIndex >= repeat.rowCount() || rowIndex > 127) {
                return new NoMatch(candidate.candidateId());
            }
            name = "educationalBackground." + education.group(1) + ".*." + education.group(3);
        } else if (repeated) {
            return new NoMatch(candidate.candidateId());
        }
        String exactName = name;
        var matches = rules.stream().filter(rule -> exactName.equals(rule.structuralName())
            && exactName.equals(rule.requiredDomName())
            && Objects.equals(itemGroupId, rule.requiredItemGroupId())
            && candidate.element() == rule.element() && candidate.control() == rule.control()).toList();
        if (matches.size() != 1) return new NoMatch(candidate.candidateId());
        var rule = matches.getFirst();
        return new Match(candidate.candidateId(), rule.valueBinding(), rule.allowReadonlyWrite());
    }
}
