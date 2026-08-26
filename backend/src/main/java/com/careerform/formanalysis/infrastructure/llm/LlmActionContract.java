package com.careerform.formanalysis.infrastructure.llm;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

import com.careerform.formanalysis.domain.FormControl;
import com.careerform.formanalysis.domain.FormElement;
import com.careerform.formanalysis.domain.PreparationSnapshot;
import com.careerform.formanalysis.domain.Visibility;

import tools.jackson.core.JsonParser;
import tools.jackson.databind.DeserializationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.annotation.JsonDeserialize;
import tools.jackson.databind.deser.std.StdDeserializer;
import tools.jackson.databind.jsontype.TypeDeserializer;

public final class LlmActionContract {

    private LlmActionContract() {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Input(
        int schemaVersion,
        String snapshotId,
        List<Section> sections
    ) {

        public static Input from(PreparationSnapshot snapshot) {
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
        List<ActionCandidate> actionCandidates,
        List<Item> items
    ) {

        private static Section from(PreparationSnapshot.Section section) {
            return new Section(
                section.sectionId(),
                section.parentSectionId(),
                section.displayName(),
                section.actionCandidates().stream()
                    .map(ActionCandidate::from)
                    .toList(),
                section.items() == null
                    ? null
                    : section.items().stream().map(Item::from).toList()
            );
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Item(
        String itemId,
        List<ActionCandidate> actionCandidates
    ) {

        private static Item from(PreparationSnapshot.Item item) {
            return new Item(
                item.itemId(),
                item.actionCandidates().stream()
                    .map(ActionCandidate::from)
                    .toList()
            );
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ActionCandidate(
        String candidateId,
        String displayName,
        FormElement element,
        FormControl control,
        Visibility visibility,
        String domId,
        String domName,
        Boolean disabled,
        Boolean readonly,
        Boolean inert
    ) {

        private static ActionCandidate from(
            PreparationSnapshot.ActionCandidate candidate
        ) {
            return new ActionCandidate(
                candidate.candidateId(),
                candidate.displayName(),
                candidate.element(),
                candidate.control(),
                candidate.visibility(),
                candidate.domId(),
                candidate.domName(),
                candidate.disabled(),
                candidate.readonly(),
                candidate.inert()
            );
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
        @JsonSubTypes.Type(RevealAction.class),
        @JsonSubTypes.Type(AddAction.class),
        @JsonSubTypes.Type(NoAction.class)
    })
    @JsonDeserialize(using = ResultDeserializer.class)
    public sealed interface Result permits RevealAction, AddAction, NoAction {
        String candidateId();
    }

    public record RevealAction(
        String candidateId,
        ActionDecision actionType,
        RevealCommand command,
        RevealEffect expectedEffect,
        String targetSectionId
    ) implements Result {
    }

    public record AddAction(
        String candidateId,
        ActionDecision actionType,
        AddCommand command,
        AddEffect expectedEffect
    ) implements Result {
    }

    public record NoAction(
        String candidateId,
        NoActionDecision actionType
    ) implements Result {
    }

    public enum ActionDecision {
        ACTION
    }

    public enum NoActionDecision {
        NO_ACTION
    }

    public enum RevealCommand {
        REVEAL_SECTION
    }

    public enum AddCommand {
        ADD_REPEATABLE_GROUP
    }

    public enum RevealEffect {
        TARGET_VISIBLE
    }

    public enum AddEffect {
        GROUP_COUNT_INCREMENT
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
            String decision = requiredText(node, "actionType", context);
            if ("NO_ACTION".equals(decision)) {
                return noAction(node, context);
            }
            if (!"ACTION".equals(decision)) {
                return context.reportInputMismatch(
                    Result.class,
                    "지원하지 않는 actionType입니다"
                );
            }
            String command = requiredText(node, "command", context);
            return switch (command) {
                case "REVEAL_SECTION" -> reveal(node, context);
                case "ADD_REPEATABLE_GROUP" -> add(node, context);
                default -> context.reportInputMismatch(
                    Result.class,
                    "지원하지 않는 action command입니다"
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

        private static RevealAction reveal(
            JsonNode node,
            DeserializationContext context
        ) {
            requireProperties(
                node,
                Set.of(
                    "candidateId",
                    "actionType",
                    "command",
                    "expectedEffect",
                    "targetSectionId"
                ),
                context
            );
            String effect = requiredText(node, "expectedEffect", context);
            if (!"TARGET_VISIBLE".equals(effect)) {
                return context.reportInputMismatch(
                    Result.class,
                    "REVEAL_SECTION expectedEffect가 올바르지 않습니다"
                );
            }
            return new RevealAction(
                requiredText(node, "candidateId", context),
                ActionDecision.ACTION,
                RevealCommand.REVEAL_SECTION,
                RevealEffect.TARGET_VISIBLE,
                requiredText(node, "targetSectionId", context)
            );
        }

        private static AddAction add(
            JsonNode node,
            DeserializationContext context
        ) {
            requireProperties(
                node,
                Set.of("candidateId", "actionType", "command", "expectedEffect"),
                context
            );
            String effect = requiredText(node, "expectedEffect", context);
            if (!"GROUP_COUNT_INCREMENT".equals(effect)) {
                return context.reportInputMismatch(
                    Result.class,
                    "ADD_REPEATABLE_GROUP expectedEffect가 올바르지 않습니다"
                );
            }
            return new AddAction(
                requiredText(node, "candidateId", context),
                ActionDecision.ACTION,
                AddCommand.ADD_REPEATABLE_GROUP,
                AddEffect.GROUP_COUNT_INCREMENT
            );
        }

        private static NoAction noAction(
            JsonNode node,
            DeserializationContext context
        ) {
            requireProperties(
                node,
                Set.of("candidateId", "actionType"),
                context
            );
            return new NoAction(
                requiredText(node, "candidateId", context),
                NoActionDecision.NO_ACTION
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
                    "action result property 계약이 일치하지 않습니다"
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
