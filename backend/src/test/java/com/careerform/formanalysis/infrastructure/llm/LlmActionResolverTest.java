package com.careerform.formanalysis.infrastructure.llm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.careerform.formanalysis.domain.ActionResolution;
import com.careerform.formanalysis.domain.FormControl;
import com.careerform.formanalysis.domain.FormElement;
import com.careerform.formanalysis.domain.PreparationSnapshot;
import com.careerform.formanalysis.domain.Site;
import com.careerform.formanalysis.domain.Visibility;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

class LlmActionResolverTest {

    private static final String PRIVATE_SITE_MARKER = "private-site.example.test";

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void projectsOnlyApprovedActionMetadataAndPreservesGrouping() {
        CapturingClient client = client(validOutput());

        ActionResolution resolution = new LlmActionResolver(client).resolve(snapshot());

        assertThat(resolution).isEqualTo(new ActionResolution(
            2,
            "snapshot-1",
            List.of(
                new ActionResolution.NoAction("action-direct"),
                new ActionResolution.AddAction("action-item"),
                new ActionResolution.RevealAction(
                    "action-none",
                    "section-target"
                )
            )
        ));
        assertThat(objectMapper.writeValueAsString(client.input)).isEqualTo(
            "{\"schemaVersion\":2,\"snapshotId\":\"snapshot-1\",\"sections\":["
                + "{\"sectionId\":\"section-actions\",\"displayName\":\"학력\","
                + "\"actionCandidates\":[{\"candidateId\":\"action-direct\","
                + "\"displayName\":\"학력 펼치기\",\"element\":\"button\","
                + "\"control\":\"button\",\"visibility\":\"hidden\","
                + "\"domId\":\"synthetic-action-id\","
                + "\"domName\":\"synthetic-action-name\",\"disabled\":true,"
                + "\"readonly\":true,\"inert\":true}],\"items\":[{"
                + "\"itemId\":\"item-1\",\"actionCandidates\":[{"
                + "\"candidateId\":\"action-item\",\"element\":\"input\","
                + "\"control\":\"button\",\"visibility\":\"visible\"}]}]},{"
                + "\"sectionId\":\"section-target\","
                + "\"parentSectionId\":\"section-actions\","
                + "\"actionCandidates\":[{\"candidateId\":\"action-none\","
                + "\"displayName\":\"합성 버튼\",\"element\":\"custom\","
                + "\"control\":\"custom\",\"visibility\":\"visible\"}]}]}"
        );
        assertThat(objectMapper.writeValueAsString(client.input))
            .doesNotContain(
                "site",
                PRIVATE_SITE_MARKER,
                "profileFieldKey",
                "fieldCandidate",
                "value",
                "checked",
                "selected",
                "html",
                "url",
                "query",
                "fragment",
                "cookie",
                "session",
                "account",
                "authorization",
                "selector",
                "writePlan",
                "requiredAdditions",
                "executionCount"
            );
    }

    @Test
    void suppliesExecutionSafePromptAndStrictProviderSchema() {
        CapturingClient client = client(validOutput());

        new LlmActionResolver(client).resolve(snapshot());

        assertThat(client.outputType).isEqualTo(LlmActionContract.Output.class);
        assertThat(client.systemPrompt).contains(
            "schemaVersion 2",
            "exactly once",
            "REVEAL_SECTION",
            "TARGET_VISIBLE",
            "ADD_REPEATABLE_GROUP",
            "GROUP_COUNT_INCREMENT",
            "NO_ACTION",
            "Do not click",
            "execution count"
        );
        JsonNode schema = objectMapper.readTree(client.outputSchema);
        assertThat(schema.get("additionalProperties").asBoolean()).isFalse();
        assertThat(schema.get("required").toString())
            .isEqualTo("[\"schemaVersion\",\"snapshotId\",\"results\"]");
        JsonNode branches = schema.get("properties")
            .get("results")
            .get("items")
            .get("anyOf");
        assertThat(branches.size()).isEqualTo(3);
        assertThat(branches.get(0).get("additionalProperties").asBoolean()).isFalse();
        assertThat(branches.get(1).get("additionalProperties").asBoolean()).isFalse();
        assertThat(branches.get(2).get("additionalProperties").asBoolean()).isFalse();
        assertThat(client.outputSchema)
            .doesNotContain("\"format\"", "\"const\"", "minLength", "maxLength");
    }

