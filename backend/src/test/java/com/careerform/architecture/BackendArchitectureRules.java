package com.careerform.architecture;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaField;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.lang.CompositeArchRule;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;

import static com.tngtech.archunit.core.domain.JavaClass.Predicates.resideInAnyPackage;
import static com.tngtech.archunit.core.domain.JavaClass.Predicates.simpleNameEndingWith;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices;

final class BackendArchitectureRules {

    private static final DescribedPredicate<JavaClass> API =
            resideInAnyPackage("..api..").or(
                    resideInAnyPackage("..dto..").and(
                            DescribedPredicate.not(
                                    resideInAnyPackage(
                                            "..application.dto..",
                                            "..infrastructure.."))));
    private static final DescribedPredicate<JavaClass> APPLICATION =
            resideInAnyPackage("..application..");
    private static final DescribedPredicate<JavaClass> DOMAIN =
            resideInAnyPackage("..domain..");
    private static final DescribedPredicate<JavaClass> INFRASTRUCTURE =
            resideInAnyPackage("..infrastructure..");
    private static final Set<String> ALLOWED_DOMAIN_MAPPING_TYPES = Set.of(
            "org.springframework.data.annotation.Id",
            "org.springframework.data.annotation.PersistenceCreator",
            "org.springframework.data.annotation.Transient",
            "org.springframework.data.annotation.TypeAlias",
            "org.springframework.data.annotation.Version",
            "org.springframework.data.mongodb.core.mapping.Document",
            "org.springframework.data.mongodb.core.mapping.Field");

    private BackendArchitectureRules() {
    }

    static List<BackendArchitectureRule> all() {
        return List.of(
                rule("A1", "BQ-03, BQ-05", APPLICATION.or(API), Optional.empty(), dtoBoundaries()),
                rule("A2", "BQ-03, BQ-06", APPLICATION.or(API), Optional.empty(), controllerAndServiceBoundaries()),
                rule(
                        "A3",
                        "BQ-03, BQ-07",
                        DOMAIN,
                        Optional.of("현재 production에 domain 패키지가 없음"),
                        domainBoundary()),
                rule("A4", "BQ-03, BQ-05", APPLICATION.or(INFRASTRUCTURE), Optional.empty(), portAndAdapterBoundaries()),
                rule("A5", "BQ-02, BQ-04", DescribedPredicate.alwaysTrue(), Optional.empty(), cycles()),
                rule("A6", "BQ-05, BQ-14", API.and(simpleNameEndingWith("Response")), Optional.empty(), responseFields()));
    }

    private static BackendArchitectureRule rule(
            String id,
            String standards,
            DescribedPredicate<JavaClass> scope,
            Optional<String> emptyReason,
            ArchRule rule) {
        return new BackendArchitectureRule(id, standards, scope, emptyReason, rule.as(id + " " + standards));
    }

    private static ArchRule dtoBoundaries() {
        ArchRule applicationDoesNotUseApi = classes()
                .that().resideInAnyPackage("..application..")
                .should(new ArchCondition<>("not depend on API-owned types") {
                    @Override
                    public void check(JavaClass origin, ConditionEvents events) {
                        Set<JavaClass> apiTargets = origin.getDirectDependenciesFromSelf().stream()
                                .map(dependency -> dependency.getTargetClass())
                                .filter(API)
                                .map(BackendArchitectureRules::topLevelOwner)
                                .collect(Collectors.toSet());
                        JavaClass originOwner = topLevelOwner(origin);
                        for (JavaClass target : apiTargets) {
                            events.add(SimpleConditionEvent.violated(
                                    origin,
                                    "Class <" + originOwner.getName()
                                            + "> depends on API-owned type <"
                                            + target.getName() + ">"));
                        }
                    }
                })
                .allowEmptyShould(true);
        ArchRule dtoPackagesHaveAnOwner = classes()
                .that().resideInAnyPackage("..dto..")
                .and(JavaClass.Predicates.TOP_LEVEL_CLASSES)
                .should().resideInAnyPackage(
                        "..api.dto..",
                        "..application.dto..",
                        "..infrastructure..")
                .allowEmptyShould(true);

        return CompositeArchRule.of(applicationDoesNotUseApi)
                .and(dtoPackagesHaveAnOwner);
    }

