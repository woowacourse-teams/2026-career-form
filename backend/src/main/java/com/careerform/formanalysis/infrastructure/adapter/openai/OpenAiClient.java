package com.careerform.formanalysis.infrastructure.adapter.openai;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.converter.BeanOutputConverter;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.ai.util.JacksonUtils;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.annotation.JsonSetter;
import com.fasterxml.jackson.annotation.Nulls;

import com.careerform.formanalysis.exception.ResolverException;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

@Component
@ConditionalOnProperty(
    prefix = "career-form.llm",
    name = "enabled",
    havingValue = "true"
)
public final class OpenAiClient {

    private static final String INVALID_RESPONSE_MESSAGE =
        "LLM 분석 응답 계약을 확인할 수 없습니다";

    private final ChatClient chatClient;
    private final ObjectMapper objectMapper;

    public OpenAiClient(
        ChatClient.Builder chatClientBuilder,
        ObjectMapper objectMapper
    ) {
        this.chatClient = chatClientBuilder.build();
        this.objectMapper = objectMapper;
    }

    public <O> O generate(
        String systemPrompt,
        Object input,
        Class<O> outputType
    ) {
        String sanitizedJson = objectMapper.writeValueAsString(input);
        try {
            BeanOutputConverter<O> converter = new BeanOutputConverter<>(
                outputType,
                strictMapper()
            );
            O output = chatClient.prompt()
                .system(systemPrompt)
                .user(sanitizedJson)
                .options(OpenAiChatOptions.builder().store(false))
                .call()
                .entity(converter, spec -> spec.useProviderStructuredOutput());
            if (output == null) {
                throw unavailable();
            }
            return output;
        }
        catch (ResolverException exception) {
            throw exception;
        }
        catch (RuntimeException exception) {
            throw unavailable();
        }
    }

    private static JsonMapper strictMapper() {
        return JsonMapper.builder()
            .addModules(JacksonUtils.instantiateAvailableModules())
            .changeDefaultNullHandling(ignored -> JsonSetter.Value.forValueNulls(
                Nulls.FAIL,
                Nulls.FAIL
            ))
            .enable(
                DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES,
                DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES,
                DeserializationFeature.FAIL_ON_MISSING_CREATOR_PROPERTIES,
                DeserializationFeature.FAIL_ON_NULL_CREATOR_PROPERTIES,
                DeserializationFeature.FAIL_ON_TRAILING_TOKENS
            )
            .build();
    }

    private static ResolverException unavailable() {
        return new ResolverException(INVALID_RESPONSE_MESSAGE);
    }
}
