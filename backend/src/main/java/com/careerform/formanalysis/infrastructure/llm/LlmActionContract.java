package com.careerform.formanalysis.infrastructure.llm;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

import com.careerform.formanalysis.domain.FormControl;
import com.careerform.formanalysis.domain.FormElement;
import com.careerform.formanalysis.domain.PreparationSnapshot;
import com.careerform.formanalysis.domain.Visibility;

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
}
