package com.careerform.formanalysis.infrastructure.llm.openai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.ChatOptions;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.openai.OpenAiChatOptions;

import com.careerform.formanalysis.application.ResolverUnavailableException;
import com.careerform.formanalysis.infrastructure.llm.LlmActionContract;
import com.careerform.formanalysis.infrastructure.llm.LlmContractSchemas;
import com.careerform.formanalysis.infrastructure.llm.LlmFieldMappingContract;
import com.careerform.formanalysis.infrastructure.llm.LlmProviderSettings;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

class OpenAiStructuredOutputClientTest {

    private static final LlmProviderSettings SETTINGS = new LlmProviderSettings(
        "gpt-5.6-luna",
        "none",
        2048
    );

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void strictConverterAcceptsExactUnionContracts() {
        StrictSchemaOutputConverter<LlmActionContract.Output> actionConverter =
            new StrictSchemaOutputConverter<>(
                LlmActionContract.Output.class,
                strictMapper(),
                LlmContractSchemas.actionOutput()
            );
        StrictSchemaOutputConverter<LlmFieldMappingContract.Output> fieldConverter =
            new StrictSchemaOutputConverter<>(
                LlmFieldMappingContract.Output.class,
                strictMapper(),
                LlmContractSchemas.fieldOutput(
                    java.util.Set.of("contact.contact.email")
                )
            );

        assertThat(actionConverter.convert("""
            {"schemaVersion":2,"snapshotId":"snapshot-1","results":[{
              "candidateId":"action-1","actionType":"NO_ACTION"
            }]}
            """).results()).hasSize(1);
        assertThat(fieldConverter.convert("""
            {"schemaVersion":2,"snapshotId":"snapshot-1","results":[{
              "candidateId":"field-1","matchType":"NO_MATCH"
            }]}
            """).results()).hasSize(1);
    }

    @Test
    void usesPinnedOptionsAndNativeActionSchema() {
        String responseJson = """
            {
              "schemaVersion": 2,
              "snapshotId": "snapshot-1",
              "results": [{"candidateId": "action-1", "actionType": "NO_ACTION"}]
            }
            """;
        CapturingChatModel model = new CapturingChatModel(responseJson);
        OpenAiStructuredOutputClient client = client(model, objectMapper);
        LlmActionContract.Input input = new LlmActionContract.Input(
            2,
            "snapshot-1",
            List.of()
        );
        String schema = LlmContractSchemas.actionOutput();

        LlmActionContract.Output output = client.generate(
            "synthetic action system prompt",
            input,
            LlmActionContract.Output.class,
            schema
        );

        assertThat(output.results()).containsExactly(new LlmActionContract.NoAction(
            "action-1",
            LlmActionContract.NoActionDecision.NO_ACTION
        ));
        assertPinnedOptionsAndMessages(model.lastPrompt(), input, schema);
        assertActionSchema(schema);
    }

    @Test
    void usesPinnedOptionsAndNativeFieldSchema() {
        String responseJson = """
            {
              "schemaVersion": 2,
              "snapshotId": "snapshot-1",
              "results": [{"candidateId": "field-1", "matchType": "NO_MATCH"}]
            }
            """;
        CapturingChatModel model = new CapturingChatModel(responseJson);
        OpenAiStructuredOutputClient client = client(model, objectMapper);
        LlmFieldMappingContract.Input input = new LlmFieldMappingContract.Input(
            2,
            "snapshot-1",
            List.of()
        );
        String schema = LlmContractSchemas.fieldOutput(
            java.util.Set.of("contact.contact.email")
        );

        LlmFieldMappingContract.Output output = client.generate(
            "synthetic field system prompt",
            input,
            LlmFieldMappingContract.Output.class,
            schema
        );

        assertThat(output.results()).containsExactly(new LlmFieldMappingContract.NoMatch(
            "field-1",
            LlmFieldMappingContract.NoMatchDecision.NO_MATCH
        ));
        assertPinnedOptionsAndMessages(model.lastPrompt(), input, schema);
        assertFieldSchema(schema);
    }

