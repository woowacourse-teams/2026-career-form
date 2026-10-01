package com.careerform.formanalysis.infrastructure.adapter.openai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.net.ConnectException;
import java.net.SocketException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeoutException;

import javax.net.ssl.SSLException;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.metadata.ChatGenerationMetadata;
import org.springframework.ai.chat.metadata.ChatResponseMetadata;
import org.springframework.ai.chat.metadata.Usage;
import org.springframework.ai.chat.prompt.ChatOptions;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.openai.errors.OpenAIIoException;
import com.openai.errors.OpenAIInvalidDataException;
import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.application.port.ActionResolver;
import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.exception.ResolverException;
import com.careerform.formanalysis.infrastructure.adapter.openai.OpenAiActionResolver.ActionOutput;
import com.careerform.formanalysis.infrastructure.adapter.openai.OpenAiFieldMappingResolver.FieldOutput;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

@DisplayName("OpenAI 클라이언트")
@ExtendWith(OutputCaptureExtension.class)
class OpenAiClientTest {

    private static final String SAFE_FAILURE_MESSAGE =
        "LLM 분석 응답 계약을 확인할 수 없습니다";

    @Test
    @DisplayName("알 수 없거나 누락되거나 null이거나 뒤에 값이 붙은 응답을 거부한다")
    void rejectsEveryNonStrictResponse() {
        List<String> invalidResponses = List.of(
            "{\"schemaVersion\":2",
            """
                {"schemaVersion":2,"snapshotId":"snapshot-1","results":[],
                 "unexpected":"private-provider-output-marker"}
                """,
            "{\"schemaVersion\":2,\"snapshotId\":\"snapshot-1\"}",
            "{\"schemaVersion\":2,\"snapshotId\":null,\"results\":[]}",
            "{\"schemaVersion\":2,\"snapshotId\":\"snapshot-1\",\"results\":[null]}",
            """
                {"schemaVersion":2,"snapshotId":"snapshot-1","results":[]}
                {"trailing":"private-provider-output-marker"}
                """
        );

        for (String response : invalidResponses) {
            OpenAiClient client = client(prompt -> response(response));

            assertThatThrownBy(() -> client.generate(
                "synthetic system prompt",
                new Input("safe-input"),
                StrictOutput.class
            )).isInstanceOf(ResolverException.class)
                .hasMessage(SAFE_FAILURE_MESSAGE)
                .hasMessageNotContaining("private-provider-output-marker");
        }
    }

    @Test
    @DisplayName("액션과 필드 출력에서 JSON 기본 타입 자동 변환을 거부한다")
    void rejectsScalarCoercionForBothOutputs() {
        assertInvalidResponse(
            "{\"schemaVersion\":\"2\",\"snapshotId\":\"snapshot-1\","
                + "\"revealSections\":[],\"addRepeatableGroups\":[],\"noActions\":[]}",
            ActionOutput.class
        );
        assertInvalidResponse(
            "{\"schemaVersion\":2.5,\"snapshotId\":\"snapshot-1\","
                + "\"revealSections\":[],\"addRepeatableGroups\":[],\"noActions\":[]}",
            ActionOutput.class
        );
        assertInvalidResponse(
            "{\"schemaVersion\":2,\"snapshotId\":42,"
                + "\"matches\":[]}",
            FieldOutput.class
        );
        assertInvalidResponse(
            "{\"schemaVersion\":2,\"snapshotId\":\"snapshot-1\","
                + "\"matches\":[{\"candidateId\":42,"
                + "\"profileFieldKey\":\"contact.contact.email\"}]}",
            FieldOutput.class
        );
    }

    @Test
    @DisplayName("성공한 LLM 호출의 시작과 완료를 원문 없이 기록한다")
    void logsSuccessfulCallWithoutPromptOrResponse(CapturedOutput output) {
        OpenAiClient client = client(prompt -> response(
            "{\"schemaVersion\":2,\"snapshotId\":\"private-output-marker\",\"results\":[]}"
        ));

        client.generate(
            "private-system-prompt-marker",
            new Input("private-input-marker"),
            StrictOutput.class
        );

        assertThat(output).contains("LLM 호출 시작")
            .contains("LLM 호출 성공")
            .doesNotContain("private-system-prompt-marker")
            .doesNotContain("private-input-marker")
            .doesNotContain("private-output-marker");
    }

