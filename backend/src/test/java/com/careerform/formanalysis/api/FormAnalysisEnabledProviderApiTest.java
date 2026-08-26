package com.careerform.formanalysis.api;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.function.Function;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.ChatOptions;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {
    "spring.mongodb.uri=mongodb://localhost/career-form-test",
    "career-form.llm.enabled=true",
    "career-form.llm.provider=openai",
    "career-form.llm.model=gpt-5.6-luna",
    "career-form.llm.max-output-tokens=2048",
    "spring.ai.openai.api-key=synthetic-test-key"
})
@AutoConfigureMockMvc
@Import(FormAnalysisEnabledProviderApiTest.FakeProviderConfiguration.class)
class FormAnalysisEnabledProviderApiTest {

    private static final String PRIVATE_MARKER = "private-provider-response-marker";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private FakeChatModel model;

    @BeforeEach
    void resetModel() {
        model.respondWith("{}");
    }

    @Test
    void mapsBothEndpointsThroughTheConfiguredProvider() throws Exception {
        model.respondWith("""
            {"schemaVersion":2,"snapshotId":"snapshot-preparation-1","results":[
              {"candidateId":"action-direct","actionType":"ACTION",
               "command":"ADD_REPEATABLE_GROUP",
               "expectedEffect":"GROUP_COUNT_INCREMENT"},
              {"candidateId":"action-item","actionType":"NO_ACTION"}
            ]}
            """);

        mockMvc.perform(post("/api/v1/preparation/analyze")
                .contentType(MediaType.APPLICATION_JSON)
                .content(fixture("preparation-request-v2.json")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.analysisStatus").value("COMPLETE"))
            .andExpect(jsonPath("$.preparationPlans[0].command")
                .value("ADD_REPEATABLE_GROUP"));

        model.respondWith("""
            {"schemaVersion":2,"snapshotId":"snapshot-fields-1","results":[
              {"candidateId":"field-direct","matchType":"MATCH",
               "profileFieldKey":"contact.contact.email"},
              {"candidateId":"field-item","matchType":"NO_MATCH"}
            ]}
            """);

        mockMvc.perform(post("/api/v1/fields/analyze")
                .contentType(MediaType.APPLICATION_JSON)
                .content(fixture("fields-request-v2.json")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.analysisStatus").value("COMPLETE"))
            .andExpect(jsonPath("$.fields.length()").value(2));
    }

    @Test
    void convertsEveryInvalidActionProviderResponseToTheSamePartialShape()
        throws Exception {
        List<String> invalidResponses = List.of(
            "",
            """
                {"schemaVersion":2,"snapshotId":"snapshot-preparation-1","results":[
                  {"candidateId":"action-direct","actionType":"NO_ACTION",
                   "executionCount":"private-provider-response-marker"},
                  {"candidateId":"action-item","actionType":"NO_ACTION"}
                ]}
                """,
            """
                {"schemaVersion":2,"snapshotId":"snapshot-preparation-1","results":[
                  {"candidateId":"action-direct","actionType":"ACTION",
                   "command":"REVEAL_SECTION",
                   "expectedEffect":"GROUP_COUNT_INCREMENT",
                   "targetSectionId":"section-target"},
                  {"candidateId":"action-item","actionType":"NO_ACTION"}
                ]}
                """,
            """
                {"schemaVersion":2,"snapshotId":"snapshot-preparation-1","results":[
                  {"candidateId":"unknown-action","actionType":"NO_ACTION"},
                  {"candidateId":"action-item","actionType":"NO_ACTION"}
                ]}
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
    void convertsEveryInvalidFieldProviderResponseToTheSamePartialShape()
        throws Exception {
        List<String> invalidResponses = List.of(
            "",
            """
                {"schemaVersion":2,"snapshotId":"snapshot-fields-1","results":[
                  {"candidateId":"field-direct","matchType":"NO_MATCH",
                   "profileFieldKey":"private-provider-response-marker"},
                  {"candidateId":"field-item","matchType":"NO_MATCH"}
                ]}
                """,
            """
                {"schemaVersion":2,"snapshotId":"snapshot-fields-1","results":[
                  {"candidateId":"field-direct","matchType":"UNKNOWN"},
                  {"candidateId":"field-item","matchType":"NO_MATCH"}
                ]}
                """,
            """
                {"schemaVersion":2,"snapshotId":"snapshot-fields-1","results":[
                  {"candidateId":"unknown-field","matchType":"NO_MATCH"},
                  {"candidateId":"field-item","matchType":"NO_MATCH"}
                ]}
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