    @Test
    void rejectsMalformedUnknownNullAndUnionViolationsWithoutLeakingOutput() {
        String privateMarker = "private-provider-output-marker";
        List<InvalidResponse> invalidResponses = List.of(
            new InvalidResponse(
                "{\"schemaVersion\":2",
                LlmActionContract.Output.class,
                LlmContractSchemas.actionOutput()
            ),
            new InvalidResponse(
                """
                    {"schemaVersion":2,"snapshotId":"snapshot-1","results":[],
                     "unexpected":"private-provider-output-marker"}
                    """,
                LlmActionContract.Output.class,
                LlmContractSchemas.actionOutput()
            ),
            new InvalidResponse(
                "{\"schemaVersion\":2,\"snapshotId\":null,\"results\":[]}",
                LlmActionContract.Output.class,
                LlmContractSchemas.actionOutput()
            ),
            new InvalidResponse(
                """
                    {"schemaVersion":2,"snapshotId":"snapshot-1","results":[{
                      "candidateId":"field-1","matchType":"UNKNOWN"
                    }]}
                    """,
                LlmFieldMappingContract.Output.class,
                LlmContractSchemas.fieldOutput(
                    java.util.Set.of("contact.contact.email")
                )
            ),
            new InvalidResponse(
                """
                    {"schemaVersion":2,"snapshotId":"snapshot-1","results":[{
                      "candidateId":"action-1","actionType":"ACTION",
                      "command":"ADD_REPEATABLE_GROUP",
                      "expectedEffect":"GROUP_COUNT_INCREMENT",
                      "targetSectionId":"section-target"
                    }]}
                    """,
                LlmActionContract.Output.class,
                LlmContractSchemas.actionOutput()
            )
        );

        for (InvalidResponse invalid : invalidResponses) {
            assertUnavailable(
                () -> generate(client(
                    new CapturingChatModel(invalid.json()),
                    objectMapper
                ), invalid),
                privateMarker
            );
        }
    }

    @Test
    void wrapsProviderExceptionAndMissingResponseWithoutLeakingDetails() {
        String privateMarker = "private-provider-failure-marker";
        ChatModel failingModel = prompt -> {
            throw new IllegalStateException(privateMarker);
        };
        ChatModel missingResponseModel = prompt -> new ChatResponse(List.of());

        assertUnavailable(
            () -> client(failingModel, objectMapper).generate(
                "system",
                Map.of("safe", "input"),
                LlmActionContract.Output.class,
                LlmContractSchemas.actionOutput()
            ),
            privateMarker
        );
        assertUnavailable(
            () -> client(missingResponseModel, objectMapper).generate(
                "system",
                Map.of("safe", "input"),
                LlmActionContract.Output.class,
                LlmContractSchemas.actionOutput()
            ),
            privateMarker
        );
    }

    @Test
    void leavesInputSerializationFailureAsAnUnexpectedLocalBug() {
        ChatModel model = prompt -> {
            throw new AssertionError("직렬화 실패 뒤 provider를 호출하면 안 됩니다");
        };
        OpenAiStructuredOutputClient client = client(model, new FailingObjectMapper());

        assertThatThrownBy(() -> client.generate(
            "system",
            Map.of("safe", "input"),
            LlmActionContract.Output.class,
            LlmContractSchemas.actionOutput()
        )).isInstanceOf(IllegalStateException.class)
            .hasMessage("synthetic-local-serialization-bug");
    }

    private void assertPinnedOptionsAndMessages(
        Prompt prompt,
        Object input,
        String schema
    ) {
        assertThat(prompt.getOptions()).isInstanceOf(OpenAiChatOptions.class);
        OpenAiChatOptions options = (OpenAiChatOptions) prompt.getOptions();
        assertThat(options.getModel()).isEqualTo("gpt-5.6-luna");
        assertThat(options.getReasoningEffort()).isEqualTo("none");
        assertThat(options.getMaxCompletionTokens()).isEqualTo(2048);
        assertThat(options.getStore()).isFalse();
        assertThat(options.getResponseFormat()).isNotNull();
        assertThat(options.getResponseFormat().getType())
            .isEqualTo(OpenAiChatModel.ResponseFormat.Type.JSON_SCHEMA);
        assertThat(options.getResponseFormat().getJsonSchema()).isEqualTo(schema);
        assertThat(prompt.getUserMessage().getText())
            .isEqualTo(objectMapper.writeValueAsString(input));
        assertThat(prompt.getSystemMessage().getText())
            .doesNotContain("private", "provider-output")
            .startsWith("synthetic");
    }

