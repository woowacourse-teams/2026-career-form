package com.careerform.formanalysis.infrastructure.adapter.openai;

import java.util.ArrayList;
import java.util.List;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.annotation.JsonInclude;

import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FieldCandidate;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Item;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Option;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Section;
import com.careerform.formanalysis.exception.ResolverException;

@Component
@ConditionalOnProperty(
    prefix = "career-form.llm",
    name = "enabled",
    havingValue = "true"
)
public final class OpenAiFieldMappingResolver implements FieldMappingResolver {

    private static final String INVALID_RESPONSE_MESSAGE =
        "LLM 분석 응답 계약을 확인할 수 없습니다";
    private static final String SYSTEM_PROMPT = """
        Map de-identified application-form field metadata using schemaVersion 2.
        Return every candidate exactly once across the required matches and noMatches
        arrays. matches entries contain only candidateId and profileFieldKey; noMatches
        entries contain only candidateId. Use a profileFieldKey from the allowed list only
        when the display metadata is sufficient. Otherwise use noMatches. Do not infer or
        return field values, confidence, autofill policy, interaction state, or write plans.
        Allowed canonical profile keys:
        %s
        """;

    private final OpenAiClient client;
    private final SupportedProfileFields supportedProfileFields;

    public OpenAiFieldMappingResolver(
        OpenAiClient client,
        SupportedProfileFields supportedProfileFields
    ) {
        this.client = client;
        this.supportedProfileFields = supportedProfileFields;
    }

    @Override
    public Resolution resolve(FieldsAnalysisRequest request) {
        FieldOutput output = client.generate(
            SYSTEM_PROMPT.formatted(String.join("\n", supportedProfileFields.keys())),
            FieldInput.from(request),
            FieldOutput.class
        );
        try {
            List<Result> results = new ArrayList<>();
            output.matches().forEach(match -> results.add(new Match(
                match.candidateId(),
                match.profileFieldKey()
            )));
            output.noMatches().forEach(noMatch -> results.add(
                new NoMatch(noMatch.candidateId())
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
    record FieldInput(
        int schemaVersion,
        String snapshotId,
        List<FieldSection> sections
    ) {

        static FieldInput from(FieldsAnalysisRequest request) {
            return new FieldInput(
                request.schemaVersion(),
                request.snapshotId(),
                request.sections().stream().map(FieldSection::from).toList()
            );
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record FieldSection(
        String sectionId,
        String parentSectionId,
        String displayName,
        List<FieldCandidateInput> fields,
        List<FieldItem> items
    ) {

        static FieldSection from(Section section) {
            return new FieldSection(
                section.sectionId(),
                section.parentSectionId(),
                section.displayName(),
                section.fields().stream().map(FieldCandidateInput::from).toList(),
                section.items() == null
                    ? null
                    : section.items().stream().map(FieldItem::from).toList()
            );
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record FieldItem(String itemId, List<FieldCandidateInput> fields) {

        static FieldItem from(Item item) {
            return new FieldItem(
                item.itemId(),
                item.fields().stream().map(FieldCandidateInput::from).toList()
            );
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record FieldCandidateInput(
        String candidateId,
        String displayName,
        FieldsAnalysisRequest.FormElement element,
        FieldsAnalysisRequest.FormControl control,
        List<FieldOption> options
    ) {

        static FieldCandidateInput from(FieldCandidate field) {
            return new FieldCandidateInput(
                field.candidateId(),
                field.displayName(),
                field.element(),
                field.control(),
                field.options() == null
                    ? null
                    : field.options().stream().map(FieldOption::from).toList()
            );
        }
    }

    record FieldOption(String displayName) {

        static FieldOption from(Option option) {
            return new FieldOption(option.displayName());
        }
    }

    record FieldOutput(
        int schemaVersion,
        String snapshotId,
        List<MatchOutput> matches,
        List<NoMatchOutput> noMatches
    ) {
    }

    record MatchOutput(String candidateId, String profileFieldKey) {
    }

    record NoMatchOutput(String candidateId) {
    }
}
