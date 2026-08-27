package com.careerform.formanalysis.infrastructure.adapter.openai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.ChatOptions;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.application.port.ActionResolver;
import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.exception.ResolverException;
import com.careerform.formanalysis.infrastructure.adapter.openai.OpenAiActionResolver.ActionOutput;
import com.careerform.formanalysis.infrastructure.adapter.openai.OpenAiFieldMappingResolver.FieldOutput;

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
                + "\"matches\":[],\"noMatches\":[]}",
            FieldOutput.class
        );
        assertInvalidResponse(
            "{\"schemaVersion\":2,\"snapshotId\":\"snapshot-1\",\"matches\":[],"
                + "\"noMatches\":[{\"candidateId\":42}]}",
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

        @Bean
        SupportedProfileFields supportedProfileFields() {
            return new SupportedProfileFields();
        }
    }
}
