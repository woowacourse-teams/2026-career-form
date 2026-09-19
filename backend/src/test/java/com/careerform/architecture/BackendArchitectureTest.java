package com.careerform.architecture;

import java.nio.file.Path;
import java.util.List;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class BackendArchitectureTest {

    private static final Path PROJECT_DIR = Path.of(
            System.getProperty("architecture.projectDir"));
    private static final Path BASELINE =
            PROJECT_DIR.resolve("config/quality/architecture-baseline.json");
    private static final Path EXCEPTIONS =
            PROJECT_DIR.resolve("config/quality/architecture-exceptions.json");

    @Test
    void production_architecture_has_no_unapproved_new_violations() {
        JavaClasses production = new ClassFileImporter()
                .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                .importPackages("com.careerform");
        assertThat(production).as("production classes").isNotEmpty();

        ArchitectureGate gate = new ArchitectureGate();
        List<BackendArchitectureRule> rules = BackendArchitectureRules.all();
        if (Boolean.getBoolean("architecture.baseline.update")) {
            String sourceCommit = System.getProperty("architecture.baseline.sourceCommit");
            ArchitectureGate.writeBaseline(
                    BASELINE,
                    gate.capture(production, rules, sourceCommit));
            return;
        }

        ArchitectureReport report = gate.evaluate(
                production,
                rules,
                ArchitectureGate.readBaseline(BASELINE),
                ArchitectureGate.readExceptions(EXCEPTIONS));
        for (ArchitectureRuleResult result : report.results()) {
            System.out.println(result.ruleId() + "=" + result.status());
        }
        report.assertPassing();
    }
}
