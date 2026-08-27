package com.careerform.formanalysis.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.function.Function;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.ChatOptions;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.model.openai.autoconfigure.OpenAiChatProperties;
import org.springframework.ai.model.openai.autoconfigure.OpenAiCommonProperties;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {
    "spring.mongodb.uri=mongodb://localhost/career-form-test",
    "career-form.llm.enabled=true",
    "spring.ai.openai.api-key=synthetic-test-key",
    "spring.ai.openai.chat.model=gpt-5.6-luna",
    "spring.ai.openai.chat.max-completion-tokens=2048"
})
@AutoConfigureMockMvc
@Import(FormAnalysisEnabledProviderApiTest.FakeProviderConfiguration.class)
@DisplayName("OpenAI 활성화 API")
class FormAnalysisEnabledProviderApiTest {

    private static final String PRIVATE_MARKER = "private-provider-response-marker";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private FakeChatModel model;

    @Autowired
    private OpenAiCommonProperties openAiCommonProperties;

    @Autowired
    private OpenAiChatProperties openAiChatProperties;

    @BeforeEach
    @DisplayName("가짜 ChatModel 응답을 초기화한다")
    void resetModel() {
        model.respondWith("{}");
    }

    @Test
    @DisplayName("단순한 목록 묶음 응답으로 두 OpenAI 해석기를 연결한다")
    void mapsBothEndpointsThroughTheConfiguredProvider() throws Exception {
        model.respondWith("""
            {"schemaVersion":2,"snapshotId":"snapshot-preparation-1",
             "revealSections":[],
             "addRepeatableGroups":[{"candidateId":"action-direct"}],
             "noActions":[{"candidateId":"action-item"}]}
            """);

        mockMvc.perform(post("/api/v1/preparation/analyze")
                .contentType(MediaType.APPLICATION_JSON)
                .content(fixture("preparation-request-v2.json")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.analysisStatus").value("COMPLETE"))
            .andExpect(jsonPath("$.preparationPlans[0].command")
                .value("ADD_REPEATABLE_GROUP"));

        model.respondWith("""
            {"schemaVersion":2,"snapshotId":"snapshot-fields-1",
             "matches":[{"candidateId":"field-direct",
                         "profileFieldKey":"contact.contact.email"}],
             "noMatches":[{"candidateId":"field-item"}]}
            """);

        mockMvc.perform(post("/api/v1/fields/analyze")
                .contentType(MediaType.APPLICATION_JSON)
                .content(fixture("fields-request-v2.json")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.analysisStatus").value("COMPLETE"))
            .andExpect(jsonPath("$.fields.length()").value(2));
    }

    @Test
    @DisplayName("OpenAI timeout과 retry 제한을 Spring 표준 속성에 고정한다")
    void pinsProviderTimeoutAndRetryLimits() {
        assertThat(openAiCommonProperties.getTimeout())
            .isEqualTo(Duration.ofSeconds(10));
        assertThat(openAiCommonProperties.getMaxRetries()).isEqualTo(1);
    }

    @Test
    @DisplayName("공통 설정으로 Chat Completion 저장을 활성화한다")
    void enablesChatCompletionStorageFromCommonConfiguration() {
        assertThat(openAiChatProperties.getStore()).isTrue();
    }

    @Test
    @DisplayName("공통 저장 설정을 모든 실행 profile이 상속한다")
    void sharesChatCompletionStorageAcrossRuntimeProfiles() throws Exception {
        assertThat(yaml("application.yml").getProperty(
            "spring.ai.openai.chat.store"
        )).isEqualTo(true);

        for (String profile : List.of("local", "dev", "staging", "prod")) {
            assertThat(yaml("application-" + profile + ".yml").containsProperty(
                "spring.ai.openai.chat.store"
            )).isFalse();
        }
    }

    private static PropertySource<?> yaml(String path) throws Exception {
        return new YamlPropertySourceLoader().load(
            path,
            new ClassPathResource(path)
        ).getFirst();
    }

    @Test
    @DisplayName("잘못된 action provider 응답을 동일한 PARTIAL 형태로 변환한다")
    void convertsEveryInvalidActionProviderResponseToTheSamePartialShape()
        throws Exception {
        List<String> invalidResponses = List.of(
            "",
            """
                {"schemaVersion":2,"snapshotId":"snapshot-preparation-1",
                 "revealSections":[],"addRepeatableGroups":[],
                 "noActions":[
                   {"candidateId":"action-direct",
                    "executionCount":"private-provider-response-marker"},
                   {"candidateId":"action-item"}]}
                """,
            """
                {"schemaVersion":2,"snapshotId":"snapshot-preparation-1",
                 "revealSections":[],
                 "noActions":[{"candidateId":"action-direct"},
                              {"candidateId":"action-item"}]}
                """,
            """
                {"schemaVersion":2,"snapshotId":"snapshot-preparation-1",
                 "revealSections":[],"addRepeatableGroups":[],
                 "noActions":[{"candidateId":"unknown-action"},
                              {"candidateId":"action-item"}]}
                """,
            """
                {"schemaVersion":2,"snapshotId":"snapshot-preparation-1",
                 "revealSections":[],"addRepeatableGroups":[],
                 "noActions":[null,{"candidateId":"action-item"}]}
                """
        );

        for (String response : invalidResponses) {
            model.respondWith(response);
            assertPreparationPartial();
        }

        model.failWith(new IllegalStateException(PRIVATE_MARKER));
        assertPreparationPartial();
    }

    @Test
    @DisplayName("잘못된 field provider 응답을 동일한 PARTIAL 형태로 변환한다")
    void convertsEveryInvalidFieldProviderResponseToTheSamePartialShape()
        throws Exception {
        List<String> invalidResponses = List.of(
            "",
            """
                {"schemaVersion":2,"snapshotId":"snapshot-fields-1",
                 "matches":[],"noMatches":[
                   {"candidateId":"field-direct",
                    "profileFieldKey":"private-provider-response-marker"},
                   {"candidateId":"field-item"}]}
                """,
            """
                {"schemaVersion":2,"snapshotId":"snapshot-fields-1",
                 "matches":[{"candidateId":"field-direct"}],
                 "noMatches":[{"candidateId":"field-item"}]}
                """,
            """
                {"schemaVersion":2,"snapshotId":"snapshot-fields-1",
                 "matches":[],"noMatches":[
                   {"candidateId":"unknown-field"},
                   {"candidateId":"field-item"}]}
                """,
            """
                {"schemaVersion":2,"snapshotId":"snapshot-fields-1",
                 "matches":[],"noMatches":[null,{"candidateId":"field-item"}]}
                """
        );

        for (String response : invalidResponses) {
            model.respondWith(response);
            assertFieldsPartial();
        }

        model.failWith(new IllegalStateException(PRIVATE_MARKER));
        assertFieldsPartial();
    }

    private void assertPreparationPartial() throws Exception {
        mockMvc.perform(post("/api/v1/preparation/analyze")
                .contentType(MediaType.APPLICATION_JSON)
                .content(fixture("preparation-request-v2.json")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.analysisStatus").value("PARTIAL"))
            .andExpect(jsonPath("$.warningCodes[0]").value("LLM_UNAVAILABLE"))
            .andExpect(jsonPath("$.preparationPlans").isEmpty())
            .andExpect(content().string(not(containsString(PRIVATE_MARKER))));
    }

    private void assertFieldsPartial() throws Exception {
        mockMvc.perform(post("/api/v1/fields/analyze")
                .contentType(MediaType.APPLICATION_JSON)
                .content(fixture("fields-request-v2.json")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.analysisStatus").value("PARTIAL"))
            .andExpect(jsonPath("$.warningCodes[0]").value("LLM_UNAVAILABLE"))
            .andExpect(jsonPath("$.fields").isEmpty())
            .andExpect(content().string(not(containsString(PRIVATE_MARKER))));
    }

    private static String fixture(String name) throws Exception {
        return new ClassPathResource("formanalysis/" + name)
            .getContentAsString(StandardCharsets.UTF_8);
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class FakeProviderConfiguration {

        @Bean
        FakeChatModel fakeChatModel() {
            return new FakeChatModel();
        }

        @Bean
        @Primary
        ChatClient.Builder testChatClientBuilder(FakeChatModel model) {
            return ChatClient.builder(model);
        }
    }

    static final class FakeChatModel implements ChatModel {

        private Function<Prompt, ChatResponse> behavior;

        void respondWith(String responseJson) {
            behavior = ignored -> new ChatResponse(List.of(
                new Generation(new AssistantMessage(responseJson))
            ));
        }

        void failWith(RuntimeException exception) {
            behavior = ignored -> {
                throw exception;
            };
        }

        @Override
        public ChatResponse call(Prompt prompt) {
            return behavior.apply(prompt);
        }

        @Override
        public ChatOptions getOptions() {
            return OpenAiChatOptions.builder().build();
        }
    }
}
