package com.careerform.formanalysis.infrastructure.llm;

import java.util.List;

import com.careerform.formanalysis.application.port.ActionResolver;
import com.careerform.formanalysis.domain.ActionResolution;
import com.careerform.formanalysis.domain.PreparationSnapshot;

public final class LlmActionResolver implements ActionResolver {

    private final LlmStructuredOutputClient client;

    public LlmActionResolver(LlmStructuredOutputClient client) {
        this.client = client;
    }

    @Override
    public ActionResolution resolve(PreparationSnapshot snapshot) {
        LlmActionContract.Output output = client.generate(
            systemPrompt(),
            LlmActionContract.Input.from(snapshot),
            LlmActionContract.Output.class,
            LlmContractSchemas.actionOutput()
        );
        if (output == null) {
            return null;
        }
        return new ActionResolution(
            output.schemaVersion(),
            output.snapshotId(),
            mapResults(output.results())
        );
    }

    private static List<ActionResolution.Result> mapResults(
        List<LlmActionContract.Result> results
    ) {
        if (results == null) {
            return null;
        }
        return results.stream()
            .map(LlmActionResolver::mapResult)
            .toList();
    }

    private static ActionResolution.Result mapResult(
        LlmActionContract.Result result
    ) {
        if (result instanceof LlmActionContract.RevealAction reveal) {
            return new ActionResolution.RevealAction(
                reveal.candidateId(),
                reveal.targetSectionId()
            );
        }
        if (result instanceof LlmActionContract.AddAction add) {
            return new ActionResolution.AddAction(add.candidateId());
        }
        LlmActionContract.NoAction noAction = (LlmActionContract.NoAction) result;
        return new ActionResolution.NoAction(noAction.candidateId());
    }

    private static String systemPrompt() {
        return """
            Analyze de-identified application-form action metadata using schemaVersion 2.
            Return every candidate exactly once. The only ACTION tuples are
            REVEAL_SECTION with TARGET_VISIBLE and a targetSectionId, or
            ADD_REPEATABLE_GROUP with GROUP_COUNT_INCREMENT. Return NO_ACTION without
            command, expected effect, or target properties when neither tuple is supported
            or when the candidate is hidden, disabled, readonly, or inert.
            Do not click anything, choose an execution count, execute repeated actions, or
            claim that an expected effect occurred. The browser owns user approval,
            execution count, execution, effect verification, and fresh DOM collection.
            """;
    }
}
