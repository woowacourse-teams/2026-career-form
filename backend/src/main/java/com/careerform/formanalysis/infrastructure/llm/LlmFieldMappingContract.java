package com.careerform.formanalysis.infrastructure.llm;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

import com.careerform.formanalysis.domain.FieldsSnapshot;
import com.careerform.formanalysis.domain.FormControl;
import com.careerform.formanalysis.domain.FormElement;

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
}
