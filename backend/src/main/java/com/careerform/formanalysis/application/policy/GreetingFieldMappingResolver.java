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

/** Exact Greeting names, with independently verified profile row metadata. */
public final class GreetingFieldMappingResolver implements FieldMappingResolver {
    private static final Map<String, String> REPEATED_GROUPS = Map.of(
        "educationalBackground.universities", "educationuniversity",
        "educationalBackground.graduateSchools", "educationgraduateschool",
        "workHistory.workExperiences", "careerscareer",
        "languagesCertificationsAndOtherActivity.certifiedLanguageTests", "languageslanguagetest",
        "languagesCertificationsAndOtherActivity.foreignLanguageProficiencies", "languageslanguageskill",
        "languagesCertificationsAndOtherActivity.certificatesLicenses", "certificationscertificate",
        "workHistory.projects", "projectsproject");
    private static final Pattern REPEATED_NAME = Pattern.compile(
        "^(" + REPEATED_GROUPS.keySet().stream().map(Pattern::quote).collect(java.util.stream.Collectors.joining("|"))
            + ")\\.(0|[1-9][0-9]{0,2})\\.(.+)$");
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
        Map<String, Integer> nameCounts = new HashMap<>();
        Map<String, Integer> matchedNames = new HashMap<>();
        for (int index = 0; index < results.size(); index++) {
            if (candidates.get(index).domName() != null)
                nameCounts.merge(candidates.get(index).domName(), 1, Integer::sum);
            if (results.get(index) instanceof Match)
                matchedNames.merge(candidates.get(index).domName(), 1, Integer::sum);
        }
        for (int index = 0; index < results.size(); index++) {
            if (results.get(index) instanceof Match
                && ("basicInformation.englishName".equals(candidates.get(index).domName())
                    ? nameCounts.get(candidates.get(index).domName())
                    : matchedNames.get(candidates.get(index).domName())) > 1)
                results.set(index, new NoMatch(candidates.get(index).candidateId()));
        }
        return new Resolution(request.schemaVersion(), request.snapshotId(), List.copyOf(results));
    }

    private Result resolve(FieldCandidate candidate, String itemGroupId, boolean repeated) {
        String name = candidate.domName();
        if (name == null) return new NoMatch(candidate.candidateId());
        var row = REPEATED_NAME.matcher(name);
        if (row.matches()) {
            String expectedGroup = REPEATED_GROUPS.get(row.group(1));
            int rowIndex = Integer.parseInt(row.group(2));
            if (!validRow(candidate, itemGroupId, expectedGroup, rowIndex, false))
                return new NoMatch(candidate.candidateId());
            name = row.group(1) + ".*." + row.group(3);
        } else if (name.startsWith("educationalBackground.highSchool.")) {
            if (!validRow(candidate, itemGroupId, "educationhighschool", 0, true))
                return new NoMatch(candidate.candidateId());
        } else if (repeated) {
            return new NoMatch(candidate.candidateId());
        }
        String exactName = name;
        var matches = rules.stream().filter(rule -> exactName.equals(rule.structuralName())
            && exactName.equals(rule.requiredDomName())
            && Objects.equals(itemGroupId, rule.requiredItemGroupId())
            && candidate.element() == rule.element() && candidate.control() == rule.control()).toList();
        if (matches.size() != 1) {
            return new NoMatch(candidate.candidateId());
        }
        var rule = matches.getFirst();
        return new Match(candidate.candidateId(), rule.valueBinding(), rule.allowReadonlyWrite());
    }
    private boolean validRow(FieldCandidate candidate, String itemGroupId, String group, int index, boolean singleton) {
        var repeat = candidate.semanticContext() == null ? null : candidate.semanticContext().repeat();
        return group.equals(itemGroupId) && repeat != null && group.equals(repeat.groupId())
            && repeat.rowIndex() != null && repeat.rowIndex() == index && index <= 127
            && repeat.rowCount() != null && repeat.rowCount() > index && repeat.rowCount() <= 128
            && (!singleton || repeat.rowCount() == 1);
    }

}
