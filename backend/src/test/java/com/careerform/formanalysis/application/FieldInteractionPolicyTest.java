package com.careerform.formanalysis.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import com.careerform.formanalysis.domain.FieldMappingResolution;
import com.careerform.formanalysis.domain.FieldsAnalysis;
import com.careerform.formanalysis.domain.FieldsSnapshot;
import com.careerform.formanalysis.domain.FormControl;
import com.careerform.formanalysis.domain.FormElement;
import com.careerform.formanalysis.domain.Visibility;

class FieldInteractionPolicyTest {

    private final FieldInteractionPolicy policy = new FieldInteractionPolicy();

    @Test
    void noMatchBlocksBeforeCandidateStateChecks() {
        FieldsSnapshot.FieldCandidate candidate = candidate(
            FormElement.INPUT,
            FormControl.TEXT,
            Visibility.HIDDEN,
            true,
            null,
            null
        );

        FieldInteractionPolicy.Decision decision = policy.evaluate(
            candidate,
            new FieldMappingResolution.NoMatch("field-1")
        );

        assertThat(decision.interactionStatus())
            .isEqualTo(FieldsAnalysis.InteractionStatus.BLOCKED);
        assertThat(decision.reasonCodes())
            .containsExactly(FieldsAnalysis.ReasonCode.NO_MATCH);
        assertThat(decision.writePlan()).isNull();
    }

    @ParameterizedTest
    @MethodSource("stateDecisions")
    void blocksOrDefersFieldsThatAreNotImmediatelyEditable(
        FieldsSnapshot.FieldCandidate candidate,
        FieldsAnalysis.InteractionStatus expectedStatus
    ) {
        FieldInteractionPolicy.Decision decision = policy.evaluate(
            candidate,
            match()
        );

        assertThat(decision.interactionStatus()).isEqualTo(expectedStatus);
        assertThat(decision.reasonCodes()).isEmpty();
        assertThat(decision.writePlan()).isNull();
    }

    @ParameterizedTest
    @MethodSource("readyMappings")
    void emitsOnlyTheApprovedWriteCommands(
        FormElement element,
        FormControl control,
        FieldsAnalysis.WriteCommand command
    ) {
        FieldInteractionPolicy.Decision decision = policy.evaluate(
            candidate(element, control, Visibility.VISIBLE, null, null, null),
            match()
        );

        assertThat(decision.interactionStatus())
            .isEqualTo(FieldsAnalysis.InteractionStatus.READY);
        assertThat(decision.reasonCodes()).isEmpty();
        assertThat(decision.writePlan())
            .isEqualTo(new FieldsAnalysis.WritePlan(command));
        assertThat(decision.interactionStatus())
            .isNotEqualTo(FieldsAnalysis.InteractionStatus.SYSTEM_CONTROL);
    }

    private static Stream<Arguments> stateDecisions() {
        return Stream.of(
            Arguments.of(
                candidate(
                    FormElement.INPUT,
                    FormControl.TEXT,
                    Visibility.VISIBLE,
                    true,
                    null,
                    null
                ),
                FieldsAnalysis.InteractionStatus.BLOCKED
            ),
            Arguments.of(
                candidate(
                    FormElement.INPUT,
                    FormControl.TEXT,
                    Visibility.VISIBLE,
                    null,
                    true,
                    null
                ),
                FieldsAnalysis.InteractionStatus.BLOCKED
            ),
            Arguments.of(
                candidate(
                    FormElement.INPUT,
                    FormControl.TEXT,
                    Visibility.VISIBLE,
                    null,
                    null,
                    true
                ),
                FieldsAnalysis.InteractionStatus.BLOCKED
            ),
            Arguments.of(
                candidate(
                    FormElement.INPUT,
                    FormControl.TEXT,
                    Visibility.HIDDEN,
                    null,
                    null,
                    null
                ),
                FieldsAnalysis.InteractionStatus.MANUAL_REVEAL_REQUIRED
            ),
            Arguments.of(
                candidate(
                    FormElement.CUSTOM,
                    FormControl.CUSTOM,
                    Visibility.VISIBLE,
                    null,
                    null,
                    null
                ),
                FieldsAnalysis.InteractionStatus.UNVERIFIED
            ),
            Arguments.of(
                candidate(
                    FormElement.INPUT,
                    FormControl.SELECT,
                    Visibility.VISIBLE,
                    null,
                    null,
                    null
                ),
                FieldsAnalysis.InteractionStatus.UNVERIFIED
            )
        );
    }

    private static Stream<Arguments> readyMappings() {
        return Stream.of(
            Arguments.of(
                FormElement.INPUT,
                FormControl.TEXT,
                FieldsAnalysis.WriteCommand.SET_TEXT
            ),
            Arguments.of(
                FormElement.TEXTAREA,
                FormControl.TEXTAREA,
                FieldsAnalysis.WriteCommand.SET_TEXT
            ),
            Arguments.of(
                FormElement.SELECT,
                FormControl.SELECT,
                FieldsAnalysis.WriteCommand.SELECT_OPTION
            ),
            Arguments.of(
                FormElement.INPUT,
                FormControl.RADIO,
                FieldsAnalysis.WriteCommand.CHECK_RADIO
            ),
            Arguments.of(
                FormElement.INPUT,
                FormControl.CHECKBOX,
                FieldsAnalysis.WriteCommand.CHECK_CHECKBOX
            )
        );
    }

    private static FieldMappingResolution.Match match() {
        return new FieldMappingResolution.Match(
            "field-1",
            "contact.contact.email"
        );
    }

    private static FieldsSnapshot.FieldCandidate candidate(
        FormElement element,
        FormControl control,
        Visibility visibility,
        Boolean disabled,
        Boolean readonly,
        Boolean inert
    ) {
        return new FieldsSnapshot.FieldCandidate(
            "field-1",
            element,
            control,
            visibility,
            "합성 필드",
            null,
            null,
            null,
            disabled,
            readonly,
            inert,
            null
        );
    }
}
