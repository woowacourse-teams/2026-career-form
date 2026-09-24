package com.careerform.formanalysis.application;

import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Component;

import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FieldCandidate;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.InputType;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Visibility;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.InteractionStatus;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.ReasonCode;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.WriteCommand;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse.WritePlan;

@Component
public final class FieldInteractionPolicy {

    private static final SupportedProfileFields SUPPORTED_FIELDS = new SupportedProfileFields();
    private static final Set<String> CANONICAL_FIELDS = SUPPORTED_FIELDS.keys();

    public Decision evaluate(
        FieldCandidate candidate,
        FieldMappingResolver.Result mapping
    ) {
        return evaluate(candidate, mapping, false);
    }

    public Decision evaluate(
        FieldCandidate candidate,
        FieldMappingResolver.Result mapping,
        boolean generic
    ) {
        return evaluate(candidate, mapping, generic, List.of());
    }

    public Decision evaluate(
        FieldCandidate candidate,
        FieldMappingResolver.Result mapping,
        boolean generic,
        List<WriteCommand> supportedWriteCommands
    ) {
        if (mapping instanceof FieldMappingResolver.NoMatch) {
            return new Decision(
                InteractionStatus.BLOCKED,
                List.of(ReasonCode.NO_MATCH),
                null
            );
        }
        if (Boolean.TRUE.equals(candidate.disabled())
            || Boolean.TRUE.equals(candidate.inert())) {
            return withoutWrite(InteractionStatus.BLOCKED);
        }
        boolean dateSelection = generic && isDateSelection(
            candidate, mapping, supportedWriteCommands
        );
        boolean searchSelection = generic && !dateSelection
            && isSearchSelection(candidate, mapping);
        if (Boolean.TRUE.equals(candidate.readonly())
            && !searchSelection
            && !dateSelection
            && (generic || !allowsReadonlyText(candidate, mapping))) {
            return withoutWrite(InteractionStatus.BLOCKED);
        }
        if (candidate.visibility() == Visibility.HIDDEN) {
            return withoutWrite(InteractionStatus.MANUAL_REVEAL_REQUIRED);
        }
        WriteCommand command = dateSelection
            ? WriteCommand.SELECT_DATE
            : searchSelection ? WriteCommand.SEARCH_SELECTION
            : writeCommand(candidate, mapping);
        if (command == null) {
            return withoutWrite(InteractionStatus.UNVERIFIED);
        }
        return new Decision(
            InteractionStatus.READY,
            List.of(),
            new WritePlan(command)
        );
    }

    // This authorizes local preflight, never a direct write or an assumed safe popup.
    private static boolean isDateSelection(
        FieldCandidate candidate,
        FieldMappingResolver.Result mapping,
        List<WriteCommand> supportedWriteCommands
    ) {
        if (supportedWriteCommands == null
            || !supportedWriteCommands.contains(WriteCommand.SELECT_DATE)
            || !Boolean.TRUE.equals(candidate.readonly())
            || candidate.element() != FormElement.INPUT
            || candidate.control() != FormControl.TEXT
            || candidate.visibility() != Visibility.VISIBLE
            || candidate.semanticContext() == null
            || candidate.semanticContext().inputType() != InputType.TEXT
            || !(mapping instanceof FieldMappingResolver.Match match)
            || !(match.valueBinding() instanceof FieldMappingResolver.DirectBinding direct)) {
            return false;
        }
        return SUPPORTED_FIELDS.isDateField(direct.profileFieldKey());
    }

    private static boolean isSearchSelection(
        FieldCandidate candidate,
        FieldMappingResolver.Result mapping
    ) {
        if (!Boolean.TRUE.equals(candidate.readonly())
            || candidate.element() != FormElement.INPUT
            || candidate.control() != FormControl.TEXT
            || candidate.visibility() != Visibility.VISIBLE
            || candidate.semanticContext() == null
            || candidate.semanticContext().inputType() != InputType.TEXT
            || !(mapping instanceof FieldMappingResolver.Match match)
            || !(match.valueBinding() instanceof FieldMappingResolver.DirectBinding direct)) {
            return false;
        }
        return CANONICAL_FIELDS.contains(direct.profileFieldKey());
    }

    private static Decision withoutWrite(InteractionStatus status) {
        return new Decision(status, List.of(), null);
    }

    private static boolean allowsReadonlyText(
        FieldCandidate candidate,
        FieldMappingResolver.Result mapping
    ) {
        return mapping instanceof FieldMappingResolver.Match match
            && match.allowsReadonlyWrite()
            && candidate.element() == FormElement.INPUT
            && candidate.control() == FormControl.TEXT;
    }

    private static WriteCommand writeCommand(
        FieldCandidate candidate,
        FieldMappingResolver.Result mapping
    ) {
        FormElement element = candidate.element();
        FormControl control = candidate.control();
        if (element == FormElement.INPUT && control == FormControl.TEXT
            && mapping instanceof FieldMappingResolver.Match match
            && match.valueBinding() instanceof FieldMappingResolver.ButtonOptionBinding) {
            return WriteCommand.SELECT_BUTTON_OPTION;
        }
        if (element == FormElement.INPUT && control == FormControl.TEXT
            || element == FormElement.TEXTAREA && control == FormControl.TEXTAREA) {
            return WriteCommand.SET_TEXT;
        }
        if (element == FormElement.SELECT && control == FormControl.SELECT) {
            return WriteCommand.SELECT_OPTION;
        }
        if (element == FormElement.INPUT && control == FormControl.BUTTON) {
            return WriteCommand.SELECT_BUTTON_OPTION;
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
