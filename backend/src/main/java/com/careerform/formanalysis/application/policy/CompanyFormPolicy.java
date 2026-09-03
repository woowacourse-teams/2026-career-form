package com.careerform.formanalysis.application.policy;

import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.function.Predicate;
import java.util.stream.Stream;

import com.careerform.formanalysis.application.port.FieldMappingResolver.DirectBinding;
import com.careerform.formanalysis.application.port.FieldMappingResolver.DerivedBinding;
import com.careerform.formanalysis.application.port.FieldMappingResolver.ValueBinding;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;

public final class CompanyFormPolicy {

    private final String companyKey;
    private final long version;
    private final PreparationFingerprint preparationFingerprint;
    private final FieldsFingerprint fieldsFingerprint;
    private final List<ActionRule> actionRules;
    private final List<FieldRule> fieldRules;

    private CompanyFormPolicy(
        String companyKey,
        long version,
        PreparationFingerprint preparationFingerprint,
        FieldsFingerprint fieldsFingerprint,
        List<ActionRule> actionRules,
        List<FieldRule> fieldRules
    ) {
        this.companyKey = companyKey;
        this.version = version;
        this.preparationFingerprint = preparationFingerprint;
        this.fieldsFingerprint = fieldsFingerprint;
        this.actionRules = List.copyOf(actionRules);
        this.fieldRules = List.copyOf(fieldRules);
    }

    public static CompanyFormPolicy create(
        String companyKey,
        long version,
        PreparationFingerprint preparationFingerprint,
        FieldsFingerprint fieldsFingerprint,
        List<ActionRule> actionRules,
        List<FieldRule> fieldRules,
        Predicate<String> isSupportedProfileKey
    ) {
        requireText(companyKey);
        if (version < 1
            || preparationFingerprint == null
            || fieldsFingerprint == null
            || actionRules == null
            || fieldRules == null
            || isSupportedProfileKey == null) {
            invalidPolicy();
        }
        requireUniqueActionRules(actionRules);
        requireUniqueFieldRules(fieldRules);
        for (ActionRule rule : actionRules) {
            validateActionRule(rule, preparationFingerprint.requiredSectionIds(), isSupportedProfileKey);
        }
        for (FieldRule rule : fieldRules) {
            if (rule == null || !isSupportedBinding(rule.valueBinding(), isSupportedProfileKey)) {
                invalidPolicy();
            }
        }
        return new CompanyFormPolicy(
            companyKey,
            version,
            preparationFingerprint,
            fieldsFingerprint,
            actionRules,
            fieldRules
        );
    }

    public String companyKey() {
        return companyKey;
    }

    public long version() {
        return version;
    }

    public PreparationFingerprint preparationFingerprint() {
        return preparationFingerprint;
    }

    public FieldsFingerprint fieldsFingerprint() {
        return fieldsFingerprint;
    }

    public List<ActionRule> actionRules() {
        return actionRules;
    }

    public List<FieldRule> fieldRules() {
        return fieldRules;
    }

    private static void requireUniqueActionRules(List<ActionRule> rules) {
        Set<String> structuralNames = new HashSet<>();
        for (ActionRule rule : rules) {
            if (rule == null || !structuralNames.add(rule.structuralName())) {
                invalidPolicy();
            }
        }
    }

    private static void requireUniqueFieldRules(List<FieldRule> rules) {
        Set<String> structuralNames = new HashSet<>();
        for (FieldRule rule : rules) {
            if (rule == null || !structuralNames.add(rule.structuralName())) {
                invalidPolicy();
            }
        }
    }

    private static void validateActionRule(
        ActionRule rule,
        Set<String> requiredSectionIds,
        Predicate<String> isSupportedProfileKey
    ) {
        if (rule.kind() == ActionKind.REVEAL
            && (isBlank(rule.targetSectionId())
                || !requiredSectionIds.contains(rule.targetSectionId()))) {
            invalidPolicy();
        }
        if (rule.kind() == ActionKind.ADD && rule.targetSectionId() != null) {
            invalidPolicy();
        }
        if ((rule.kind() == ActionKind.SELECT_OPTION || rule.kind() == ActionKind.CHOOSE_RADIO)
            && (isBlank(rule.profileFieldKey()) || !isSupportedProfileKey.test(rule.profileFieldKey())
                || isBlank(rule.targetSectionId()))) {
            invalidPolicy();
        }
    }

