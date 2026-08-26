package com.careerform.formanalysis.infrastructure.llm;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

import com.careerform.formanalysis.domain.FieldsSnapshot;
import com.careerform.formanalysis.domain.FormControl;
import com.careerform.formanalysis.domain.FormElement;

import tools.jackson.core.JsonParser;
import tools.jackson.databind.DeserializationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.annotation.JsonDeserialize;
import tools.jackson.databind.deser.std.StdDeserializer;
import tools.jackson.databind.jsontype.TypeDeserializer;

public final class LlmFieldMappingContract {

    private LlmFieldMappingContract() {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Input(
        int schemaVersion,
        String snapshotId,
        List<Section> sections
    ) {

        public static Input from(FieldsSnapshot snapshot) {
            return new Input(
                snapshot.schemaVersion(),
                snapshot.snapshotId(),
                snapshot.sections().stream().map(Section::from).toList()
            );
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Section(
        String sectionId,
        String parentSectionId,
        String displayName,
        List<Field> fields,
        List<Item> items
    ) {

        private static Section from(FieldsSnapshot.Section section) {
            return new Section(
                section.sectionId(),
                section.parentSectionId(),
                section.displayName(),
                section.fields().stream().map(Field::from).toList(),
                section.items() == null
                    ? null
                    : section.items().stream().map(Item::from).toList()
            );
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Item(String itemId, List<Field> fields) {

        private static Item from(FieldsSnapshot.Item item) {
            return new Item(
                item.itemId(),
                item.fields().stream().map(Field::from).toList()
            );
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Field(
        String candidateId,
        String displayName,
        FormElement element,
        FormControl control,
        List<Option> options
    ) {

        private static Field from(FieldsSnapshot.FieldCandidate field) {
            return new Field(
                field.candidateId(),
                field.displayName(),
                field.element(),
                field.control(),
                field.options() == null
                    ? null
                    : field.options().stream().map(Option::from).toList()
            );
        }
    }

    public record Option(String displayName) {

        private static Option from(FieldsSnapshot.Option option) {
            return new Option(option.displayName());
        }
    }

    public record Output(
        int schemaVersion,
        String snapshotId,
        List<Result> results
    ) {
    }

    @JsonTypeInfo(use = JsonTypeInfo.Id.DEDUCTION)
    @JsonSubTypes({
        @JsonSubTypes.Type(Match.class),
        @JsonSubTypes.Type(NoMatch.class)
    })
    @JsonDeserialize(using = ResultDeserializer.class)
    public sealed interface Result permits Match, NoMatch {
        String candidateId();
    }

    public record Match(
        String candidateId,
        MatchDecision matchType,
        String profileFieldKey
    ) implements Result {
    }

    public record NoMatch(
        String candidateId,
        NoMatchDecision matchType
    ) implements Result {
    }

    public enum MatchDecision {
        MATCH
    }

    public enum NoMatchDecision {
        NO_MATCH
    }

    public static final class ResultDeserializer extends StdDeserializer<Result> {

        public ResultDeserializer() {
            super(Result.class);
        }

        @Override
        public Result deserialize(
            JsonParser parser,
            DeserializationContext context
        ) {
            JsonNode node = context.readTree(parser);
            String decision = requiredText(node, "matchType", context);
            return switch (decision) {
                case "MATCH" -> match(node, context);
                case "NO_MATCH" -> noMatch(node, context);
                default -> context.reportInputMismatch(
                    Result.class,
                    "지원하지 않는 matchType입니다"
                );
            };
        }

        @Override
        public Result deserializeWithType(
            JsonParser parser,
            DeserializationContext context,
            TypeDeserializer typeDeserializer
        ) {
            return deserialize(parser, context);
        }

        private static Match match(
            JsonNode node,
            DeserializationContext context
        ) {
            requireProperties(
                node,
                Set.of("candidateId", "matchType", "profileFieldKey"),
                context
            );
            return new Match(
                requiredText(node, "candidateId", context),
                MatchDecision.MATCH,
                requiredText(node, "profileFieldKey", context)
            );
        }

        private static NoMatch noMatch(
            JsonNode node,
            DeserializationContext context
        ) {
            requireProperties(
                node,
                Set.of("candidateId", "matchType"),
                context
            );
            return new NoMatch(
                requiredText(node, "candidateId", context),
                NoMatchDecision.NO_MATCH
            );
        }

        private static void requireProperties(
            JsonNode node,
            Set<String> expected,
            DeserializationContext context
        ) {
            Set<String> actual = node.properties().stream()
                .map(Map.Entry::getKey)
                .collect(Collectors.toSet());
            if (!actual.equals(expected)) {
                context.reportInputMismatch(
                    Result.class,
                    "field result property 계약이 일치하지 않습니다"
                );
            }
        }

        private static String requiredText(
            JsonNode node,
            String property,
            DeserializationContext context
        ) {
            JsonNode value = node.get(property);
            if (value == null || !value.isString()) {
                return context.reportInputMismatch(
                    Result.class,
                    "%s 문자열이 필요합니다",
                    property
                );
            }
            return value.stringValue();
        }
    }
}