    @Test
    @DisplayName("공급자 실패 상세를 외부로 노출하지 않는다")
    void hidesProviderFailureDetails(CapturedOutput output) {
        String privateMarker = "private-provider-failure-marker";
        OpenAiClient client = client(prompt -> {
            throw new IllegalStateException(privateMarker);
        });

        assertThatThrownBy(() -> client.generate(
            "synthetic system prompt",
            new Input("safe-input"),
            StrictOutput.class
        )).isInstanceOf(ResolverException.class)
            .hasMessage(SAFE_FAILURE_MESSAGE)
            .hasMessageNotContaining(privateMarker);
        assertThat(output).contains("LLM 호출 시작")
            .contains("LLM 호출 실패")
            .doesNotContain(privateMarker);
    }

    @Test
    @DisplayName("LLM 기능을 켠 경우에만 OpenAI 해석기 빈을 등록한다")
    void activatesResolversOnlyWhenEnabled() {
        ApplicationContextRunner runner = new ApplicationContextRunner()
            .withUserConfiguration(
                OpenAiClient.class,
                OpenAiActionResolver.class,
                OpenAiFieldMappingResolver.class,
                TestDependencies.class
            );

        runner.withPropertyValues("career-form.llm.enabled=false")
            .run(context -> {
                assertThat(context).doesNotHaveBean(OpenAiClient.class);
                assertThat(context).doesNotHaveBean(ActionResolver.class);
                assertThat(context).doesNotHaveBean(FieldMappingResolver.class);
            });
        runner.withPropertyValues("career-form.llm.enabled=true")
            .run(context -> {
                assertThat(context).hasSingleBean(OpenAiClient.class);
                assertThat(context).hasSingleBean(ActionResolver.class);
                assertThat(context).hasSingleBean(FieldMappingResolver.class);
            });
    }

    @Test
    @DisplayName("상호작용 요청에만 8초 무재시도 예산을 적용한다")
    void appliesFixedInteractionBudgetWithoutChangingAnalysisBudget() {
        CapturingChatModel model = new CapturingChatModel(response("{\"schemaVersion\":2,\"snapshotId\":\"synthetic\",\"results\":[]}"));
        OpenAiClient client = client(model);

        client.generate("synthetic", new Input("safe"), StrictOutput.class);
        OpenAiChatOptions analysisOptions = (OpenAiChatOptions) model.prompt.getOptions();
        assertThat(analysisOptions.getTimeout()).isNotEqualTo(Duration.ofSeconds(8));
        assertThat(analysisOptions.getResponseFormat().getJsonSchema()).isNotBlank();

        client.generateInteraction("synthetic", new Input("safe"), StrictOutput.class);
        OpenAiChatOptions interactionOptions = (OpenAiChatOptions) model.prompt.getOptions();
        assertThat(interactionOptions.getTimeout()).isEqualTo(Duration.ofSeconds(8));
        assertThat(interactionOptions.getMaxRetries()).isZero();
        assertThat(interactionOptions.getStore()).isTrue();
        assertThat(interactionOptions.getResponseFormat().getJsonSchema()).isNotBlank();
    }

    @Test
    @DisplayName("명시적인 length 종료는 유효 JSON도 파싱 전에 실패로 처리한다")
    void rejectsLengthFinishReasonBeforeParsing(CapturedOutput output) {
        ChatResponse lengthResponse = new ChatResponse(List.of(new Generation(
            new AssistantMessage("{\"schemaVersion\":2,\"snapshotId\":\"synthetic\",\"results\":[]}"),
            ChatGenerationMetadata.builder().finishReason("length").build()
        )));

        assertThatThrownBy(() -> client(prompt -> lengthResponse).generate(
            "synthetic", new Input("safe"), StrictOutput.class
        )).isInstanceOf(ResolverException.class).hasMessage(SAFE_FAILURE_MESSAGE);
        assertThat(output).contains("diagnostic=OUTPUT_LENGTH_LIMIT");
    }

