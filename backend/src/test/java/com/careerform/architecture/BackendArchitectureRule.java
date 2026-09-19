package com.careerform.architecture;

import java.util.Optional;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.lang.ArchRule;

record BackendArchitectureRule(
        String id,
        String standards,
        DescribedPredicate<JavaClass> scope,
        Optional<String> emptyReason,
        ArchRule rule) {

    BackendArchitectureRule {
        if (id.isBlank() || standards.isBlank()) {
            throw new IllegalArgumentException("Architecture rule metadata must not be blank");
        }
    }
}
