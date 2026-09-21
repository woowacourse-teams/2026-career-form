package com.careerform.formanalysis.infrastructure.adapter.openai;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.ai.util.JacksonUtils;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FieldCandidate;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Item;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Option;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Section;
import com.careerform.formanalysis.exception.ResolverException;

import tools.jackson.databind.node.ObjectNode;
import tools.jackson.databind.node.ArrayNode;

@Component
@ConditionalOnProperty(
    prefix = "career-form.llm",
    name = "enabled",
    havingValue = "true"
)
public final class OpenAiFieldMappingResolver implements FieldMappingResolver {

    private static final String INVALID_RESPONSE_MESSAGE =
        "LLM 분석 응답 계약을 확인할 수 없습니다";
    private static final String SYSTEM_PROMPT = """
        Map de-identified application-form field metadata using schemaVersion 2.
        Return only confident canonical mappings in the required matches array.
        Each match contains only candidateId and valueBinding. A DIRECT binding contains
        one profileFieldKey; a DERIVED binding contains one approved recipe. Omit candidates when
        the display metadata is insufficient; the Backend will treat omissions as no match.
        The only provider-approved DERIVED recipes are KOREAN_FULL_NAME,
        ENGLISH_FULL_NAME_GIVEN_FIRST, and ENGLISH_FULL_NAME_FAMILY_FIRST. Use them only for an
        explicit combined full-name target. Never map a full-name target to a single family-name
        or given-name key. Do not return LOOKUP or BUTTON_OPTION bindings.
        Use only a profileFieldKey allowed by the response schema. Do not infer or return
        field values, confidence, autofill policy, interaction state, or write plans.
        Allowed canonical profile keys:
        %s
        Canonical meanings and confusion boundaries:
        %s
        """;

    private final OpenAiClient client;
    private final SupportedProfileFields supportedProfileFields;

    public OpenAiFieldMappingResolver(
        OpenAiClient client,
        SupportedProfileFields supportedProfileFields
    ) {
        this.client = client;
        this.supportedProfileFields = supportedProfileFields;
    }

    @Override
    public Resolution resolve(FieldsAnalysisRequest request) {
        FieldInput input = FieldInput.from(request);
        Map<String, ProviderEvidence> evidenceByCandidate =
            ProviderEvidence.index(input);
        FieldOutput output = client.generate(
            SYSTEM_PROMPT.formatted(
                supportedProfileFields.promptCatalog(),
                supportedProfileFields.promptGuidance()
            ),
            input,
            FieldOutput.class,
            this::withSupportedProfileFieldKeyEnum
        );
        try {
            validateProviderCandidates(request, output);
            List<Result> results = new ArrayList<>();
            Set<String> matchedCandidateIds = new HashSet<>();
            output.matches().forEach(match -> {
                if (ProviderEvidence.conflicts(
                    match.valueBinding(),
                    evidenceByCandidate.get(match.candidateId())
                )) {
                    return;
                }
                results.add(new Match(
                    match.candidateId(),
                    toApplicationBinding(match.valueBinding())
                ));
                matchedCandidateIds.add(match.candidateId());
            });
            request.fieldCandidatesInTraversalOrder().stream()
                .map(FieldCandidate::candidateId)
                .filter(candidateId -> !matchedCandidateIds.contains(candidateId))
                .map(NoMatch::new)
                .forEach(results::add);
            return new Resolution(
                output.schemaVersion(),
                output.snapshotId(),
                List.copyOf(results)
            );
        }
        catch (RuntimeException exception) {
            throw new ResolverException(INVALID_RESPONSE_MESSAGE);
        }
    }

    private static void validateProviderCandidates(
        FieldsAnalysisRequest request,
        FieldOutput output
    ) {
        Set<String> requestCandidateIds = new HashSet<>(
            request.fieldCandidateIdsInTraversalOrder()
        );
        Set<String> providerCandidateIds = new HashSet<>();
        if (output.matches() == null) {
            throw new ResolverException(INVALID_RESPONSE_MESSAGE);
        }
        for (MatchOutput match : output.matches()) {
            if (match == null
                || match.candidateId() == null
                || match.candidateId().isBlank()
                || !requestCandidateIds.contains(match.candidateId())
                || !providerCandidateIds.add(match.candidateId())) {
                throw new ResolverException(INVALID_RESPONSE_MESSAGE);
            }
        }
    }

