package com.careerform.formanalysis.infrastructure.adapter.openai;

import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.function.UnaryOperator;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.converter.BeanOutputConverter;
import org.springframework.ai.converter.StructuredOutputConverter;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.ai.util.JacksonUtils;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.annotation.JsonSetter;
import com.fasterxml.jackson.annotation.Nulls;

import com.careerform.formanalysis.exception.ResolverException;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.MapperFeature;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.cfg.CoercionAction;
import tools.jackson.databind.cfg.CoercionInputShape;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.type.LogicalType;

@Component
@ConditionalOnProperty(
    prefix = "career-form.llm",
    name = "enabled",
    havingValue = "true"
)
public final class OpenAiClient {

    private static final String INVALID_RESPONSE_MESSAGE =
        "LLM 분석 응답 계약을 확인할 수 없습니다";
    private static final Logger log = LoggerFactory.getLogger(OpenAiClient.class);

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
        return generate(
            systemPrompt,
            input,
            outputType,
            UnaryOperator.identity()
        );
    }

    public <O> O generate(
        String systemPrompt,
        Object input,
        Class<O> outputType,
        UnaryOperator<String> jsonSchemaCustomizer
    ) {
        String sanitizedJson = objectMapper.writeValueAsString(input);
        long startedAt = System.nanoTime();
        log.info("LLM 호출 시작 outputType={}", outputType.getSimpleName());
        try {
            BeanOutputConverter<O> delegate = new BeanOutputConverter<>(
                outputType,
                strictMapper()
            );
            StructuredOutputConverter<O> converter = new SchemaOutputConverter<>(
                delegate,
                jsonSchemaCustomizer.apply(delegate.getJsonSchema())
            );
            O output = chatClient.prompt()
                .system(systemPrompt)
                .user(sanitizedJson)
                .options(OpenAiChatOptions.builder().store(true))
                .call()
                .entity(converter, spec -> spec.useProviderStructuredOutput());
            if (output == null) {
                throw unavailable();
            }
            log.info(
                "LLM 호출 성공 outputType={} durationMs={}",
                outputType.getSimpleName(),
                elapsedMillis(startedAt)
            );
            return output;
        }
        catch (ResolverException exception) {
            logFailure(outputType, startedAt, exception);
            throw exception;
        }
        catch (RuntimeException exception) {
            logFailure(outputType, startedAt, exception);
            throw unavailable();
        }
    }

    private static void logFailure(
        Class<?> outputType,
        long startedAt,
        RuntimeException exception
    ) {
        log.warn(
            "LLM 호출 실패 outputType={} durationMs={} failure={} diagnostic={}",
            outputType.getSimpleName(),
            elapsedMillis(startedAt),
            exception.getClass().getSimpleName(),
            classifyFailure(exception)
        );
    }

    private static FailureDiagnostic classifyFailure(Throwable exception) {
        Set<Throwable> visited = Collections.newSetFromMap(
            new IdentityHashMap<>()
        );
        boolean badRequestSeen = false;
        for (
            Throwable current = exception;
            current != null && visited.add(current);
            current = current.getCause()
        ) {
            String message = current.getMessage();
            if (message != null) {
                String normalized = message.toLowerCase(Locale.ROOT);
                if (normalized.contains("additionalproperties")
                    || normalized.contains("additional properties")) {
                    return FailureDiagnostic.ADDITIONAL_PROPERTIES;
                }
                if (normalized.contains("must have a 'type' key")
                    || normalized.contains("must have a \"type\" key")
                    || normalized.contains("missing type")) {
                    return FailureDiagnostic.MISSING_TYPE;
                }
                if (normalized.contains("required property")
                    || normalized.contains("required properties")
                    || normalized.contains("required field")
                    || (normalized.contains("'required'")
                        && normalized.contains("properties"))) {
                    return FailureDiagnostic.REQUIRED_PROPERTY;
                }
                if (normalized.contains("unsupported parameter")
                    || normalized.contains("unknown parameter")) {
                    return FailureDiagnostic.UNSUPPORTED_PARAMETER;
                }
                if (normalized.contains("invalid schema")
                    || normalized.contains("invalid json schema")
                    || normalized.contains("schema for response_format")) {
                    return FailureDiagnostic.INVALID_SCHEMA;
                }
            }
            if (current.getClass().getName().equals(
                "com.openai.errors.BadRequestException"
            )) {
                badRequestSeen = true;
            }
        }
        return badRequestSeen
            ? FailureDiagnostic.BAD_REQUEST
            : FailureDiagnostic.UNCLASSIFIED;
    }

    private static long elapsedMillis(long startedAt) {
        return TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt);
    }

    private static JsonMapper strictMapper() {
        return JsonMapper.builder()
            .addModules(JacksonUtils.instantiateAvailableModules())
            .disable(MapperFeature.ALLOW_COERCION_OF_SCALARS)
            .disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT)
            .withCoercionConfig(LogicalType.Textual, config -> {
                config.setCoercion(CoercionInputShape.Integer, CoercionAction.Fail);
                config.setCoercion(CoercionInputShape.Float, CoercionAction.Fail);
                config.setCoercion(CoercionInputShape.Boolean, CoercionAction.Fail);
            })
            .changeDefaultNullHandling(ignored -> JsonSetter.Value.forValueNulls(
                Nulls.FAIL,
                Nulls.FAIL
            ))
            .enable(
                DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES,
                DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES,
                DeserializationFeature.FAIL_ON_TRAILING_TOKENS
            )
            .build();
    }

    private static ResolverException unavailable() {
        return new ResolverException(INVALID_RESPONSE_MESSAGE);
    }

    private enum FailureDiagnostic {
        INVALID_SCHEMA,
        MISSING_TYPE,
        REQUIRED_PROPERTY,
        ADDITIONAL_PROPERTIES,
        UNSUPPORTED_PARAMETER,
        BAD_REQUEST,
        UNCLASSIFIED
    }

    private record SchemaOutputConverter<O>(
        BeanOutputConverter<O> delegate,
        String jsonSchema
    ) implements StructuredOutputConverter<O> {

        @Override
        public O convert(String source) {
            return delegate.convert(source);
        }

        @Override
        public String getFormat() {
            return delegate.getFormat().replace(delegate.getJsonSchema(), jsonSchema);
        }

        @Override
        public String getJsonSchema() {
            return jsonSchema;
        }
    }
}
