package com.careerform.llm.mapping.infrastructure.openai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;

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

import com.careerform.llm.mapping.application.LlmUpstreamException;
import com.careerform.llm.mapping.domain.LlmMappingRequest;
import com.careerform.llm.mapping.domain.LlmMappingResponse;

import tools.jackson.databind.ObjectMapper;

class OpenAiMappingModelClientTest {

    private static final String RESPONSE_JSON = """
        {
          "schemaVersion": 1,
          "mappings": [{
            "targetFieldId": "target-1",
            "profileFieldKey": "NO_MATCH",
            "confidence": 0.4
          }]
        }
        """;

    @Test
    void usesNativeSchemaAndPinnedOpenAiOptions() throws Exception {
        CapturingChatModel chatModel = new CapturingChatModel(RESPONSE_JSON);
        ObjectMapper objectMapper = new ObjectMapper();
        OpenAiMappingModelClient client = new OpenAiMappingModelClient(
            ChatClient.builder(chatModel),
            new LlmProviderSettings("gpt-5.6-luna", "none", 2048),
            objectMapper
        );
        LlmMappingRequest request = singleTargetRequest();

        LlmMappingResponse response = client.map(request);

        assertThat(response).isEqualTo(new LlmMappingResponse(1, List.of(
            new LlmMappingResponse.Mapping("target-1", "NO_MATCH", 0.4)
        )));
        assertThat(chatModel.lastPrompt().getOptions())
            .isInstanceOf(OpenAiChatOptions.class);
        OpenAiChatOptions options = (OpenAiChatOptions) chatModel.lastPrompt().getOptions();
        assertThat(options.getModel()).isEqualTo("gpt-5.6-luna");
        assertThat(options.getReasoningEffort()).isEqualTo("none");
        assertThat(options.getMaxCompletionTokens()).isEqualTo(2048);
        assertThat(options.getStore()).isFalse();
        assertThat(options.getResponseFormat()).isNotNull();
        assertThat(options.getResponseFormat().getType())
            .isEqualTo(OpenAiChatModel.ResponseFormat.Type.JSON_SCHEMA);
        assertThat(options.getResponseFormat().getJsonSchema())
            .contains("schemaVersion", "mappings", "targetFieldId", "profileFieldKey");
        assertThat(chatModel.lastPrompt().getUserMessage().getText())
            .isEqualTo(objectMapper.writeValueAsString(request));
        assertThat(chatModel.lastPrompt().getSystemMessage().getText())
            .contains("NO_MATCH", "contact.email", "health.healthDetails");
    }

    @Test
    void wrapsModelFailuresWithoutExposingProviderDetails() {
        String privateDetail = "provider-private-response";
        ChatModel failingModel = prompt -> {
            throw new IllegalStateException(privateDetail);
        };
        OpenAiMappingModelClient client = new OpenAiMappingModelClient(
            ChatClient.builder(failingModel),
            new LlmProviderSettings("gpt-5.6-luna", "none", 2048),
            new ObjectMapper()
        );

        assertThatThrownBy(() -> client.map(singleTargetRequest()))
            .isInstanceOf(LlmUpstreamException.class)
            .hasMessage("LLM 매핑 응답 계약을 확인할 수 없습니다")
            .hasMessageNotContaining(privateDetail);
    }

    private static LlmMappingRequest singleTargetRequest() {
        return new LlmMappingRequest(
            List.of(new LlmMappingRequest.ContextField(
                "context-1",
                "input",
                "text",
                "known-email",
                "email",
                "이메일",
                true,
                "contact.email"
            )),
            List.of(new LlmMappingRequest.TargetField(
                "target-1",
                "input",
                "text",
                "unknown-field",
                "contact-field",
                "연락 항목",
                true
            ))
        );
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

        Prompt lastPrompt() {
            return lastPrompt;
        }
    }
}