    @Test
    @DisplayName("타임아웃과 연결 실패를 안전한 진단으로 구분한다")
    void classifiesTimeoutBeforeNetworkAndKeepsFailureDetailsPrivate(CapturedOutput output) {
        OpenAiClient timeoutClient = client(prompt -> {
            throw new RuntimeException(new TimeoutException("private-timeout"));
        });
        OpenAiClient networkClient = client(prompt -> {
            throw new RuntimeException(new ConnectException("private-network"));
        });

        assertThatThrownBy(() -> timeoutClient.generate("synthetic", new Input("safe"), StrictOutput.class))
            .isInstanceOf(ResolverException.class);
        assertThatThrownBy(() -> networkClient.generate("synthetic", new Input("safe"), StrictOutput.class))
            .isInstanceOf(ResolverException.class);
        assertThat(output).contains("diagnostic=TIMEOUT")
            .contains("diagnostic=CONNECTION_NETWORK")
            .doesNotContain("private-timeout")
            .doesNotContain("private-network");
    }

    @Test
    @DisplayName("SDK IO 오류와 중첩된 타임아웃을 타입으로 분류한다")
    void classifiesTypedIoFailuresWithTimeoutPrecedence(CapturedOutput output) {
        OpenAiClient ioClient = client(prompt -> {
            throw new OpenAIIoException("private-io");
        });
        OpenAiClient timeoutClient = client(prompt -> {
            throw new OpenAIIoException("private-timeout", new SocketTimeoutException());
        });

        assertThatThrownBy(() -> ioClient.generate("synthetic", new Input("safe"), StrictOutput.class))
            .isInstanceOf(ResolverException.class);
        assertThatThrownBy(() -> timeoutClient.generate("synthetic", new Input("safe"), StrictOutput.class))
            .isInstanceOf(ResolverException.class);

        assertThat(output).contains("diagnostic=CONNECTION_NETWORK")
            .contains("diagnostic=TIMEOUT")
            .doesNotContain("private-io")
            .doesNotContain("private-timeout");
    }

    @Test
    @DisplayName("준비와 필드 분석은 outputType에 따라 안전한 stage를 기록한다")
    void logsPreparationAndFieldStagesFromKnownOutputTypes(CapturedOutput output) {
        OpenAiClient preparationClient = client(prompt -> response(
            "{\"schemaVersion\":2,\"snapshotId\":\"synthetic\",\"revealSections\":[],\"addRepeatableGroups\":[],\"noActions\":[]}"
        ));
        OpenAiClient fieldClient = client(prompt -> response(
            "{\"schemaVersion\":2,\"snapshotId\":\"synthetic\",\"matches\":[]}"
        ));

        preparationClient.generate("synthetic", new Input("safe"), ActionOutput.class);
        fieldClient.generate("synthetic", new Input("safe"), FieldOutput.class);

        assertThat(output).contains("stage=PREPARATION")
            .contains("stage=FIELD");
    }

    @Test
    @DisplayName("순환 cause chain에서도 중첩 timeout이 schema 메시지보다 우선한다")
    void classifiesCyclicCauseChainWithTimeoutPrecedence(CapturedOutput output) {
        RuntimeException schemaWrapper = new RuntimeException("invalid schema");
        SocketTimeoutException timeout = new SocketTimeoutException();
        schemaWrapper.initCause(timeout);
        timeout.initCause(schemaWrapper);
        OpenAiClient client = client(prompt -> {
            throw schemaWrapper;
        });

        assertThatThrownBy(() -> client.generate("synthetic", new Input("safe"), StrictOutput.class))
            .isInstanceOf(ResolverException.class);

        assertThat(output).contains("diagnostic=TIMEOUT")
            .doesNotContain("diagnostic=INVALID_SCHEMA");
    }