    private static FieldMappingResolver.ValueBinding toApplicationBinding(
        ProviderValueBinding binding
    ) {
        if (binding instanceof ProviderDirectBinding direct) {
            return new FieldMappingResolver.DirectBinding(
                direct.profileFieldKey()
            );
        }
        if (binding instanceof ProviderDerivedBinding derived) {
            FieldMappingResolver.DerivedRecipe recipe = switch (derived.recipe()) {
                case KOREAN_FULL_NAME ->
                    FieldMappingResolver.DerivedRecipe.KOREAN_FULL_NAME;
                case ENGLISH_FULL_NAME_GIVEN_FIRST ->
                    FieldMappingResolver.DerivedRecipe.ENGLISH_FULL_NAME_GIVEN_FIRST;
                case ENGLISH_FULL_NAME_FAMILY_FIRST ->
                    FieldMappingResolver.DerivedRecipe.ENGLISH_FULL_NAME_FAMILY_FIRST;
            };
            return new FieldMappingResolver.DerivedBinding(recipe);
        }
        throw new ResolverException(INVALID_RESPONSE_MESSAGE);
    }

    private String withSupportedProfileFieldKeyEnum(String schema) {
        ObjectNode root = (ObjectNode) JacksonUtils.getDefaultJsonMapper()
            .readTree(schema);
        ObjectNode directBinding = (ObjectNode) root.at(
            "/properties/matches/items/properties/valueBinding/anyOf/0/properties/profileFieldKey"
        );
        ArrayNode enumValues = directBinding.putArray("enum");
        supportedProfileFields.keys().forEach(enumValues::add);
        ObjectNode derivedRecipe = (ObjectNode) root.at(
            "/properties/matches/items/properties/valueBinding/anyOf/1/properties/recipe"
        );
        ArrayNode recipes = derivedRecipe.putArray("enum");
        recipes.add("KOREAN_FULL_NAME");
        recipes.add("ENGLISH_FULL_NAME_GIVEN_FIRST");
        recipes.add("ENGLISH_FULL_NAME_FAMILY_FIRST");
        normalizeDiscriminator(root, 0, "DIRECT");
        normalizeDiscriminator(root, 1, "DERIVED");
        return root.toString();
    }

