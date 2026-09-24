package com.careerform.formanalysis.infrastructure.adapter.openai;

import java.net.ConnectException;
import java.net.SocketException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import javax.net.ssl.SSLException;
import java.util.function.UnaryOperator;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.metadata.EmptyUsage;
import org.springframework.ai.chat.metadata.Usage;
import org.springframework.ai.converter.BeanOutputConverter;
import org.springframework.ai.converter.StructuredOutputConverter;
import org.springframework.ai.openai.OpenAiChatModel.ResponseFormat;
import org.springframework.ai.openai.OpenAiChatModel.ResponseFormat.Type;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.ai.util.JacksonUtils;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Conditional;
import com.careerform.formanalysis.infrastructure.SelectedOpenAi;
import org.springframework.stereotype.Component;

import com.openai.errors.OpenAIIoException;
import com.openai.errors.OpenAIInvalidDataException;
import com.fasterxml.jackson.annotation.JsonSetter;
import com.fasterxml.jackson.annotation.Nulls;

import com.careerform.formanalysis.exception.ResolverException;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.MapperFeature;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.cfg.CoercionAction;
import tools.jackson.databind.cfg.CoercionInputShape;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.type.LogicalType;

@Component
@Conditional(SelectedOpenAi.class)
public final class OpenAiClient {

    private static final String INVALID_RESPONSE_MESSAGE =
        "LLM 분석 응답 계약을 확인할 수 없습니다";
    private static final Logger log = LoggerFactory.getLogger(OpenAiClient.class);

    private final ChatClient chatClient;
    private final ChatClient interactionChatClient;
    private final ObjectMapper objectMapper;

    public OpenAiClient(
        ChatClient.Builder chatClientBuilder,
        ObjectMapper objectMapper
    ) {
        this(chatClientBuilder, objectMapper, (ChatClient) null);
    }

    @Autowired
    public OpenAiClient(
        ChatClient.Builder chatClientBuilder,
        ObjectMapper objectMapper,
        @Qualifier(OpenAiInteractionChatClientConfiguration.INTERACTION_CHAT_CLIENT)
        ObjectProvider<ChatClient> interactionChatClient
    ) {
        this(
            chatClientBuilder,
            objectMapper,
            interactionChatClient.getObject()
        );
    }

    private OpenAiClient(
        ChatClient.Builder chatClientBuilder,
        ObjectMapper objectMapper,
        ChatClient interactionChatClient
    ) {
        this.chatClient = chatClientBuilder.build();
        this.interactionChatClient = interactionChatClient == null
            ? this.chatClient
            : interactionChatClient;
        this.objectMapper = objectMapper;
    }

    public <O> O generate(
        String systemPrompt,
        Object input,
        Class<O> outputType
    ) {
        return generate(systemPrompt, input, outputType, UnaryOperator.identity(), false);
    }

    public <O> O generateInteraction(
        String systemPrompt,
        Object input,
        Class<O> outputType
    ) {
        return generate(systemPrompt, input, outputType, UnaryOperator.identity(), true);
    }

    public <O> O generate(
        String systemPrompt,
        Object input,
        Class<O> outputType,
        UnaryOperator<String> jsonSchemaCustomizer
    ) {
        return generate(systemPrompt, input, outputType, jsonSchemaCustomizer, false);
    }

    private <O> O generate(
        String systemPrompt,
        Object input,
        Class<O> outputType,
        UnaryOperator<String> jsonSchemaCustomizer,
        boolean interaction
    ) {
        String sanitizedJson = objectMapper.writeValueAsString(input);
        String stage = stage(outputType, interaction);
        long startedAt = System.nanoTime();
        log.info("LLM 호출 시작 stage={} outputType={}", stage, outputType.getSimpleName());
        try {
            BeanOutputConverter<O> delegate = new BeanOutputConverter<>(
                outputType,
                strictMapper()
            );
            StructuredOutputConverter<O> converter = new SchemaOutputConverter<>(
                delegate,
                jsonSchemaCustomizer.apply(delegate.getJsonSchema())
            );
            ChatClient selectedChatClient = interaction
                ? interactionChatClient
                : chatClient;
            ChatResponse response = selectedChatClient.prompt()
                .system(systemPrompt)
                .user(sanitizedJson)
                .options(interaction
                    ? OpenAiChatOptions.builder()
                        .store(true)
                        .responseFormat(responseFormat(converter))
                        .timeout(Duration.ofSeconds(8))
                        .maxRetries(0)
                    : OpenAiChatOptions.builder()
                        .store(true)
                        .responseFormat(responseFormat(converter)))
                .call()
                .chatResponse();
            logResponseMetadata(stage, outputType, response);
            if (response != null && response.hasFinishReasons(Set.of("length"))) {
                throw outputLengthLimit();
            }
            O output = strictMapper().readValue(responseText(response), outputType);
            if (output == null) {
                throw new InvalidResponseFormatException();
            }
            log.info(
                "LLM 호출 성공 stage={} outputType={} durationMs={}",
                stage,
                outputType.getSimpleName(),
                elapsedMillis(startedAt)
            );
            return output;
        }
        catch (ResolverException exception) {
            logFailure(stage, outputType, startedAt, exception);
            throw exception;
        }
        catch (RuntimeException exception) {
            logFailure(stage, outputType, startedAt, exception);
            throw unavailable();
        }
    }

    private static void logFailure(
        String stage,
        Class<?> outputType,
        long startedAt,
        RuntimeException exception
    ) {
        log.warn(
            "LLM 호출 실패 stage={} outputType={} durationMs={} failure={} diagnostic={}",
            stage,
            outputType.getSimpleName(),
            elapsedMillis(startedAt),
            exception.getClass().getSimpleName(),
            classifyFailure(exception)
        );
    }

