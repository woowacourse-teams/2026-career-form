package com.careerform.llm.mapping.infrastructure.openai;

import java.util.stream.Collectors;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.openai.OpenAiChatOptions;

import com.careerform.llm.mapping.application.LlmUpstreamException;
import com.careerform.llm.mapping.application.MappingModelClient;
import com.careerform.llm.mapping.domain.LlmMappingRequest;
import com.careerform.llm.mapping.domain.LlmMappingResponse;
import com.careerform.llm.mapping.domain.ProfileFieldKeys;

import tools.jackson.databind.ObjectMapper;

public final class OpenAiMappingModelClient implements MappingModelClient {

    private static final String UPSTREAM_ERROR = "LLM 매핑 응답 계약을 확인할 수 없습니다";

    private final ChatClient chatClient;
    private final LlmProviderSettings settings;
    private final ObjectMapper objectMapper;

    public OpenAiMappingModelClient(
        ChatClient.Builder chatClientBuilder,
        LlmProviderSettings settings,
        ObjectMapper objectMapper
    ) {
        this.chatClient = chatClientBuilder.build();
        this.settings = settings;
        this.objectMapper = objectMapper;
    }

    @Override
    public LlmMappingResponse map(LlmMappingRequest request) {
        try {
            LlmMappingResponse response = chatClient.prompt()
                .system(systemPrompt())
                .user(objectMapper.writeValueAsString(request))
                .options(OpenAiChatOptions.builder()
                    .model(settings.model())
                    .reasoningEffort(settings.reasoningEffort())
                    .maxCompletionTokens(settings.maxOutputTokens())
                    .store(false))
                .call()
                .entity(
                    LlmMappingResponse.class,
                    spec -> spec.useProviderStructuredOutput()
                );
            if (response == null) {
                throw new LlmUpstreamException(UPSTREAM_ERROR);
            }
            return response;
        }
        catch (LlmUpstreamException exception) {
            throw exception;
        }
        catch (RuntimeException exception) {
            throw new LlmUpstreamException(UPSTREAM_ERROR, exception);
        }
    }

    private static String systemPrompt() {
        String allowedKeys = ProfileFieldKeys.values().stream()
            .sorted()
            .collect(Collectors.joining(", "));
        return """
            You map anonymized form-field metadata to supported profile field keys.
            Return every target field exactly once and never return a context field ID.
            Use NO_MATCH when the metadata is insufficient or no allowed key applies.
            Report confidence as a finite number from 0.0 through 1.0.
            Allowed profile field keys: %s
            """.formatted(allowedKeys);
    }
}
