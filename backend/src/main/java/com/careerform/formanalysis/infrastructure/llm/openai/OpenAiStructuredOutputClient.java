package com.careerform.formanalysis.infrastructure.llm.openai;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.openai.OpenAiChatOptions;

import com.careerform.formanalysis.application.ResolverUnavailableException;
import com.careerform.formanalysis.infrastructure.llm.LlmProviderSettings;
import com.careerform.formanalysis.infrastructure.llm.LlmStructuredOutputClient;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

public final class OpenAiStructuredOutputClient implements LlmStructuredOutputClient {

    private static final String INVALID_RESPONSE_MESSAGE =
        "LLM 분석 응답 계약을 확인할 수 없습니다";

    private final ChatClient chatClient;
    private final LlmProviderSettings settings;
    private final ObjectMapper objectMapper;

    public OpenAiStructuredOutputClient(
        ChatClient.Builder chatClientBuilder,
        LlmProviderSettings settings,
        ObjectMapper objectMapper
    ) {
        this.chatClient = chatClientBuilder.build();
        this.settings = settings;
        this.objectMapper = objectMapper;
    }

    @Override
    public <O> O generate(
        String systemPrompt,
        Object input,
        Class<O> outputType,
        String outputSchema
    ) {
        String sanitizedJson = objectMapper.writeValueAsString(input);
        try {
            StrictSchemaOutputConverter<O> converter =
                new StrictSchemaOutputConverter<>(
                    outputType,
                    strictMapper(),
                    outputSchema
                );
            O output = chatClient.prompt()
                .system(systemPrompt)
                .user(sanitizedJson)
                .options(OpenAiChatOptions.builder()
                    .model(settings.model())
                    .reasoningEffort(settings.reasoningEffort())
                    .maxCompletionTokens(settings.maxOutputTokens())
                    .store(false))
                .call()
                .entity(converter, spec -> spec.useProviderStructuredOutput());
            if (output == null) {
                throw unavailable();
            }
            return output;
        }
        catch (ResolverUnavailableException exception) {
            throw exception;
        }
        catch (RuntimeException exception) {
            throw unavailable();
        }
    }

    private static JsonMapper strictMapper() {
        return JsonMapper.builder()
            .enable(
                DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES,
                DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES,
                DeserializationFeature.FAIL_ON_MISSING_CREATOR_PROPERTIES,
                DeserializationFeature.FAIL_ON_NULL_CREATOR_PROPERTIES,
                DeserializationFeature.FAIL_ON_TRAILING_TOKENS
            )
            .build();
    }

    private static ResolverUnavailableException unavailable() {
        return new ResolverUnavailableException(INVALID_RESPONSE_MESSAGE);
    }
}
