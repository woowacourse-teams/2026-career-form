package com.careerform.architecture;

import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.StreamSupport;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.tngtech.archunit.core.domain.JavaClasses;

final class ArchitectureGate {

    private static final Pattern SOURCE_LINE = Pattern.compile(":\\d+\\)");
    private static final ObjectMapper JSON = new ObjectMapper()
            .enable(SerializationFeature.INDENT_OUTPUT);

    ArchitectureReport evaluate(
            JavaClasses classes,
            List<BackendArchitectureRule> rules,
            ArchitectureBaseline baseline,
            ArchitectureExceptions exceptions) {
        if (classes.isEmpty()) {
            throw new IllegalStateException("Architecture production import is empty");
        }
        if (rules.isEmpty()) {
            throw new IllegalStateException("Architecture rules are empty");
        }

        Set<ArchitectureViolation> baselineViolations = Set.copyOf(baseline.violations());
        Set<ArchitectureViolation> exceptionViolations = exceptions.asViolations();
        Set<ArchitectureViolation> actualViolations = new LinkedHashSet<>();
        List<ArchitectureRuleResult> results = new ArrayList<>();
        List<String> problems = new ArrayList<>();

        Set<String> ruleIds = new HashSet<>();
        for (BackendArchitectureRule rule : rules) {
            if (!ruleIds.add(rule.id())) {
                throw new IllegalArgumentException("Duplicate architecture rule: " + rule.id());
            }
            long targetCount = StreamSupport.stream(classes.spliterator(), false)
                    .filter(rule.scope())
                    .count();
            if (targetCount == 0) {
                if (rule.emptyReason().isEmpty()) {
                    throw new IllegalStateException(
                            "Architecture rule " + rule.id() + " has zero targets");
                }
                results.add(new ArchitectureRuleResult(
                        rule.id(),
                        ArchitectureStatus.NOT_APPLICABLE,
                        List.of(rule.emptyReason().orElseThrow())));
                continue;
            }

            List<ArchitectureViolation> actual = violations(rule, classes);
            actualViolations.addAll(actual);
            List<ArchitectureViolation> newViolations = actual.stream()
                    .filter(violation -> !baselineViolations.contains(violation))
                    .filter(violation -> !exceptionViolations.contains(violation))
                    .toList();
            List<String> details = actual.stream()
                    .map(ArchitectureViolation::violation)
                    .toList();

            ArchitectureStatus status = status(
                    actual,
                    newViolations,
                    baselineViolations,
                    exceptionViolations);
            results.add(new ArchitectureRuleResult(rule.id(), status, details));
            for (ArchitectureViolation violation : newViolations) {
                problems.add("New architecture violation " + violation.ruleId()
                        + ": " + violation.violation());
            }
        }

        for (ArchitectureViolation known : baselineViolations) {
            if (!actualViolations.contains(known)) {
                problems.add("Stale architecture baseline " + known.ruleId()
                        + ": " + known.violation());
            }
        }
        for (ArchitectureExceptionEntry exception : exceptions.exceptions()) {
            if (!actualViolations.contains(exception.asViolation())) {
                problems.add("Stale architecture exception " + exception.id()
                        + ": " + exception.violation());
            }
        }
        for (ArchitectureViolation violation : baselineViolations) {
            if (exceptionViolations.contains(violation)) {
                problems.add("Violation appears in baseline and exceptions: " + violation);
            }
        }

        return new ArchitectureReport(List.copyOf(results), List.copyOf(problems));
    }

    ArchitectureBaseline capture(
            JavaClasses classes,
            List<BackendArchitectureRule> rules,
            String sourceCommit) {
        if (classes.isEmpty()) {
            throw new IllegalStateException("Architecture production import is empty");
        }
        List<ArchitectureViolation> violations = rules.stream()
                .flatMap(rule -> violations(rule, classes).stream())
                .sorted()
                .toList();
        return new ArchitectureBaseline(1, sourceCommit, "1.5.0", violations);
    }

    static ArchitectureBaseline readBaseline(Path path) {
        return read(path, ArchitectureBaseline.class);
    }

    static ArchitectureExceptions readExceptions(Path path) {
        return read(path, ArchitectureExceptions.class);
    }

    static void writeBaseline(Path path, ArchitectureBaseline baseline) {
        try {
            JSON.writeValue(path.toFile(), baseline);
        } catch (IOException error) {
            throw new IllegalStateException("Cannot write architecture baseline " + path, error);
        }
    }

    static String normalize(String detail) {
        return SOURCE_LINE.matcher(detail).replaceAll(":*)");
    }

    private static <T> T read(Path path, Class<T> type) {
        try {
            return JSON.readValue(path.toFile(), type);
        } catch (IOException error) {
            throw new IllegalStateException("Cannot read architecture registry " + path, error);
        }
    }

    private static List<ArchitectureViolation> violations(
            BackendArchitectureRule rule,
            JavaClasses classes) {
        return rule.rule().evaluate(classes).getFailureReport().getDetails().stream()
                .map(ArchitectureGate::normalize)
                .map(detail -> new ArchitectureViolation(rule.id(), detail))
                .distinct()
                .sorted()
                .toList();
    }

