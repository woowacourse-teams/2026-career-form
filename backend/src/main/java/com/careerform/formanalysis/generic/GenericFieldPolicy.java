package com.careerform.formanalysis.generic;

import java.util.List;

import com.careerform.formanalysis.application.FieldInteractionPolicy;
import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse;
import com.careerform.formanalysis.generic.GenericFieldsRequest.FieldCandidate;
import com.careerform.formanalysis.generic.GenericFieldsRequest.WriteCommand;
import com.careerform.formanalysis.generic.GenericFieldsResponse.AutofillPolicy;
import com.careerform.formanalysis.generic.GenericFieldsResponse.InteractionStatus;
import com.careerform.formanalysis.generic.GenericFieldsResponse.WritePlan;
import com.careerform.formanalysis.generic.GenericFieldsResponse.Binding;
import com.careerform.formanalysis.generic.GenericFieldsResponse.NameBinding;

/**
 * 범용 칸을 공유 범용 경로와 같은 규칙으로 판정한다. 범용 요청을 공유 칸 후보로 상수 이름 기준 변환해
 * FieldInteractionPolicy와 SupportedProfileFields를 그대로 호출하고, 결과를 범용 열거형으로 되돌린다.
 */
final class GenericFieldPolicy {

    private final FieldInteractionPolicy interactionPolicy;
    private final SupportedProfileFields supportedProfileFields;

    GenericFieldPolicy(FieldInteractionPolicy interactionPolicy, SupportedProfileFields supportedProfileFields) {
        this.interactionPolicy = interactionPolicy;
        this.supportedProfileFields = supportedProfileFields;
    }

    record Assessment(AutofillPolicy autofillPolicy, InteractionStatus interactionStatus, WritePlan writePlan) {
    }

    Assessment assess(FieldCandidate candidate, String profileFieldKey, Binding binding,
        List<WriteCommand> supportedWriteCommands) {
        FieldMappingResolver.Result mapping = binding instanceof NameBinding name
            ? new FieldMappingResolver.Match(candidate.candidateId(), new FieldMappingResolver.DerivedBinding(name.recipe()))
            : profileFieldKey == null
                ? new FieldMappingResolver.NoMatch(candidate.candidateId())
                : new FieldMappingResolver.Match(candidate.candidateId(), profileFieldKey, false);
        FieldInteractionPolicy.Decision decision = interactionPolicy.evaluate(toShared(candidate), mapping, true,
            supportedWriteCommands.stream()
                .map(command -> rename(command, FieldsAnalysisResponse.WriteCommand.class))
                .toList());
        AutofillPolicy autofillPolicy = profileFieldKey == null
            ? binding instanceof NameBinding ? AutofillPolicy.ALLOWED : null
            : rename(supportedProfileFields.policyOf(profileFieldKey).orElseThrow(), AutofillPolicy.class);
        WritePlan writePlan = decision.writePlan() == null
            ? null
            : new WritePlan(rename(decision.writePlan().command(), WriteCommand.class));
        return new Assessment(autofillPolicy, rename(decision.interactionStatus(), InteractionStatus.class),
            writePlan);
    }

    static FieldsAnalysisRequest.FieldCandidate toShared(FieldCandidate candidate) {
        return new FieldsAnalysisRequest.FieldCandidate(
            candidate.candidateId(),
            rename(candidate.element(), FieldsAnalysisRequest.FormElement.class),
            rename(candidate.control(), FieldsAnalysisRequest.FormControl.class),
            rename(candidate.visibility(), FieldsAnalysisRequest.Visibility.class),
            candidate.displayName(),
            candidate.domId(),
            candidate.domName(),
            candidate.placeholder(),
            candidate.disabled(),
            candidate.readonly(),
            candidate.inert(),
            candidate.options() == null ? null : candidate.options().stream()
                .map(option -> new FieldsAnalysisRequest.Option(option.optionId(), option.displayName()))
                .toList(),
            toShared(candidate.semanticContext())
        );
    }

    private static FieldsAnalysisRequest.SemanticContext toShared(GenericFieldsRequest.SemanticContext context) {
        if (context == null) {
            return null;
        }
        GenericFieldsRequest.RepeatContext repeat = context.repeat();
        return new FieldsAnalysisRequest.SemanticContext(
            context.labels() == null ? null : context.labels().stream()
                .map(label -> new FieldsAnalysisRequest.SemanticLabel(
                    rename(label.source(), FieldsAnalysisRequest.SemanticSource.class), label.text()))
                .toList(),
            rename(context.inputType(), FieldsAnalysisRequest.InputType.class),
            rename(context.inputMode(), FieldsAnalysisRequest.InputMode.class),
            rename(context.autocomplete(), FieldsAnalysisRequest.Autocomplete.class),
            context.required(),
            context.multiple(),
            context.maxLength(),
            repeat == null ? null
                : new FieldsAnalysisRequest.RepeatContext(repeat.groupId(), repeat.rowIndex(), repeat.rowCount())
        );
    }

    private static <T extends Enum<T>> T rename(Enum<?> value, Class<T> target) {
        return value == null ? null : Enum.valueOf(target, value.name());
    }
}
