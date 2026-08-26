package com.careerform.formanalysis.application;

import java.util.List;

import com.careerform.formanalysis.domain.FieldMappingResolution;
import com.careerform.formanalysis.domain.FieldsAnalysis;
import com.careerform.formanalysis.domain.FieldsSnapshot;
import com.careerform.formanalysis.domain.FormControl;
import com.careerform.formanalysis.domain.FormElement;
import com.careerform.formanalysis.domain.Visibility;

public final class FieldInteractionPolicy {

    public Decision evaluate(
        FieldsSnapshot.FieldCandidate candidate,
        FieldMappingResolution.Result mapping
    ) {
        if (mapping instanceof FieldMappingResolution.NoMatch) {
            return new Decision(
                FieldsAnalysis.InteractionStatus.BLOCKED,
                List.of(FieldsAnalysis.ReasonCode.NO_MATCH),
                null
            );
        }
        if (Boolean.TRUE.equals(candidate.disabled())
            || Boolean.TRUE.equals(candidate.readonly())
            || Boolean.TRUE.equals(candidate.inert())) {
            return withoutWrite(FieldsAnalysis.InteractionStatus.BLOCKED);
        }
        if (candidate.visibility() == Visibility.HIDDEN) {
            return withoutWrite(
                FieldsAnalysis.InteractionStatus.MANUAL_REVEAL_REQUIRED
            );
        }
        FieldsAnalysis.WriteCommand command = writeCommand(candidate);
        if (command == null) {
            return withoutWrite(FieldsAnalysis.InteractionStatus.UNVERIFIED);
        }
        return new Decision(
            FieldsAnalysis.InteractionStatus.READY,
            List.of(),
            new FieldsAnalysis.WritePlan(command)
        );
    }

    private static Decision withoutWrite(
        FieldsAnalysis.InteractionStatus status
    ) {
        return new Decision(status, List.of(), null);
    }

    private static FieldsAnalysis.WriteCommand writeCommand(
        FieldsSnapshot.FieldCandidate candidate
    ) {
        FormElement element = candidate.element();
        FormControl control = candidate.control();
        if (element == FormElement.INPUT && control == FormControl.TEXT
            || element == FormElement.TEXTAREA && control == FormControl.TEXTAREA) {
            return FieldsAnalysis.WriteCommand.SET_TEXT;
        }
        if (element == FormElement.SELECT && control == FormControl.SELECT) {
            return FieldsAnalysis.WriteCommand.SELECT_OPTION;
        }
        if (element == FormElement.INPUT && control == FormControl.RADIO) {
            return FieldsAnalysis.WriteCommand.CHECK_RADIO;
        }
        if (element == FormElement.INPUT && control == FormControl.CHECKBOX) {
            return FieldsAnalysis.WriteCommand.CHECK_CHECKBOX;
        }
        return null;
    }

    public record Decision(
        FieldsAnalysis.InteractionStatus interactionStatus,
        List<FieldsAnalysis.ReasonCode> reasonCodes,
        FieldsAnalysis.WritePlan writePlan
    ) {
    }
}