    private static ArchRule controllerAndServiceBoundaries() {
        ArchRule apiDoesNotUseInternalLayers = noClasses()
                .that().resideInAnyPackage("..api..")
                .should().dependOnClassesThat().resideInAnyPackage(
                        "..domain..",
                        "..application.port..",
                        "..infrastructure..")
                .allowEmptyShould(true);
        ArchRule servicesDoNotUseExternalTechnology = noClasses()
                .that().resideInAnyPackage("..application..")
                .and().haveSimpleNameEndingWith("Service")
                .should().dependOnClassesThat().resideInAnyPackage(
                        "..infrastructure..",
                        "org.springframework.web..",
                        "org.springframework.data..",
                        "org.springframework.ai..",
                        "com.openai..")
                .allowEmptyShould(true);

        return CompositeArchRule.of(apiDoesNotUseInternalLayers)
                .and(servicesDoNotUseExternalTechnology);
    }

    private static ArchRule domainBoundary() {
        return classes()
                .that().resideInAnyPackage("..domain..")
                .should(new ArchCondition<>("depend only on allowed outer types") {
                    @Override
                    public void check(JavaClass origin, ConditionEvents events) {
                        origin.getDirectDependenciesFromSelf().stream()
                                .map(dependency -> dependency.getTargetClass())
                                .filter(BackendArchitectureRules::isForbiddenDomainDependency)
                                .forEach(target -> events.add(SimpleConditionEvent.violated(
                                        origin,
                                        "Class <" + origin.getName()
                                                + "> depends on forbidden outer type <"
                                                + target.getName() + ">")));
                    }
                })
                .allowEmptyShould(true);
    }

    private static ArchRule portAndAdapterBoundaries() {
        ArchRule portsDoNotExposeProviders = noClasses()
                .that().resideInAnyPackage("..application.port..")
                .should().dependOnClassesThat().resideInAnyPackage(
                        "..infrastructure..",
                        "org.springframework.ai..",
                        "com.openai..")
                .allowEmptyShould(true);
        ArchRule adaptersDoNotCallServices = noClasses()
                .that().resideInAnyPackage("..infrastructure..")
                .should().dependOnClassesThat(
                        resideInAnyPackage("..application..")
                                .and(simpleNameEndingWith("Service")))
                .allowEmptyShould(true);

        return CompositeArchRule.of(portsDoNotExposeProviders).and(adaptersDoNotCallServices);
    }

    private static ArchRule cycles() {
        ArchRule featureCycles = slices()
                .matching("com.careerform.(*)..")
                .should().beFreeOfCycles()
                .allowEmptyShould(true);
        ArchRule applicationPackageCycles = slices()
                .matching("com.careerform.(*)..application.(*)..")
                .should().beFreeOfCycles()
                .allowEmptyShould(true);

        return CompositeArchRule.of(featureCycles).and(applicationPackageCycles);
    }

    private static ArchRule responseFields() {
        return classes()
                .that(API)
                .and().haveSimpleNameEndingWith("Response")
                .should(new ArchCondition<>("contain only API-owned field types") {
                    @Override
                    public void check(JavaClass response, ConditionEvents events) {
                        for (JavaField field : response.getAllFields()) {
                            for (JavaClass fieldType : field.getAllInvolvedRawTypes()) {
                                if (isInternalType(fieldType)) {
                                    events.add(SimpleConditionEvent.violated(
                                            field,
                                            field.getDescription()
                                                    + " exposes internal type "
                                                    + fieldType.getName()));
                                }
                            }
                        }
                    }
                })
                .allowEmptyShould(true);
    }

    private static boolean isInternalType(JavaClass type) {
        return APPLICATION.test(type) || DOMAIN.test(type) || INFRASTRUCTURE.test(type);
    }

    private static boolean isForbiddenDomainDependency(JavaClass type) {
        boolean outerLayer = API.test(type)
                || APPLICATION.test(type)
                || INFRASTRUCTURE.test(type)
                || type.getPackageName().startsWith("org.springframework.web")
                || type.getPackageName().startsWith("org.springframework.data");
        return outerLayer && !ALLOWED_DOMAIN_MAPPING_TYPES.contains(type.getName());
    }

    private static JavaClass topLevelOwner(JavaClass type) {
        JavaClass current = type;
        while (current.getEnclosingClass().isPresent()) {
            current = current.getEnclosingClass().orElseThrow();
        }
        return current;
    }
}
