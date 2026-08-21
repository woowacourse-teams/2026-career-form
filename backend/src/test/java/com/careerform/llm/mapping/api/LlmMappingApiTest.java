package com.careerform.llm.mapping.api;

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

import com.careerform.llm.mapping.application.MappingModelClient;
import com.careerform.llm.mapping.domain.LlmMappingRequest;
import com.careerform.llm.mapping.domain.LlmMappingResponse;

@SpringBootTest(properties = {
    "spring.mongodb.uri=mongodb://localhost/career-form-test",
    "career-form.llm.enabled=true",
    "career-form.llm.model=gpt-5.6-luna",
    "career-form.llm.max-context-fields=2",
    "career-form.llm.max-target-fields=2",
    "career-form.llm.max-request-bytes=1024",
    "career-form.llm.max-output-tokens=2048",
    "spring.ai.openai.api-key=not-a-secret"
})
@AutoConfigureMockMvc
@Import(LlmMappingApiTest.FakeModelConfiguration.class)
class LlmMappingApiTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private FakeMappingModelClient fakeModel;

    @BeforeEach
    void resetFakeModel() {
        fakeModel.respondWith(new LlmMappingResponse(1, List.of(
            new LlmMappingResponse.Mapping(
                "target-1", "contact.phoneNumber", 0.91
            )
        )));
    }

    @Test
    void mapsSyntheticMetadataThroughFakeModel() throws Exception {
        mockMvc.perform(post("/api/v1/llm/mappings")
                .contentType(MediaType.APPLICATION_JSON)
                .content(fixture()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.schemaVersion").value(1))
            .andExpect(jsonPath("$.mappings[0].targetFieldId").value("target-1"))
            .andExpect(jsonPath("$.mappings[0].profileFieldKey")
                .value("contact.phoneNumber"))
            .andExpect(jsonPath("$.mappings[0].confidence").value(0.91));
    }

    @Test
    void rejectsUnknownRequestPropertiesWithoutEchoingValues() throws Exception {
        String privateValue = "https://invalid.example/private";
        String request = fixture().replace(
            "{\n",
            "{\n  \"url\": \"" + privateValue + "\",\n"
        );

        mockMvc.perform(post("/api/v1/llm/mappings")
                .contentType(MediaType.APPLICATION_JSON)
                .content(request))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("invalid_llm_mapping_request"))
            .andExpect(content().string(not(containsString(privateValue))));
    }

    @Test
    void rejectsBeanValidationFailuresWithoutEchoingValues() throws Exception {
        String privateValue = "value-that-must-not-be-returned";

        mockMvc.perform(post("/api/v1/llm/mappings")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "contextFields": [],
                      "targetFields": [{
                        "fieldId": "target-1",
                        "element": "input",
                        "control": "text",
                        "domId": "",
                        "domName": "",
                        "displayName": "%s",
                        "required": true
                      }]
                    }
                    """.formatted(privateValue.repeat(8))))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("invalid_llm_mapping_request"))
            .andExpect(content().string(not(containsString(privateValue))));
    }

    @Test
    void rejectsAmbiguousFieldIdentifiers() throws Exception {
        mockMvc.perform(post("/api/v1/llm/mappings")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "contextFields": [{
                        "fieldId": "same-id",
                        "element": "input",
                        "control": "text",
                        "domId": "known-email",
                        "domName": "email",
                        "displayName": "이메일",
                        "required": true,
                        "profileFieldKey": "contact.email"
                      }],
                      "targetFields": [{
                        "fieldId": "same-id",
                        "element": "input",
                        "control": "text",
                        "domId": "unknown-phone",
                        "domName": "contact-field",
                        "displayName": "연락 항목",
                        "required": true
                      }]
                    }
                    """))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("invalid_llm_mapping_request"));
    }

    @Test
    void rejectsConfiguredFieldCountLimit() throws Exception {
        mockMvc.perform(post("/api/v1/llm/mappings")
                .contentType(MediaType.APPLICATION_JSON)
                .content(requestWithTargets(3, false)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("invalid_llm_mapping_request"));
    }

    @Test
    void rejectsCanonicalRequestByteLimit() throws Exception {
        mockMvc.perform(post("/api/v1/llm/mappings")
                .contentType(MediaType.APPLICATION_JSON)
                .content(requestWithTargets(2, true)))
            .andExpect(status().isContentTooLarge())
            .andExpect(jsonPath("$.code").value("llm_mapping_request_too_large"));
    }

    @Test
    void rejectsRawRequestByteLimitBeforeCanonicalization() throws Exception {
        String paddedRequest = fixture() + " ".repeat(1024);

        mockMvc.perform(post("/api/v1/llm/mappings")
                .contentType(MediaType.APPLICATION_JSON)
                .content(paddedRequest))
            .andExpect(status().isContentTooLarge())
            .andExpect(jsonPath("$.code").value("llm_mapping_request_too_large"));
    }

    @Test
    void rejectsTheWholeInvalidUpstreamResponse() throws Exception {
        fakeModel.respondWith(new LlmMappingResponse(1, List.of(
            new LlmMappingResponse.Mapping("unknown-target", "NO_MATCH", 0.5)
        )));

        mockMvc.perform(post("/api/v1/llm/mappings")
                .contentType(MediaType.APPLICATION_JSON)
                .content(fixture()))
            .andExpect(status().isBadGateway())
            .andExpect(jsonPath("$.code").value("llm_upstream_error"))
            .andExpect(content().string(not(containsString("unknown-target"))));
    }

    @Test
    void hidesProviderFailureDetails() throws Exception {
        String providerDetail = "provider-private-response";
        fakeModel.failWith(new IllegalStateException(providerDetail));

        mockMvc.perform(post("/api/v1/llm/mappings")
                .contentType(MediaType.APPLICATION_JSON)
                .content(fixture()))
            .andExpect(status().isBadGateway())
            .andExpect(jsonPath("$.code").value("llm_upstream_error"))
            .andExpect(content().string(not(containsString(providerDetail))));
    }

    private static String fixture() throws Exception {
        return new ClassPathResource("llm/mapping-request-v1.json")
            .getContentAsString(StandardCharsets.UTF_8);
    }

    private static String requestWithTargets(int count, boolean useMaximumStrings) {
        String text = useMaximumStrings ? "x".repeat(120) : "field";
        String element = useMaximumStrings ? "x".repeat(32) : "input";
        String control = useMaximumStrings ? "x".repeat(32) : "text";
        StringBuilder targets = new StringBuilder();
        for (int index = 0; index < count; index++) {
            if (index > 0) {
                targets.append(',');
            }
            targets.append("""
                {
                  "fieldId":"target-%d%s",
                  "element":"%s",
                  "control":"%s",
                  "domId":"%s",
                  "domName":"%s",
                  "displayName":"%s",
                  "required":false
                }
                """.formatted(
                    index,
                    useMaximumStrings ? "x".repeat(120) : "",
                    element,
                    control,
                    text,
                    text,
                    text
                ));
        }
        return "{\"contextFields\":[],\"targetFields\":[" + targets + "]}";
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class FakeModelConfiguration {

        @Bean
        @Primary
        FakeMappingModelClient fakeMappingModelClient() {
            return new FakeMappingModelClient();
        }
    }

    static final class FakeMappingModelClient implements MappingModelClient {

        private Function<LlmMappingRequest, LlmMappingResponse> behavior;

        void respondWith(LlmMappingResponse response) {
            behavior = ignored -> response;
        }

        void failWith(RuntimeException exception) {
            behavior = ignored -> {
                throw exception;
            };
        }

        @Override
        public LlmMappingResponse map(LlmMappingRequest request) {
            return behavior.apply(request);
        }
    }
}
