package com.careerform.formanalysis.infrastructure.llm;

import java.util.List;

import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.domain.FieldMappingResolution;
import com.careerform.formanalysis.domain.FieldsSnapshot;
import com.careerform.formanalysis.domain.ProfileFieldCatalog;

public final class LlmFieldMappingResolver implements FieldMappingResolver {

    private final LlmStructuredOutputClient client;

    public LlmFieldMappingResolver(LlmStructuredOutputClient client) {
        this.client = client;
    }

    @Override
    public FieldMappingResolution resolve(FieldsSnapshot snapshot) {
        LlmFieldMappingContract.Output output = client.generate(
            systemPrompt(),
            LlmFieldMappingContract.Input.from(snapshot),
            LlmFieldMappingContract.Output.class,
            LlmContractSchemas.fieldOutput(ProfileFieldCatalog.keys())
        );
        if (output == null) {
            return null;
        }
        return new FieldMappingResolution(
            output.schemaVersion(),
            output.snapshotId(),
            mapResults(output.results())
        );
    }

    private static List<FieldMappingResolution.Result> mapResults(
        List<LlmFieldMappingContract.Result> results
    ) {
        if (results == null) {
            return null;
        }
        return results.stream()
            .map(LlmFieldMappingResolver::mapResult)
            .toList();
    }

    private static FieldMappingResolution.Result mapResult(
        LlmFieldMappingContract.Result result
    ) {
        if (result instanceof LlmFieldMappingContract.Match match) {
            return new FieldMappingResolution.Match(
                match.candidateId(),
                match.profileFieldKey()
            );
        }
        LlmFieldMappingContract.NoMatch noMatch =
            (LlmFieldMappingContract.NoMatch) result;
        return new FieldMappingResolution.NoMatch(noMatch.candidateId());
    }

    private static String systemPrompt() {
        return """
            You map de-identified application-form field metadata to canonical profile keys.
            The contract uses schemaVersion 2. Return every candidate exactly once.
            For each candidate, return MATCH with one allowed key only when the metadata is
            sufficient; otherwise return NO_MATCH. Do not infer values, confidence, autofill
            policy, interaction state, or a write plan.
            Allowed canonical profile keys:
            %s
            """.formatted(String.join("\n", ProfileFieldCatalog.keys()));
    }
}