    private static FailureDiagnostic classifyFailure(Throwable exception) {
        Set<Throwable> visited = Collections.newSetFromMap(new IdentityHashMap<>());
        boolean badRequestSeen = false;
        boolean networkSeen = false;
        boolean invalidDataSeen = false;
        FailureDiagnostic schemaDiagnostic = null;
        for (
            Throwable current = exception;
            current != null && visited.add(current);
            current = current.getCause()
        ) {
            if (current instanceof OutputLengthLimitException) {
                return FailureDiagnostic.OUTPUT_LENGTH_LIMIT;
            }
            if (current instanceof SocketTimeoutException
                || current instanceof HttpTimeoutException
                || current instanceof TimeoutException) {
                return FailureDiagnostic.TIMEOUT;
            }
            if (current instanceof OpenAIIoException
                || current instanceof ConnectException
                || current instanceof UnknownHostException
                || current instanceof SocketException
                || current instanceof SSLException) {
                networkSeen = true;
            }
            if (current instanceof OpenAIInvalidDataException
                || current instanceof JacksonException
                || current instanceof InvalidResponseFormatException) {
                invalidDataSeen = true;
            }
            FailureDiagnostic detectedSchema = schemaDiagnostic(current.getMessage());
            if (detectedSchema != null) {
                schemaDiagnostic = detectedSchema;
            }
            if (current.getClass().getName().equals(
                "com.openai.errors.BadRequestException"
            )) {
                badRequestSeen = true;
            }
        }
        if (networkSeen) {
            return FailureDiagnostic.CONNECTION_NETWORK;
        }
        if (schemaDiagnostic != null) {
            return schemaDiagnostic;
        }
        if (invalidDataSeen) {
            return FailureDiagnostic.INVALID_RESPONSE_DATA;
        }
        return badRequestSeen
            ? FailureDiagnostic.BAD_REQUEST
            : FailureDiagnostic.UNCLASSIFIED;
    }

    private static FailureDiagnostic schemaDiagnostic(String message) {
        if (message == null) {
            return null;
        }
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
            || (normalized.contains("'required'") && normalized.contains("properties"))) {
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
        return null;
    }

    private static String stage(Class<?> outputType, boolean interaction) {
        if (interaction) {
            return "INTERACTION";
        }
        return switch (outputType.getSimpleName()) {
            case "ActionOutput" -> "PREPARATION";
            case "FieldOutput" -> "FIELD";
            default -> "ANALYSIS";
        };
    }

    private static void logResponseMetadata(
        String stage,
        Class<?> outputType,
        ChatResponse response
    ) {
        if (response == null) {
            return;
        }
        String finishReason = response.getResults().stream()
            .map(generation -> generation.getMetadata().getFinishReason())
            .filter(reason -> reason != null)
            .map(OpenAiClient::safeFinishReason)
            .findFirst()
            .orElse("NONE");
        Usage usage = response.getMetadata() == null
            ? null
            : response.getMetadata().getUsage();
        if (usage == null || usage instanceof EmptyUsage) {
            log.info(
                "LLM 응답 메타데이터 stage={} outputType={} finishReason={}",
                stage,
                outputType.getSimpleName(),
                finishReason
            );
            return;
        }
        Map<String, Integer> numericUsage = new LinkedHashMap<>();
        if (usage.getPromptTokens() != null) {
            numericUsage.put("promptTokens", usage.getPromptTokens());
        }
        if (usage.getCompletionTokens() != null) {
            numericUsage.put("completionTokens", usage.getCompletionTokens());
        }
        if (usage.getTotalTokens() != null) {
            numericUsage.put("totalTokens", usage.getTotalTokens());
        }
        log.info(
            "LLM 응답 메타데이터 stage={} outputType={} finishReason={} usage={}",
            stage,
            outputType.getSimpleName(),
            finishReason,
            numericUsage
        );
    }

    private static String safeFinishReason(String finishReason) {
        return switch (finishReason) {
            case "length" -> "LENGTH";
            case "stop" -> "STOP";
            case "tool_calls" -> "TOOL_CALLS";
            case "content_filter" -> "CONTENT_FILTER";
            default -> "OTHER";
        };
    }

    private static String responseText(ChatResponse response) {
        if (response == null || response.getResults() == null
            || response.getResults().isEmpty()
            || response.getResults().getFirst().getOutput() == null
            || response.getResults().getFirst().getOutput().getText() == null) {
            throw new InvalidResponseFormatException();
        }
        return response.getResults().getFirst().getOutput().getText();
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

    private static ResponseFormat responseFormat(
        StructuredOutputConverter<?> converter
    ) {
        return ResponseFormat.builder()
            .type(Type.JSON_SCHEMA)
            .jsonSchema(converter.getJsonSchema())
            .build();
    }

    private static ResolverException unavailable() {
        return new ResolverException(INVALID_RESPONSE_MESSAGE);
    }

    private static RuntimeException outputLengthLimit() {
        return new OutputLengthLimitException();
    }

    private static final class OutputLengthLimitException extends RuntimeException {
    }

    private static final class InvalidResponseFormatException extends RuntimeException {
    }

    private enum FailureDiagnostic {
        INVALID_SCHEMA,
        MISSING_TYPE,
        REQUIRED_PROPERTY,
        ADDITIONAL_PROPERTIES,
        UNSUPPORTED_PARAMETER,
        BAD_REQUEST,
        TIMEOUT,
        CONNECTION_NETWORK,
        OUTPUT_LENGTH_LIMIT,
        INVALID_RESPONSE_DATA,
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
