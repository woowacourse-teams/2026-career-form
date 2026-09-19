package com.careerform.architecture;

import java.util.List;
import java.util.Optional;

import com.careerform.architecture.fixture.invalid.api.InvalidRequest;
import com.careerform.architecture.fixture.invalid.application.InvalidApplicationInput;
import com.careerform.architecture.fixture.valid.application.ValidInput;
import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import org.junit.jupiter.api.Test;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ArchitectureGateTest {

    private static final String SOURCE_COMMIT =
            "8790c7306af7b9b1be46f5457715aba563a27a42";
    private final ArchitectureGate gate = new ArchitectureGate();

    @Test
    void exact_legacy_violation_is_reported_as_baseline_and_passes() {
        JavaClasses classes = invalidClasses();
        BackendArchitectureRule rule = applicationMustNotUseApi();
        List<ArchitectureViolation> known = violations(rule, classes);

        ArchitectureReport report = gate.evaluate(
                classes,
                List.of(rule),
                baseline(known.toArray(ArchitectureViolation[]::new)),
                noExceptions());

        assertThat(report.results()).extracting(ArchitectureRuleResult::status)
                .containsExactly(ArchitectureStatus.BASELINE);
        report.assertPassing();
    }

    @Test
    void new_violation_is_not_hidden_by_an_empty_baseline() {
        ArchitectureReport report = gate.evaluate(
                invalidClasses(),
                List.of(applicationMustNotUseApi()),
                baseline(),
                noExceptions());

        assertThat(report.results()).extracting(ArchitectureRuleResult::status)
                .containsExactly(ArchitectureStatus.VIOLATION);
        assertThatThrownBy(report::assertPassing).isInstanceOf(AssertionError.class);
    }

    @Test
    void removed_violation_requires_baseline_reduction() {
        ArchitectureViolation stale = new ArchitectureViolation("A1", "stale relation");

        ArchitectureReport report = gate.evaluate(
                validClasses(),
                List.of(applicationMustNotUseApi()),
                baseline(stale),
                noExceptions());

        assertThat(report.problems()).anyMatch(problem -> problem.contains("stale relation"));
        assertThatThrownBy(report::assertPassing).isInstanceOf(AssertionError.class);
    }

    @Test
    void exact_approved_exception_is_distinct_from_baseline_and_passes() {
        JavaClasses classes = invalidClasses();
        BackendArchitectureRule rule = applicationMustNotUseApi();
        List<ArchitectureViolation> violations = violations(rule, classes);
        List<ArchitectureExceptionEntry> exceptions = new java.util.ArrayList<>();
        for (int index = 0; index < violations.size(); index++) {
            exceptions.add(validException("EX-" + (index + 1), violations.get(index)));
        }

        ArchitectureReport report = gate.evaluate(
                classes,
                List.of(rule),
                baseline(),
                new ArchitectureExceptions(1, exceptions));

        assertThat(report.results()).extracting(ArchitectureRuleResult::status)
                .containsExactly(ArchitectureStatus.ACCEPTED_EXCEPTION);
        report.assertPassing();
    }

    @Test
    void invalid_exception_metadata_is_rejected() {
        ArchitectureViolation violation = new ArchitectureViolation("A1", "relation");
        ArchitectureExceptionEntry sameReviewer = new ArchitectureExceptionEntry(
                "EX-01", "A1", "relation", "Type.field", "reason", "alternative",
                List.of("ArchitectureGateTest"), "#91", "remove after refactor", "author", "author");
        ArchitectureExceptionEntry wildcard = new ArchitectureExceptionEntry(
                "EX-02", "A1", "relation", "com.careerform.*", "reason", "alternative",
                List.of("ArchitectureGateTest"), "#91", "remove after refactor", "author", "reviewer");
        ArchitectureExceptionEntry blankReason = new ArchitectureExceptionEntry(
                "EX-03", "A1", "relation", "Type.field", "", "alternative",
                List.of("ArchitectureGateTest"), "#91", "remove after refactor", "author", "reviewer");

        for (ArchitectureExceptionEntry invalid : List.of(sameReviewer, wildcard, blankReason)) {
            assertThatThrownBy(() -> new ArchitectureExceptions(1, List.of(invalid)))
                    .isInstanceOf(IllegalArgumentException.class);
        }
        assertThat(violation.ruleId()).isEqualTo("A1");
    }

    @Test
    void unmatched_exception_is_stale_and_fails() {
        ArchitectureExceptionEntry stale = validException(
                "EX-01",
                new ArchitectureViolation("A1", "not an actual relation"));

        ArchitectureReport report = gate.evaluate(
                validClasses(),
                List.of(applicationMustNotUseApi()),
                baseline(),
                new ArchitectureExceptions(1, List.of(stale)));

        assertThat(report.problems()).anyMatch(problem -> problem.contains("EX-01"));
        assertThatThrownBy(report::assertPassing).isInstanceOf(AssertionError.class);
    }

    @Test
    void empty_production_import_is_an_error() {
        JavaClasses empty = validClasses().that(DescribedPredicate.alwaysFalse());

        assertThatThrownBy(() -> gate.evaluate(
                empty,
                List.of(applicationMustNotUseApi()),
                baseline(),
                noExceptions()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("production");
    }

    @Test
    void unexpected_zero_rule_scope_is_an_error() {
        BackendArchitectureRule rule = new BackendArchitectureRule(
                "A0",
                "test",
                JavaClass.Predicates.resideInAnyPackage("..missing.."),
                Optional.empty(),
                noClasses().should().resideInAnyPackage("..missing..").allowEmptyShould(true));

        assertThatThrownBy(() -> gate.evaluate(
                validClasses(),
                List.of(rule),
                baseline(),
                noExceptions()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("A0");
    }

    @Test
    void explained_zero_rule_scope_is_not_applicable_not_pass() {
        BackendArchitectureRule rule = new BackendArchitectureRule(
                "A3",
                "BQ-03, BQ-07",
                JavaClass.Predicates.resideInAnyPackage("..domain.."),
                Optional.of("domain package is optional"),
                noClasses().should().resideInAnyPackage("..domain..").allowEmptyShould(true));

        ArchitectureReport report = gate.evaluate(
                validClasses(),
                List.of(rule),
                baseline(),
                noExceptions());

        assertThat(report.results()).extracting(ArchitectureRuleResult::status)
                .containsExactly(ArchitectureStatus.NOT_APPLICABLE);
        report.assertPassing();
    }

    @Test
    void error_and_not_run_reports_never_pass() {
        for (ArchitectureStatus status : List.of(
                ArchitectureStatus.ERROR,
                ArchitectureStatus.NOT_RUN)) {
            ArchitectureReport report = new ArchitectureReport(
                    List.of(new ArchitectureRuleResult("A1", status, List.of("reason"))),
                    List.of("reason"));

            assertThatThrownBy(report::assertPassing).isInstanceOf(AssertionError.class);
        }
    }

    private static BackendArchitectureRule applicationMustNotUseApi() {
        return new BackendArchitectureRule(
                "A1",
                "BQ-03, BQ-05",
                JavaClass.Predicates.resideInAnyPackage("..application.."),
                Optional.empty(),
                noClasses()
                        .that().resideInAnyPackage("..application..")
                        .should().dependOnClassesThat().resideInAnyPackage("..api..")
                        .allowEmptyShould(true));
    }

    private static List<ArchitectureViolation> violations(
            BackendArchitectureRule rule,
            JavaClasses classes) {
        return rule.rule().evaluate(classes).getFailureReport().getDetails().stream()
                .map(ArchitectureGate::normalize)
                .map(detail -> new ArchitectureViolation(rule.id(), detail))
                .toList();
    }

    private static ArchitectureBaseline baseline(ArchitectureViolation... violations) {
        return new ArchitectureBaseline(1, SOURCE_COMMIT, "1.5.0", List.of(violations));
    }

    private static ArchitectureExceptions noExceptions() {
        return new ArchitectureExceptions(1, List.of());
    }

    private static ArchitectureExceptionEntry validException(
            String id,
            ArchitectureViolation violation) {
        return new ArchitectureExceptionEntry(
                id,
                violation.ruleId(),
                violation.violation(),
                "InvalidApplicationInput.value",
                "현재 API 계약 호환",
                "Application DTO 분리",
                List.of("ArchitectureGateTest"),
                "#91",
                "DTO 리팩터링 완료",
                "author",
                "reviewer");
    }

    private static JavaClasses invalidClasses() {
        return new ClassFileImporter().importClasses(
                InvalidApplicationInput.class,
                InvalidRequest.class);
    }

    private static JavaClasses validClasses() {
        return new ClassFileImporter().importClasses(ValidInput.class);
    }
}