    private static void normalizeDiscriminator(
        ObjectNode root,
        int variantIndex,
        String value
    ) {
        ObjectNode discriminator = (ObjectNode) root.at(
            "/properties/matches/items/properties/valueBinding/anyOf/"
                + variantIndex
                + "/properties/type"
        );
        discriminator.remove("const");
        discriminator.put("type", "string");
        discriminator.putArray("enum").add(value);
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record FieldInput(
        int schemaVersion,
        String snapshotId,
        List<FieldSection> sections
    ) {

        static FieldInput from(FieldsAnalysisRequest request) {
            RepeatGroupAliases repeatGroups = new RepeatGroupAliases();
            return new FieldInput(
                request.schemaVersion(),
                request.snapshotId(),
                request.sections().stream()
                    .map(section -> FieldSection.from(section, repeatGroups))
                    .toList()
            );
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record FieldSection(
        String sectionId,
        String parentSectionId,
        String displayName,
        List<FieldCandidateInput> fields,
        List<FieldItem> items
    ) {

        static FieldSection from(
            Section section,
            RepeatGroupAliases repeatGroups
        ) {
            return new FieldSection(
                section.sectionId(),
                section.parentSectionId(),
                ProviderSemanticSanitizer.sanitize(section.displayName()),
                section.fields().stream()
                    .map(field -> FieldCandidateInput.from(field, repeatGroups))
                    .toList(),
                section.items() == null
                    ? null
                    : section.items().stream()
                        .map(item -> FieldItem.from(item, repeatGroups))
                        .toList()
            );
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record FieldItem(
        String itemId,
        String itemGroupId,
        List<FieldCandidateInput> fields
    ) {

        static FieldItem from(Item item, RepeatGroupAliases repeatGroups) {
            return new FieldItem(
                item.itemId(),
                repeatGroups.alias(item.itemGroupId()),
                item.fields().stream()
                    .map(field -> FieldCandidateInput.from(field, repeatGroups))
                    .toList()
            );
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record FieldCandidateInput(
        String candidateId,
        String displayName,
        FieldsAnalysisRequest.FormElement element,
        FieldsAnalysisRequest.FormControl control,
        FieldsAnalysisRequest.Visibility visibility,
        Boolean disabled,
        Boolean readonly,
        Boolean inert,
        FieldSemanticContext semanticContext,
        List<FieldOption> options
    ) {

        static FieldCandidateInput from(
            FieldCandidate field,
            RepeatGroupAliases repeatGroups
        ) {
            return new FieldCandidateInput(
                field.candidateId(),
                ProviderSemanticSanitizer.sanitize(field.displayName()),
                field.element(),
                field.control(),
                field.visibility(),
                trueOnly(field.disabled()),
                trueOnly(field.readonly()),
                trueOnly(field.inert()),
                FieldSemanticContext.from(field, repeatGroups),
                field.options() == null
                    ? null
                    : field.options().stream()
                        .map(FieldOption::from)
                        .filter(option -> option.displayName() != null)
                        .limit(128)
                        .toList()
            );
        }

        private static Boolean trueOnly(Boolean state) {
            return Boolean.TRUE.equals(state) ? Boolean.TRUE : null;
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record FieldSemanticContext(
        List<ProviderSemanticSanitizer.SafeLabel> labels,
        FieldsAnalysisRequest.InputType inputType,
        FieldsAnalysisRequest.InputMode inputMode,
        FieldsAnalysisRequest.Autocomplete autocomplete,
        Boolean required,
        Boolean multiple,
        Integer maxLength,
        RepeatContext repeat
    ) {

        static FieldSemanticContext from(
            FieldCandidate field,
            RepeatGroupAliases repeatGroups
        ) {
            FieldsAnalysisRequest.SemanticContext context = field.semanticContext();
            Set<ProviderSemanticSanitizer.SafeLabel> labels = new LinkedHashSet<>();
            String legacyDisplayName = ProviderSemanticSanitizer.sanitize(
                field.displayName()
            );
            if (legacyDisplayName != null) {
                labels.add(new ProviderSemanticSanitizer.SafeLabel(
                    "label", legacyDisplayName
                ));
            }
            String legacyPlaceholder = ProviderSemanticSanitizer.sanitize(
                field.placeholder()
            );
            if (legacyPlaceholder != null) {
                labels.add(new ProviderSemanticSanitizer.SafeLabel(
                    "placeholder", legacyPlaceholder
                ));
            }
            if (context != null) {
                List<ProviderSemanticSanitizer.SafeLabel> safe =
                    ProviderSemanticSanitizer.sanitizeFields(context.labels());
                if (safe != null) {
                    labels.addAll(safe);
                }
            }
            List<ProviderSemanticSanitizer.SafeLabel> safeLabels = labels.isEmpty()
                ? null
                : List.copyOf(labels);
            if (context == null) {
                return safeLabels == null ? null : new FieldSemanticContext(
                    safeLabels, null, null, null, null, null, null, null
                );
            }
            FieldsAnalysisRequest.RepeatContext repeat = context.repeat();
            return new FieldSemanticContext(
                safeLabels,
                context.inputType(),
                context.inputMode(),
                context.autocomplete(),
                trueOnly(context.required()),
                trueOnly(context.multiple()),
                context.maxLength(),
                repeat == null ? null : new RepeatContext(
                    repeatGroups.alias(repeat.groupId()),
                    repeat.rowIndex(),
                    repeat.rowCount()
                )
            );
        }

        private static Boolean trueOnly(Boolean state) {
            return Boolean.TRUE.equals(state) ? Boolean.TRUE : null;
        }
    }

    record RepeatContext(String groupId, int rowIndex, int rowCount) {
    }

    private record ProviderEvidence(
        boolean addressLine1,
        boolean addressLine2,
        boolean unsupportedActivity
    ) {

        private static final Set<String> STRUCTURAL_SOURCES = Set.of(
            "legend",
            "section-heading"
        );

        static Map<String, ProviderEvidence> index(FieldInput input) {
            Map<String, ProviderEvidence> evidence = new LinkedHashMap<>();
            input.sections().forEach(section -> {
                section.fields().forEach(field -> evidence.put(
                    field.candidateId(),
                    from(section, field)
                ));
                if (section.items() != null) {
                    section.items().stream()
                        .flatMap(item -> item.fields().stream())
                        .forEach(field -> evidence.put(
                            field.candidateId(),
                            from(section, field)
                        ));
                }
            });
            return evidence;
        }

        static boolean conflicts(
            ProviderValueBinding binding,
            ProviderEvidence evidence
        ) {
            if (!(binding instanceof ProviderDirectBinding direct)
                || evidence == null) {
                return false;
            }
            String key = direct.profileFieldKey();
            if ("contact.contact.addressLine1".equals(key)
                && evidence.addressLine2()) {
                return true;
            }
            if ("contact.contact.addressLine2".equals(key)
                && evidence.addressLine1()) {
                return true;
            }
            return key != null
                && key.startsWith("projects.project.")
                && evidence.unsupportedActivity();
        }

        private static ProviderEvidence from(
            FieldSection section,
            FieldCandidateInput field
        ) {
            List<ProviderSemanticSanitizer.SafeLabel> labels =
                field.semanticContext() == null
                    ? null
                    : field.semanticContext().labels();
            StringBuilder all = new StringBuilder();
            append(all, field.displayName());
            if (labels != null) {
                labels.forEach(label -> append(all, label.text()));
            }

            StringBuilder structural = new StringBuilder();
            if (labels != null) {
                labels.stream()
                    .filter(label -> STRUCTURAL_SOURCES.contains(label.source()))
                    .forEach(label -> append(structural, label.text()));
            }
            if (structural.isEmpty()) {
                append(structural, section.displayName());
            }
            return new ProviderEvidence(
                contains(all, "address line 1"),
                contains(all, "address line 2"),
                contains(structural, "unsupported volunteer activity")
                    || contains(structural, "unsupported extracurricular activity")
                    || contains(structural, "unsupported award history")
                    || contains(structural, "unsupported overseas experience")
            );
        }

        private static void append(StringBuilder target, String value) {
            if (value != null) {
                target.append(';').append(value);
            }
        }

        private static boolean contains(
            CharSequence evidence,
            String canonicalTerm
        ) {
            return evidence.toString().contains(canonicalTerm);
        }
    }

    record FieldOption(String displayName) {

        static FieldOption from(Option option) {
            return new FieldOption(
                ProviderSemanticSanitizer.sanitize(option.displayName())
            );
        }
    }

    private static final class RepeatGroupAliases {

        private final Map<String, String> aliases = new LinkedHashMap<>();

        private String alias(String groupId) {
            if (groupId == null) {
                return null;
            }
            return aliases.computeIfAbsent(
                groupId,
                ignored -> "repeat-group-" + (aliases.size() + 1)
            );
        }
    }

    record FieldOutput(
        int schemaVersion,
        String snapshotId,
        List<MatchOutput> matches
    ) {
    }

    record MatchOutput(String candidateId, ProviderValueBinding valueBinding) {
    }

    @JsonTypeInfo(
        use = JsonTypeInfo.Id.NAME,
        include = JsonTypeInfo.As.PROPERTY,
        property = "type"
    )
    @JsonSubTypes({
        @JsonSubTypes.Type(value = ProviderDirectBinding.class, name = "DIRECT"),
        @JsonSubTypes.Type(value = ProviderDerivedBinding.class, name = "DERIVED")
    })
    sealed interface ProviderValueBinding permits
        ProviderDirectBinding, ProviderDerivedBinding {
    }

    record ProviderDirectBinding(String profileFieldKey)
        implements ProviderValueBinding {
    }

    record ProviderDerivedBinding(ProviderDerivedRecipe recipe)
        implements ProviderValueBinding {
    }

    enum ProviderDerivedRecipe {
        KOREAN_FULL_NAME,
        ENGLISH_FULL_NAME_GIVEN_FIRST,
        ENGLISH_FULL_NAME_FAMILY_FIRST
    }
}