    @Test
    @DisplayName("응답 메타데이터의 안전한 종료 사유와 제공 토큰만 기록한다")
    void logsAllowedFinishReasonAndProvidedUsageWithoutResponseText(CapturedOutput output) {
        ChatResponse response = response(
            "{\"schemaVersion\":2,\"snapshotId\":\"private-response\",\"results\":[]}",
            "stop",
            new FixedUsage(3, 5)
        );

        client(prompt -> response).generate("private-prompt", new Input("private-input"), StrictOutput.class);

        assertThat(output).contains("stage=ANALYSIS")
            .contains("finishReason=STOP")
            .contains("promptTokens=3")
            .contains("completionTokens=5")
            .doesNotContain("private-prompt")
            .doesNotContain("private-input")
            .doesNotContain("private-response");
    }

    @Test
    @DisplayName("알 수 없는 종료 사유와 누락 usage를 원문이나 0으로 기록하지 않는다")
    void logsUnknownFinishReasonAsOtherWithoutInventingUsage(CapturedOutput output) {
        ChatResponse response = response(
            "{\"schemaVersion\":2,\"snapshotId\":\"private-response\",\"results\":[]}",
            "private-finish-reason",
            null
        );

        client(prompt -> response).generate("synthetic", new Input("safe"), StrictOutput.class);

        assertThat(output).contains("finishReason=OTHER")
            .doesNotContain("private-finish-reason")
            .doesNotContain("promptTokens=0")
            .doesNotContain("completionTokens=0");
    }

    @Test
    @DisplayName("형식 오류와 invalid data는 length로 추론하지 않고 원문을 노출하지 않는다")
    void classifiesFormatAndInvalidDataWithoutLeakingInvalidJson(CapturedOutput output) {
        String invalidJson = "{private-invalid-json";
        OpenAiClient invalidJsonClient = client(prompt -> response(invalidJson));
        OpenAiClient invalidDataClient = client(prompt -> {
            throw new OpenAIInvalidDataException("private-invalid-data");
        });

        assertThatThrownBy(() -> invalidJsonClient.generate("private-prompt", new Input("private-input"), StrictOutput.class))
            .isInstanceOf(ResolverException.class);
        assertThatThrownBy(() -> invalidDataClient.generate("synthetic", new Input("safe"), StrictOutput.class))
            .isInstanceOf(ResolverException.class);

        assertThat(output).contains("diagnostic=INVALID_RESPONSE_DATA")
            .doesNotContain("OUTPUT_LENGTH_LIMIT")
            .doesNotContain(invalidJson)
            .doesNotContain("private-prompt")
            .doesNotContain("private-input")
            .doesNotContain("private-invalid-data");
    }

    @Test
    @DisplayName("length 종료는 잘못된 JSON도 파싱 전에 안전하게 실패시킨다")
    void rejectsInvalidJsonWithLengthFinishReasonBeforeParsing(CapturedOutput output) {
        ChatResponse response = response("{private-length-json", "length", null);

        assertThatThrownBy(() -> client(prompt -> response).generate(
            "synthetic", new Input("safe"), StrictOutput.class
        )).isInstanceOf(ResolverException.class).hasMessage(SAFE_FAILURE_MESSAGE);

        assertThat(output).contains("diagnostic=OUTPUT_LENGTH_LIMIT")
            .doesNotContain("private-length-json");
    }

    @Test
    @DisplayName("length 실패에서도 제공된 usage만 안전하게 기록한다")
    void logsProvidedUsageForLengthFailure(CapturedOutput output) {
        ChatResponse response = response(
            "{\"schemaVersion\":2,\"snapshotId\":\"synthetic\",\"results\":[]}",
            "length",
            new FixedUsage(2, 4)
        );

        assertThatThrownBy(() -> client(prompt -> response).generate(
            "synthetic", new Input("safe"), StrictOutput.class
        )).isInstanceOf(ResolverException.class);

        assertThat(output).contains("finishReason=LENGTH")
            .contains("promptTokens=2")
            .contains("completionTokens=4")
            .contains("diagnostic=OUTPUT_LENGTH_LIMIT");
    }