    private static void requireText(String value) {
        if (isBlank(value)) {
            invalidPolicy();
        }
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private static boolean isSupportedBinding(
        ValueBinding binding,
        Predicate<String> isSupportedProfileKey
    ) {
        if (binding instanceof DirectBinding direct) {
            return isSupportedProfileKey.test(direct.profileFieldKey());
        }
        if (binding instanceof DerivedBinding derived) {
            return derived.profileFieldKey() == null
                || isSupportedProfileKey.test(derived.profileFieldKey());
        }
        return false;
    }

    private static void invalidPolicy() {
        throw new IllegalArgumentException("회사 지원서 정책 계약이 올바르지 않습니다");
    }

    public record PreparationFingerprint(
        Set<String> requiredSectionIds,
        List<ActionStructure> requiredActions,
        List<ActionStructure> optionalActions
    ) {

        public PreparationFingerprint {
            if (requiredSectionIds == null
                || requiredSectionIds.isEmpty()
                || requiredActions == null
                || requiredActions.isEmpty()
                || optionalActions == null
                || requiredSectionIds.stream().anyMatch(CompanyFormPolicy::isBlank)
                || requiredActions.stream().anyMatch(Objects::isNull)
                || optionalActions.stream().anyMatch(Objects::isNull)) {
                invalidPolicy();
            }
            requiredSectionIds = Set.copyOf(requiredSectionIds);
            requiredActions = List.copyOf(requiredActions);
            optionalActions = List.copyOf(optionalActions);
            Set<String> structuralNames = new HashSet<>();
            if (Stream.concat(requiredActions.stream(), optionalActions.stream())
                .flatMap(structure -> structure.structuralNames().stream())
                .anyMatch(name -> !structuralNames.add(name))) {
                invalidPolicy();
            }
        }

        public PreparationFingerprint(
            Set<String> requiredSectionIds,
            List<ActionStructure> requiredActions
        ) {
            this(requiredSectionIds, requiredActions, List.of());
        }

        public List<ActionStructure> actionStructures() {
            return Stream.concat(requiredActions.stream(), optionalActions.stream())
                .toList();
        }
    }

    public record FieldsFingerprint(
        Set<String> requiredSectionIds,
        List<FieldStructure> requiredFields
    ) {

        public FieldsFingerprint {
            if (requiredSectionIds == null
                || requiredSectionIds.isEmpty()
                || requiredFields == null
                || requiredFields.isEmpty()
                || requiredSectionIds.stream().anyMatch(CompanyFormPolicy::isBlank)
                || requiredFields.stream().anyMatch(Objects::isNull)) {
                invalidPolicy();
            }
            requiredSectionIds = Set.copyOf(requiredSectionIds);
            requiredFields = List.copyOf(requiredFields);
        }
    }

    public record ActionStructure(
        List<String> structuralNames,
        PreparationAnalysisRequest.FormElement element,
        PreparationAnalysisRequest.FormControl control
    ) {

        public ActionStructure {
            if (structuralNames == null || structuralNames.isEmpty()
                || structuralNames.stream().anyMatch(CompanyFormPolicy::isBlank)
                || structuralNames.stream().distinct().count() != structuralNames.size()) {
                invalidPolicy();
            }
            structuralNames = List.copyOf(structuralNames);
            Objects.requireNonNull(element);
            Objects.requireNonNull(control);
        }

        public ActionStructure(
            String structuralName,
            PreparationAnalysisRequest.FormElement element,
            PreparationAnalysisRequest.FormControl control
        ) {
            this(List.of(structuralName), element, control);
        }

        public String structuralName() {
            return structuralNames.getFirst();
        }
    }

    public record FieldStructure(
        String structuralName,
        FieldsAnalysisRequest.FormElement element,
        FieldsAnalysisRequest.FormControl control
    ) {

        public FieldStructure {
            requireText(structuralName);
            Objects.requireNonNull(element);
            Objects.requireNonNull(control);
        }
    }

    public record ActionRule(
        List<String> structuralNames,
        ActionKind kind,
        String targetSectionId,
        String profileFieldKey,
        String optionDisplayName,
        List<String> expectedFieldNames
    ) {

        public ActionRule {
            if (structuralNames == null || structuralNames.isEmpty()
                || structuralNames.stream().anyMatch(CompanyFormPolicy::isBlank)
                || structuralNames.stream().distinct().count() != structuralNames.size()) {
                invalidPolicy();
            }
            structuralNames = List.copyOf(structuralNames);
            Objects.requireNonNull(kind);
            if (expectedFieldNames != null && (expectedFieldNames.isEmpty()
                || expectedFieldNames.stream().anyMatch(CompanyFormPolicy::isBlank)
                || expectedFieldNames.stream().distinct().count() != expectedFieldNames.size())) {
                invalidPolicy();
            }
        }

        public ActionRule(
            String structuralName, ActionKind kind, String targetSectionId,
            String profileFieldKey, String optionDisplayName, List<String> expectedFieldNames
        ) {
            this(List.of(structuralName), kind, targetSectionId, profileFieldKey, optionDisplayName, expectedFieldNames);
        }

        public ActionRule(List<String> structuralNames, ActionKind kind, String targetSectionId) {
            this(structuralNames, kind, targetSectionId, null, null, null);
        }

        public String structuralName() {
            return structuralNames.getFirst();
        }

        public ActionRule(String structuralName, ActionKind kind, String targetSectionId) {
            this(structuralName, kind, targetSectionId, null, null, null);
        }

        public ActionRule(String structuralName, ActionKind kind, String targetSectionId, String profileFieldKey) {
            this(structuralName, kind, targetSectionId, profileFieldKey, null, null);
        }

        public ActionRule(
            String structuralName, ActionKind kind, String targetSectionId, String profileFieldKey,
            String optionDisplayName
        ) {
            this(structuralName, kind, targetSectionId, profileFieldKey, optionDisplayName, null);
        }
    }

    public record FieldRule(
        String structuralName,
        FieldsAnalysisRequest.FormElement element,
        FieldsAnalysisRequest.FormControl control,
        ValueBinding valueBinding,
        boolean allowReadonlyWrite
    ) {

        public FieldRule(
            String structuralName,
            FieldsAnalysisRequest.FormElement element,
            FieldsAnalysisRequest.FormControl control,
            String profileFieldKey
        ) {
            this(structuralName, element, control, new DirectBinding(profileFieldKey), false);
        }

        public FieldRule(
            String structuralName,
            FieldsAnalysisRequest.FormElement element,
            FieldsAnalysisRequest.FormControl control,
            String profileFieldKey,
            boolean allowReadonlyWrite
        ) {
            this(structuralName, element, control, new DirectBinding(profileFieldKey), allowReadonlyWrite);
        }

        public FieldRule(
            String structuralName,
            FieldsAnalysisRequest.FormElement element,
            FieldsAnalysisRequest.FormControl control,
            ValueBinding valueBinding
        ) {
            this(structuralName, element, control, valueBinding, false);
        }

        public String profileFieldKey() {
            return valueBinding instanceof DirectBinding direct
                ? direct.profileFieldKey()
                : null;
        }

        public FieldRule {
            requireText(structuralName);
            Objects.requireNonNull(element);
            Objects.requireNonNull(control);
            Objects.requireNonNull(valueBinding);
            if (allowReadonlyWrite
                && (element != FieldsAnalysisRequest.FormElement.INPUT
                    || control != FieldsAnalysisRequest.FormControl.TEXT)) {
                invalidPolicy();
            }
        }
    }

    public enum ActionKind {
        REVEAL,
        ADD,
        SELECT_OPTION,
        CHOOSE_RADIO
    }
}
