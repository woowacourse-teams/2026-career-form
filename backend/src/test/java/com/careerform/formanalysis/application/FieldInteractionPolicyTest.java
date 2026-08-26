package com.careerform.formanalysis.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.stream.Stream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FieldCandidate;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Visibility;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.InteractionStatus;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.ReasonCode;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.WriteCommand;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.WritePlan;

@DisplayName("필드 상호작용 정책")
class FieldInteractionPolicyTest {

    private final FieldInteractionPolicy policy = new FieldInteractionPolicy();

    @Test
    @DisplayName("NO_MATCH는 후보 상태보다 먼저 BLOCKED로 결정한다")
    void noMatchBlocksBeforeCandidateStateChecks() {
        FieldCandidate candidate = candidate(
            FormElement.INPUT,
            FormControl.TEXT,
            Visibility.HIDDEN,
            true,
            null,
            null
        );

        FieldInteractionPolicy.Decision decision = policy.evaluate(
            candidate,
            new FieldMappingResolver.NoMatch("field-1")
        );

        assertThat(decision.interactionStatus()).isEqualTo(InteractionStatus.BLOCKED);
        assertThat(decision.reasonCodes()).containsExactly(ReasonCode.NO_MATCH);
        assertThat(decision.writePlan()).isNull();
    }

    @ParameterizedTest
    @MethodSource("stateDecisions")
    @DisplayName("즉시 입력할 수 없는 필드는 상태에 맞게 차단하거나 보류한다")
    void blocksOrDefersFieldsThatAreNotImmediatelyEditable(
        FieldCandidate candidate,
        InteractionStatus expectedStatus
    ) {
        FieldInteractionPolicy.Decision decision = policy.evaluate(candidate, match());

        assertThat(decision.interactionStatus()).isEqualTo(expectedStatus);
        assertThat(decision.reasonCodes()).isEmpty();
        assertThat(decision.writePlan()).isNull();
    }

    @ParameterizedTest
    @MethodSource("readyMappings")
    @DisplayName("편집 가능한 표준 control에는 승인된 write command만 생성한다")
    void emitsOnlyTheApprovedWriteCommands(
        FormElement element,
        FormControl control,
        WriteCommand command
    ) {
        FieldInteractionPolicy.Decision decision = policy.evaluate(
            candidate(element, control, Visibility.VISIBLE, null, null, null),
            match()
        );

        assertThat(decision.interactionStatus()).isEqualTo(InteractionStatus.READY);
        assertThat(decision.reasonCodes()).isEmpty();
        assertThat(decision.writePlan()).isEqualTo(new WritePlan(command));
        assertThat(decision.interactionStatus())
            .isNotEqualTo(InteractionStatus.SYSTEM_CONTROL);
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
                InteractionStatus.BLOCKED
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
                InteractionStatus.BLOCKED
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
                InteractionStatus.BLOCKED
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
                InteractionStatus.MANUAL_REVEAL_REQUIRED
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
                InteractionStatus.UNVERIFIED
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
                InteractionStatus.UNVERIFIED
            )
        );
    }

    private static Stream<Arguments> readyMappings() {
        return Stream.of(
            Arguments.of(FormElement.INPUT, FormControl.TEXT, WriteCommand.SET_TEXT),
            Arguments.of(
                FormElement.TEXTAREA,
                FormControl.TEXTAREA,
                WriteCommand.SET_TEXT
            ),
            Arguments.of(
                FormElement.SELECT,
                FormControl.SELECT,
                WriteCommand.SELECT_OPTION
            ),
            Arguments.of(
                FormElement.INPUT,
                FormControl.RADIO,
                WriteCommand.CHECK_RADIO
            ),
            Arguments.of(
                FormElement.INPUT,
                FormControl.CHECKBOX,
                WriteCommand.CHECK_CHECKBOX
            )
        );
    }

    private static FieldMappingResolver.Match match() {
        return new FieldMappingResolver.Match("field-1", "contact.contact.email");
    }

    private static FieldCandidate candidate(
        FormElement element,
        FormControl control,
        Visibility visibility,
        Boolean disabled,
        Boolean readonly,
        Boolean inert
    ) {
        return new FieldCandidate(
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
            List.of()
        );
    }
}