    @Test
    @DisplayName("결과가 없는 응답은 형식 오류로 안전하게 분류한다")
    void classifiesMissingResultAsInvalidResponseData(CapturedOutput output) {
        OpenAiClient client = client(prompt -> new ChatResponse(List.of()));

        assertThatThrownBy(() -> client.generate("synthetic", new Input("safe"), StrictOutput.class))
            .isInstanceOf(ResolverException.class).hasMessage(SAFE_FAILURE_MESSAGE);

        assertThat(output).contains("diagnostic=INVALID_RESPONSE_DATA");
    }

    @Test
    @DisplayName("타입 이름만 timeout처럼 보여도 진단을 추론하지 않는다")
    void doesNotClassifyArbitraryExceptionNames(CapturedOutput output) {
        OpenAiClient client = client(prompt -> {
            throw new TimeoutNamedButUntypedException();
        });

        assertThatThrownBy(() -> client.generate("synthetic", new Input("safe"), StrictOutput.class))
            .isInstanceOf(ResolverException.class);

        assertThat(output).contains("diagnostic=UNCLASSIFIED")
            .doesNotContain("diagnostic=TIMEOUT");
    }

    private static OpenAiClient client(ChatModel model) {
        return new OpenAiClient(
            ChatClient.builder(model),
            new ObjectMapper()
        );
    }

    private static void assertInvalidResponse(String json, Class<?> outputType) {
        OpenAiClient client = client(prompt -> response(json));

        assertThatThrownBy(() -> client.generate(
            "synthetic system prompt",
            new Input("safe-input"),
            outputType
        )).isInstanceOf(ResolverException.class)
            .hasMessage(SAFE_FAILURE_MESSAGE);
    }

    private static ChatResponse response(String json) {
        return new ChatResponse(List.of(
            new Generation(new AssistantMessage(json))
        ));
    }

    private static ChatResponse response(String json, String finishReason, Usage usage) {
        return new ChatResponse(
            List.of(new Generation(
                new AssistantMessage(json),
                ChatGenerationMetadata.builder().finishReason(finishReason).build()
            )),
            ChatResponseMetadata.builder().usage(usage).build()
        );
    }

    record FixedUsage(Integer promptTokens, Integer completionTokens) implements Usage {
        @Override
        public Integer getPromptTokens() {
            return promptTokens;
        }

        @Override
        public Integer getCompletionTokens() {
            return completionTokens;
        }

        @Override
        public Object getNativeUsage() {
            return null;
        }
    }

    static final class TimeoutNamedButUntypedException extends RuntimeException {
    }

    static final class CapturingChatModel implements ChatModel {
        private final ChatResponse response;
        private Prompt prompt;

        CapturingChatModel(ChatResponse response) {
            this.response = response;
        }

        @Override
        public ChatResponse call(Prompt prompt) {
            this.prompt = prompt;
            return response;
        }

        @Override
        public ChatOptions getOptions() {
            return OpenAiChatOptions.builder().build();
        }
    }

    record Input(String safe) {
    }

    record StrictOutput(
        int schemaVersion,
        String snapshotId,
        List<Result> results
    ) {
    }

    record Result(String candidateId) {
    }

    @Configuration(proxyBeanMethods = false)
    static class TestDependencies {

        @Bean
        ObjectMapper objectMapper() {
            return new ObjectMapper();
        }

        @Bean
        ChatClient.Builder chatClientBuilder() {
            ChatModel model = new ChatModel() {
                @Override
                public ChatResponse call(Prompt prompt) {
                    throw new AssertionError("빈 등록 중 모델을 호출하면 안 됩니다");
                }

                @Override
                public ChatOptions getOptions() {
                    return OpenAiChatOptions.builder().build();
                }
            };
            return ChatClient.builder(model);
        }

        @Bean(OpenAiInteractionChatClientConfiguration.INTERACTION_CHAT_CLIENT)
        ChatClient interactionChatClient(ChatClient.Builder chatClientBuilder) {
            return chatClientBuilder.build();
        }

        @Bean
        SupportedProfileFields supportedProfileFields() {
            return new SupportedProfileFields();
        }
    }
}
