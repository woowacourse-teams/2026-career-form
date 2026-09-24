package com.careerform.formanalysis.infrastructure.adapter.openai;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import org.springframework.context.annotation.Conditional;
import com.careerform.formanalysis.infrastructure.SelectedOpenAi;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.annotation.JsonInclude;

import com.careerform.formanalysis.application.port.ActionResolver;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.ActionCandidate;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.Item;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest.Section;
import com.careerform.formanalysis.exception.ResolverException;

@Component
@Conditional(SelectedOpenAi.class)
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
                ProviderSemanticSanitizer.sanitize(section.displayName()),
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
        Boolean disabled,
        Boolean readonly,
        Boolean inert,
        ActionSemanticContext semanticContext,
        List<ActionOption> options
    ) {

        static ActionCandidateInput from(ActionCandidate candidate) {
            return new ActionCandidateInput(
                candidate.candidateId(),
                ProviderSemanticSanitizer.sanitize(candidate.displayName()),
                candidate.element(),
                candidate.control(),
                candidate.visibility(),
                trueOnly(candidate.disabled()),
                trueOnly(candidate.readonly()),
                trueOnly(candidate.inert()),
                ActionSemanticContext.from(candidate),
                candidate.options() == null
                    ? null
                    : candidate.options().stream()
                        .map(ActionOption::from)
                        .filter(option -> option.displayName() != null)
                        .toList()
            );
        }

        private static Boolean trueOnly(Boolean state) {
            return Boolean.TRUE.equals(state) ? Boolean.TRUE : null;
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record ActionSemanticContext(
        List<ProviderSemanticSanitizer.SafeLabel> labels,
        Boolean required,
        Boolean multiple
    ) {

        static ActionSemanticContext from(
            ActionCandidate candidate
        ) {
            Set<ProviderSemanticSanitizer.SafeLabel> labels = new LinkedHashSet<>();
            String legacy = ProviderSemanticSanitizer.sanitize(
                candidate.displayName()
            );
            if (legacy != null) {
                labels.add(new ProviderSemanticSanitizer.SafeLabel("label", legacy));
            }
            if (candidate.semanticContext() != null) {
                List<ProviderSemanticSanitizer.SafeLabel> safe =
                    ProviderSemanticSanitizer.sanitizeActions(
                        candidate.semanticContext().labels()
                    );
                if (safe != null) {
                    labels.addAll(safe);
                }
            }
            PreparationAnalysisRequest.SemanticContext context =
                candidate.semanticContext();
            if (labels.isEmpty() && context == null) {
                return null;
            }
            return new ActionSemanticContext(
                labels.isEmpty() ? null : List.copyOf(labels),
                context == null ? null : trueOnly(context.required()),
                context == null ? null : trueOnly(context.multiple())
            );
        }

        private static Boolean trueOnly(Boolean state) {
            return Boolean.TRUE.equals(state) ? Boolean.TRUE : null;
        }
    }

    record ActionOption(String displayName) {

        static ActionOption from(PreparationAnalysisRequest.Option option) {
            return new ActionOption(
                ProviderSemanticSanitizer.sanitize(option.displayName())
            );
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