    private void assertActionSchema(String schemaText) {
        JsonNode root = objectMapper.readTree(schemaText);
        assertRootSchema(root);
        JsonNode branches = branches(root);
        assertThat(branches.size()).isEqualTo(3);
        assertBranch(
            branches.get(0),
            "[\"candidateId\",\"actionType\",\"command\","
                + "\"expectedEffect\",\"targetSectionId\"]"
        );
        assertThat(enumValues(branches.get(0), "actionType")).isEqualTo("[\"ACTION\"]");
        assertThat(enumValues(branches.get(0), "command"))
            .isEqualTo("[\"REVEAL_SECTION\"]");
        assertThat(enumValues(branches.get(0), "expectedEffect"))
            .isEqualTo("[\"TARGET_VISIBLE\"]");
        assertBranch(
            branches.get(1),
            "[\"candidateId\",\"actionType\",\"command\",\"expectedEffect\"]"
        );
        assertThat(enumValues(branches.get(1), "command"))
            .isEqualTo("[\"ADD_REPEATABLE_GROUP\"]");
        assertThat(enumValues(branches.get(1), "expectedEffect"))
            .isEqualTo("[\"GROUP_COUNT_INCREMENT\"]");
        assertBranch(
            branches.get(2),
            "[\"candidateId\",\"actionType\"]"
        );
        assertThat(enumValues(branches.get(2), "actionType"))
            .isEqualTo("[\"NO_ACTION\"]");
    }

    private void assertFieldSchema(String schemaText) {
        JsonNode root = objectMapper.readTree(schemaText);
        assertRootSchema(root);
        JsonNode branches = branches(root);
        assertThat(branches.size()).isEqualTo(2);
        assertBranch(
            branches.get(0),
            "[\"candidateId\",\"matchType\",\"profileFieldKey\"]"
        );
        assertThat(enumValues(branches.get(0), "matchType"))
            .isEqualTo("[\"MATCH\"]");
        assertBranch(
            branches.get(1),
            "[\"candidateId\",\"matchType\"]"
        );
        assertThat(enumValues(branches.get(1), "matchType"))
            .isEqualTo("[\"NO_MATCH\"]");
    }

    private static void assertRootSchema(JsonNode root) {
        assertThat(root.get("additionalProperties").asBoolean()).isFalse();
        assertThat(root.get("required").toString())
            .isEqualTo("[\"schemaVersion\",\"snapshotId\",\"results\"]");
        assertThat(root.toString()).doesNotContain("\"format\"");
    }

    private static JsonNode branches(JsonNode root) {
        return root.get("properties")
            .get("results")
            .get("items")
            .get("anyOf");
    }

    private static void assertBranch(JsonNode branch, String required) {
        assertThat(branch.get("additionalProperties").asBoolean()).isFalse();
        assertThat(branch.get("required").toString()).isEqualTo(required);
    }

    private static String enumValues(JsonNode branch, String property) {
        return branch.get("properties").get(property).get("enum").toString();
    }

    @SuppressWarnings({"rawtypes", "unchecked"})
    private static Object generate(
        OpenAiStructuredOutputClient client,
        InvalidResponse invalid
    ) {
        return client.generate(
            "synthetic system prompt",
            Map.of("safe", "input"),
            (Class) invalid.outputType(),
            invalid.schema()
        );
    }

    private static void assertUnavailable(Runnable call, String privateMarker) {
        assertThatThrownBy(call::run)
            .isInstanceOf(ResolverUnavailableException.class)
            .hasMessage("LLM 분석 응답 계약을 확인할 수 없습니다")
            .hasMessageNotContaining(privateMarker);
    }

    private static OpenAiStructuredOutputClient client(
        ChatModel model,
        ObjectMapper objectMapper
    ) {
        return new OpenAiStructuredOutputClient(
            ChatClient.builder(model),
            SETTINGS,
            objectMapper
        );
    }

    private static JsonMapper strictMapper() {
        return JsonMapper.builder()
            .enable(
                tools.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES,
                tools.jackson.databind.DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES,
                tools.jackson.databind.DeserializationFeature.FAIL_ON_MISSING_CREATOR_PROPERTIES,
                tools.jackson.databind.DeserializationFeature.FAIL_ON_NULL_CREATOR_PROPERTIES,
                tools.jackson.databind.DeserializationFeature.FAIL_ON_TRAILING_TOKENS
            )
            .build();
    }

    private record InvalidResponse(
        String json,
        Class<?> outputType,
        String schema
    ) {
    }

    private static final class CapturingChatModel implements ChatModel {

        private final String responseJson;
        private Prompt lastPrompt;

        private CapturingChatModel(String responseJson) {
            this.responseJson = responseJson;
        }

        @Override
        public ChatResponse call(Prompt prompt) {
            lastPrompt = prompt;
            return new ChatResponse(List.of(
                new Generation(new AssistantMessage(responseJson))
            ));
        }

        @Override
        public ChatOptions getOptions() {
            return OpenAiChatOptions.builder().build();
        }

        private Prompt lastPrompt() {
            return lastPrompt;
        }
    }

    private static final class FailingObjectMapper extends ObjectMapper {

        @Override
        public String writeValueAsString(Object value) {
            throw new IllegalStateException("synthetic-local-serialization-bug");
        }
    }
}
