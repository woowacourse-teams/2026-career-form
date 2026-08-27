package com.careerform.formanalysis.infrastructure.adapter.openai;

import java.util.ArrayList;
import java.util.List;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.annotation.JsonInclude;

import com.careerform.formanalysis.application.port.ActionResolver;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.ActionCandidate;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.Item;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.Section;
import com.careerform.formanalysis.exception.ResolverException;

@Component
@ConditionalOnProperty(
    prefix = "career-form.llm",
    name = "enabled",
    havingValue = "true"
)
public final class OpenAiActionResolver implements ActionResolver {

    private static final String INVALID_RESPONSE_MESSAGE =
        "LLM 분석 응답 계약을 확인할 수 없습니다";
    private static final String SYSTEM_PROMPT = """
        Analyze de-identified application-form action metadata using schemaVersion 2.
        Return every candidate exactly once across the required revealSections,
        addRepeatableGroups, and noActions arrays. revealSections entries contain only
        candidateId and targetSectionId. The other entries contain only candidateId.
        Choose noActions when no action is supported or the candidate is hidden,
        disabled, readonly, or inert. Do not return commands, expected effects, selectors,
        or execution information. Do not click anything, choose an execution count,
        execute repeated actions, or claim that an expected effect occurred. The browser
        owns user approval, execution, effect verification, and fresh DOM collection.
        """;

    private final OpenAiClient client;

    public OpenAiActionResolver(OpenAiClient client) {
        this.client = client;
    }

    @Override
    public Resolution resolve(PreparationAnalysisRequest request) {
        ActionOutput output = client.generate(
            SYSTEM_PROMPT,
            ActionInput.from(request),
            ActionOutput.class
        );
        try {
            List<Result> results = new ArrayList<>();
            output.revealSections().forEach(action -> results.add(
                new RevealAction(action.candidateId(), action.targetSectionId())
            ));
            output.addRepeatableGroups().forEach(action -> results.add(
                new AddAction(action.candidateId())
            ));
            output.noActions().forEach(action -> results.add(
                new NoAction(action.candidateId())
            ));
            return new Resolution(
                output.schemaVersion(),
                output.snapshotId(),
                List.copyOf(results)
            );
        }
        catch (RuntimeException exception) {
            throw new ResolverException(INVALID_RESPONSE_MESSAGE);
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record ActionInput(
        int schemaVersion,
        String snapshotId,
        List<ActionSection> sections
    ) {

        static ActionInput from(PreparationAnalysisRequest request) {
            return new ActionInput(
                request.schemaVersion(),
                request.snapshotId(),
                request.sections().stream().map(ActionSection::from).toList()
            );
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record ActionSection(
        String sectionId,
        String parentSectionId,
        String displayName,
        List<ActionCandidateInput> actionCandidates,
        List<ActionItem> items
    ) {

        static ActionSection from(Section section) {
            return new ActionSection(
                section.sectionId(),
                section.parentSectionId(),
                section.displayName(),
                section.actionCandidates().stream()
                    .map(ActionCandidateInput::from)
                    .toList(),
                section.items() == null
                    ? null
                    : section.items().stream().map(ActionItem::from).toList()
            );
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record ActionItem(
        String itemId,
        List<ActionCandidateInput> actionCandidates
    ) {

        static ActionItem from(Item item) {
            return new ActionItem(
                item.itemId(),
                item.actionCandidates().stream()
                    .map(ActionCandidateInput::from)
                    .toList()
            );
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record ActionCandidateInput(
        String candidateId,
        String displayName,
        PreparationAnalysisRequest.FormElement element,
        PreparationAnalysisRequest.FormControl control,
        PreparationAnalysisRequest.Visibility visibility,
        String domId,
        String domName,
        Boolean disabled,
        Boolean readonly,
        Boolean inert
    ) {

        static ActionCandidateInput from(ActionCandidate candidate) {
            return new ActionCandidateInput(
                candidate.candidateId(),
                candidate.displayName(),
                candidate.element(),
                candidate.control(),
                candidate.visibility(),
                candidate.domId(),
                candidate.domName(),
                trueOnly(candidate.disabled()),
                trueOnly(candidate.readonly()),
                trueOnly(candidate.inert())
            );
        }

        private static Boolean trueOnly(Boolean state) {
            return Boolean.TRUE.equals(state) ? Boolean.TRUE : null;
        }
    }

    record ActionOutput(
        int schemaVersion,
        String snapshotId,
        List<RevealSection> revealSections,
        List<AddRepeatableGroup> addRepeatableGroups,
        List<NoActionOutput> noActions
    ) {
    }

    record RevealSection(String candidateId, String targetSectionId) {
    }

    record AddRepeatableGroup(String candidateId) {
    }

    record NoActionOutput(String candidateId) {
    }
}
