package com.careerform.formanalysis.application;

import java.util.List;

import org.springframework.stereotype.Component;

import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FieldCandidate;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Visibility;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.InteractionStatus;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.ReasonCode;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.WriteCommand;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.WritePlan;

@Component
public final class FieldInteractionPolicy {

    public Decision evaluate(
        FieldCandidate candidate,
        FieldMappingResolver.Result mapping
    ) {
        if (mapping instanceof FieldMappingResolver.NoMatch) {
            return new Decision(
                InteractionStatus.BLOCKED,
                List.of(ReasonCode.NO_MATCH),
                null
            );
        }
        if (Boolean.TRUE.equals(candidate.disabled())
            || Boolean.TRUE.equals(candidate.readonly())
            || Boolean.TRUE.equals(candidate.inert())) {
            return withoutWrite(InteractionStatus.BLOCKED);
        }
        if (candidate.visibility() == Visibility.HIDDEN) {
            return withoutWrite(InteractionStatus.MANUAL_REVEAL_REQUIRED);
        }
        WriteCommand command = writeCommand(candidate);
        if (command == null) {
            return withoutWrite(InteractionStatus.UNVERIFIED);
        }
        return new Decision(
            InteractionStatus.READY,
            List.of(),
            new WritePlan(command)
        );
    }

    private static Decision withoutWrite(InteractionStatus status) {
        return new Decision(status, List.of(), null);
    }

    private static WriteCommand writeCommand(FieldCandidate candidate) {
        FormElement element = candidate.element();
        FormControl control = candidate.control();
        if (element == FormElement.INPUT && control == FormControl.TEXT
            || element == FormElement.TEXTAREA && control == FormControl.TEXTAREA) {
            return WriteCommand.SET_TEXT;
        }
        if (element == FormElement.SELECT && control == FormControl.SELECT) {
            return WriteCommand.SELECT_OPTION;
        }
        if (element == FormElement.INPUT && control == FormControl.RADIO) {
            return WriteCommand.CHECK_RADIO;
        }
        if (element == FormElement.INPUT && control == FormControl.CHECKBOX) {
            return WriteCommand.CHECK_CHECKBOX;
        }
        return null;
    }

    public record Decision(
        InteractionStatus interactionStatus,
        List<ReasonCode> reasonCodes,
        WritePlan writePlan
    ) {
    }
}