    @Test
    void contractDeserializationRejectsMixedActionTuples() {
        String revealShapeWithAddTuple = outputJson("""
            {
              "candidateId": "action-1",
              "actionType": "ACTION",
              "command": "ADD_REPEATABLE_GROUP",
              "expectedEffect": "GROUP_COUNT_INCREMENT",
              "targetSectionId": "section-target"
            }
            """);
        String addShapeWithRevealTuple = outputJson("""
            {
              "candidateId": "action-1",
              "actionType": "ACTION",
              "command": "REVEAL_SECTION",
              "expectedEffect": "TARGET_VISIBLE"
            }
            """);
        String noActionShapeWithActionDecision = outputJson("""
            {
              "candidateId": "action-1",
              "actionType": "ACTION"
            }
            """);

        for (String json : List.of(
            revealShapeWithAddTuple,
            addShapeWithRevealTuple,
            noActionShapeWithActionDecision
        )) {
            assertThatThrownBy(() -> objectMapper.readValue(
                json,
                LlmActionContract.Output.class
            )).isInstanceOf(RuntimeException.class);
        }
    }

    private static String outputJson(String result) {
        return """
            {
              "schemaVersion": 2,
              "snapshotId": "snapshot-1",
              "results": [%s]
            }
            """.formatted(result);
    }

    private static LlmActionContract.Output validOutput() {
        return new LlmActionContract.Output(
            2,
            "snapshot-1",
            List.of(
                new LlmActionContract.NoAction(
                    "action-direct",
                    LlmActionContract.NoActionDecision.NO_ACTION
                ),
                new LlmActionContract.AddAction(
                    "action-item",
                    LlmActionContract.ActionDecision.ACTION,
                    LlmActionContract.AddCommand.ADD_REPEATABLE_GROUP,
                    LlmActionContract.AddEffect.GROUP_COUNT_INCREMENT
                ),
                new LlmActionContract.RevealAction(
                    "action-none",
                    LlmActionContract.ActionDecision.ACTION,
                    LlmActionContract.RevealCommand.REVEAL_SECTION,
                    LlmActionContract.RevealEffect.TARGET_VISIBLE,
                    "section-target"
                )
            )
        );
    }

    private static PreparationSnapshot snapshot() {
        return new PreparationSnapshot(
            2,
            "snapshot-1",
            new Site(PRIVATE_SITE_MARKER, "/private-path-marker/*"),
            List.of(
                new PreparationSnapshot.Section(
                    "section-actions",
                    null,
                    "학력",
                    List.of(new PreparationSnapshot.ActionCandidate(
                        "action-direct",
                        FormElement.BUTTON,
                        FormControl.BUTTON,
                        Visibility.HIDDEN,
                        "학력 펼치기",
                        "synthetic-action-id",
                        "synthetic-action-name",
                        true,
                        true,
                        true
                    )),
                    List.of(new PreparationSnapshot.Item(
                        "item-1",
                        List.of(new PreparationSnapshot.ActionCandidate(
                            "action-item",
                            FormElement.INPUT,
                            FormControl.BUTTON,
                            Visibility.VISIBLE,
                            null,
                            null,
                            null,
                            null,
                            null,
                            null
                        ))
                    ))
                ),
                new PreparationSnapshot.Section(
                    "section-target",
                    "section-actions",
                    null,
                    List.of(new PreparationSnapshot.ActionCandidate(
                        "action-none",
                        FormElement.CUSTOM,
                        FormControl.CUSTOM,
                        Visibility.VISIBLE,
                        "합성 버튼",
                        null,
                        null,
                        null,
                        null,
                        null
                    )),
                    null
                )
            )
        );
    }

    private static CapturingClient client(Object response) {
        return new CapturingClient(response);
    }

    private static final class CapturingClient implements LlmStructuredOutputClient {

        private final Object response;
        private String systemPrompt;
        private Object input;
        private Class<?> outputType;
        private String outputSchema;

        private CapturingClient(Object response) {
            this.response = response;
        }

        @Override
        public <O> O generate(
            String systemPrompt,
            Object input,
            Class<O> outputType,
            String outputSchema
        ) {
            this.systemPrompt = systemPrompt;
            this.input = input;
            this.outputType = outputType;
            this.outputSchema = outputSchema;
            return outputType.cast(response);
        }
    }
}