    private static ArchitectureStatus status(
            List<ArchitectureViolation> actual,
            List<ArchitectureViolation> newViolations,
            Set<ArchitectureViolation> baseline,
            Set<ArchitectureViolation> exceptions) {
        if (!newViolations.isEmpty()) {
            return ArchitectureStatus.VIOLATION;
        }
        if (actual.stream().anyMatch(exceptions::contains)) {
            return ArchitectureStatus.ACCEPTED_EXCEPTION;
        }
        if (actual.stream().anyMatch(baseline::contains)) {
            return ArchitectureStatus.BASELINE;
        }
        return ArchitectureStatus.PASS;
    }
}

record ArchitectureViolation(String ruleId, String violation)
        implements Comparable<ArchitectureViolation> {

    ArchitectureViolation {
        requireText(ruleId, "ruleId");
        requireText(violation, "violation");
    }

    @Override
    public int compareTo(ArchitectureViolation other) {
        int byRule = ruleId.compareTo(other.ruleId);
        return byRule != 0 ? byRule : violation.compareTo(other.violation);
    }

    static void requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " must not be blank");
        }
    }
}

record ArchitectureBaseline(
        int schemaVersion,
        String sourceCommit,
        String archUnitVersion,
        List<ArchitectureViolation> violations) {

    ArchitectureBaseline {
        if (schemaVersion != 1) {
            throw new IllegalArgumentException("Unsupported baseline schema version");
        }
        if (sourceCommit == null || !sourceCommit.matches("[0-9a-f]{40}")) {
            throw new IllegalArgumentException("sourceCommit must be a full Git SHA");
        }
        ArchitectureViolation.requireText(archUnitVersion, "archUnitVersion");
        violations = List.copyOf(violations);
        if (new HashSet<>(violations).size() != violations.size()) {
            throw new IllegalArgumentException("Duplicate baseline violations");
        }
    }
}

record ArchitectureExceptionEntry(
        String id,
        String ruleId,
        String violation,
        String target,
        String reason,
        String alternative,
        List<String> compensatingTests,
        String issue,
        String exitCondition,
        String author,
        String reviewer) {

    ArchitectureExceptionEntry {
        compensatingTests = List.copyOf(compensatingTests);
    }

    ArchitectureViolation asViolation() {
        return new ArchitectureViolation(ruleId, violation);
    }
}

record ArchitectureExceptions(int schemaVersion, List<ArchitectureExceptionEntry> exceptions) {

    ArchitectureExceptions {
        if (schemaVersion != 1) {
            throw new IllegalArgumentException("Unsupported exception schema version");
        }
        exceptions = List.copyOf(exceptions);
        Set<String> ids = new HashSet<>();
        Set<ArchitectureViolation> violations = new HashSet<>();
        for (ArchitectureExceptionEntry exception : exceptions) {
            validate(exception);
            if (!ids.add(exception.id())) {
                throw new IllegalArgumentException("Duplicate exception id: " + exception.id());
            }
            if (!violations.add(exception.asViolation())) {
                throw new IllegalArgumentException(
                        "Duplicate exception violation: " + exception.asViolation());
            }
        }
    }

    Set<ArchitectureViolation> asViolations() {
        Set<ArchitectureViolation> result = new HashSet<>();
        for (ArchitectureExceptionEntry exception : exceptions) {
            result.add(exception.asViolation());
        }
        return Set.copyOf(result);
    }

    private static void validate(ArchitectureExceptionEntry exception) {
        ArchitectureViolation.requireText(exception.id(), "id");
        ArchitectureViolation.requireText(exception.ruleId(), "ruleId");
        ArchitectureViolation.requireText(exception.violation(), "violation");
        ArchitectureViolation.requireText(exception.target(), "target");
        ArchitectureViolation.requireText(exception.reason(), "reason");
        ArchitectureViolation.requireText(exception.alternative(), "alternative");
        ArchitectureViolation.requireText(exception.issue(), "issue");
        ArchitectureViolation.requireText(exception.exitCondition(), "exitCondition");
        ArchitectureViolation.requireText(exception.author(), "author");
        ArchitectureViolation.requireText(exception.reviewer(), "reviewer");
        if (exception.compensatingTests().isEmpty()
                || exception.compensatingTests().stream().anyMatch(String::isBlank)) {
            throw new IllegalArgumentException("compensatingTests must not be empty");
        }
        if (exception.target().contains("*") || exception.target().contains("..")) {
            throw new IllegalArgumentException("Exception target must be exact");
        }
        if (exception.author().equals(exception.reviewer())) {
            throw new IllegalArgumentException("Exception reviewer must differ from author");
        }
    }
}

enum ArchitectureStatus {
    PASS,
    VIOLATION,
    NOT_APPLICABLE,
    NOT_RUN,
    ERROR,
    BASELINE,
    ACCEPTED_EXCEPTION
}

record ArchitectureRuleResult(
        String ruleId,
        ArchitectureStatus status,
        List<String> details) {

    ArchitectureRuleResult {
        details = List.copyOf(details);
    }
}

record ArchitectureReport(
        List<ArchitectureRuleResult> results,
        List<String> problems) {

    ArchitectureReport {
        results = List.copyOf(results);
        problems = List.copyOf(problems);
    }

    void assertPassing() {
        boolean incomplete = results.stream().anyMatch(result ->
                result.status() == ArchitectureStatus.VIOLATION
                        || result.status() == ArchitectureStatus.ERROR
                        || result.status() == ArchitectureStatus.NOT_RUN);
        if (incomplete || !problems.isEmpty()) {
            throw new AssertionError(String.join(System.lineSeparator(), problems));
        }
    }
}
