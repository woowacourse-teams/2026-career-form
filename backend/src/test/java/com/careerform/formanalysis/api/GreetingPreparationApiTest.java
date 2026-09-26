package com.careerform.formanalysis.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.careerform.formanalysis.application.FormAnalysisRouter;
import com.careerform.formanalysis.application.FieldsAnalysisService;
import com.careerform.formanalysis.application.FieldInteractionPolicy;
import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.application.GreetingRoutingContext;
import com.careerform.formanalysis.application.PreparationAnalysisService;
import com.careerform.formanalysis.application.policy.CompanyFormPolicyFixture;
import com.careerform.formanalysis.application.port.ActionResolver;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider;
import com.careerform.formanalysis.application.port.GreetingDomainEvidence.Decision;
import com.careerform.formanalysis.exception.FormAnalysisExceptionHandler;

@DisplayName("Greeting 준비 API의 클라이언트 기능 계약")
class GreetingPreparationApiTest {

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    @DisplayName("Greeting 확정 시 구형 클라이언트는 정책 가용성과 무관하게 HTTP 오류로 중단한다")
    void rejectsLegacyClientForConfirmedGreeting(boolean policyAvailable) throws Exception {
        mvc(Decision.POSITIVE, policyAvailable).perform(post("/api/v1/preparation/analyze")
                .contentType(MediaType.APPLICATION_JSON).content(fixture()))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("CLIENT_CAPABILITY_REQUIRED"))
            .andExpect(jsonPath("$.message").isString())
            .andExpect(jsonPath("$.routingContext").doesNotExist());
    }

    @Test
    @DisplayName("새 클라이언트에는 ADAPTER 응답과 분석 문맥을 반환한다")
    void acceptsCapableClient() throws Exception {
        mvc(Decision.POSITIVE, true).perform(post("/api/v1/preparation/analyze")
                .header("X-Career-Form-Capabilities", "routing-context-v1,greeting-adapter-v1")
                .contentType(MediaType.APPLICATION_JSON).content(fixture()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.mode").value("ADAPTER"))
            .andExpect(jsonPath("$.routingContext").isString())
            .andExpect(jsonPath("$.executionAdapterId").value("greeting-v1"));
    }

    @Test
    @DisplayName("Greeting 근거가 없는 사이트는 구형 클라이언트도 범용 분석한다")
    void preservesGenericForLegacyClientWithoutPositiveEvidence() throws Exception {
        mvc(Decision.NO_POSITIVE_EVIDENCE, true).perform(post("/api/v1/preparation/analyze")
                .contentType(MediaType.APPLICATION_JSON).content(fixture()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.mode").value("GENERIC"))
            .andExpect(jsonPath("$.executionAdapterId").doesNotExist());
    }

    @Test
    @DisplayName("분석 문맥 저장 한도가 차면 완료 응답 대신 재시도 가능한 HTTP 오류를 반환한다")
    void rejectsPreparationWhenRoutingContextCannotBeIssued() throws Exception {
        GreetingRoutingContext contexts = new GreetingRoutingContext();
        for (int index = 0; index < 4_096; index++) {
            contexts.issue("career.example.org", "/ko/o/*/apply");
        }
        mvc(Decision.POSITIVE, true, contexts).perform(post("/api/v1/preparation/analyze")
                .header("X-Career-Form-Capabilities", "routing-context-v1,greeting-adapter-v1")
                .contentType(MediaType.APPLICATION_JSON).content(fixture()))
            .andExpect(status().isServiceUnavailable())
            .andExpect(jsonPath("$.code").value("ROUTING_CONTEXT_UNAVAILABLE"));
    }

    @Test
    @DisplayName("DNS 판정 실패만 있는 구형 클라이언트 요청은 기존 BLOCKED 응답을 유지한다")
    void preservesBlockedResponseForUnknownDnsFailure() throws Exception {
        mvc(Decision.RETRYABLE_FAILURE, true).perform(post("/api/v1/preparation/analyze")
                .contentType(MediaType.APPLICATION_JSON).content(fixture()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.analysisStatus").value("BLOCKED"))
            .andExpect(jsonPath("$.blockCode").value("GREETING_DNS_UNAVAILABLE"));
    }

    @Test
    void rejectsClientWithoutGreetingExecutionCapability() throws Exception {
        mvc(Decision.POSITIVE, true).perform(post("/api/v1/preparation/analyze")
                .header("X-Career-Form-Capabilities", "routing-context-v1,greeting-adapter-v10")
                .contentType(MediaType.APPLICATION_JSON).content(fixture()))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("CLIENT_CAPABILITY_REQUIRED"))
            .andExpect(jsonPath("$.executionAdapterId").doesNotExist());
    }

    @Test
    void reusesBoundContextForSecondPreparationWithoutDnsEvidence() throws Exception {
        GreetingRoutingContext contexts = new GreetingRoutingContext();
        String token = contexts.issue("kakaomobility.career.greetinghr.com", "/ko/o/*/apply");
        String request = fixture().replace("\"schemaVersion\": 2,",
            "\"schemaVersion\": 2, \"routingContext\": \"" + token + "\",");
        mvc(Decision.RETRYABLE_FAILURE, true, contexts)
            .perform(post("/api/v1/preparation/analyze")
                .header("X-Career-Form-Capabilities", "routing-context-v1,greeting-adapter-v1")
                .contentType(MediaType.APPLICATION_JSON).content(request))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.analysisStatus").value("COMPLETE"))
            .andExpect(jsonPath("$.routingContext").value(token))
            .andExpect(jsonPath("$.executionAdapterId").value("greeting-v1"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"forged", "wrong-host", "wrong-path"})
    void rejectsInvalidContextEvenWhenDnsWouldConfirmGreeting(String kind) throws Exception {
        GreetingRoutingContext contexts = new GreetingRoutingContext();
        String token = switch (kind) {
            case "wrong-host" -> contexts.issue("career.other.com", "/ko/o/*/apply");
            case "wrong-path" -> contexts.issue("kakaomobility.career.greetinghr.com", "/ko/o/*");
            default -> "invalid";
        };
        String request = fixture().replace("\"schemaVersion\": 2,",
            "\"schemaVersion\": 2, \"routingContext\": \"" + token + "\",");
        mvc(Decision.POSITIVE, true, contexts).perform(post("/api/v1/preparation/analyze")
                .header("X-Career-Form-Capabilities", "routing-context-v1,greeting-adapter-v1")
                .contentType(MediaType.APPLICATION_JSON).content(request))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.analysisStatus").value("BLOCKED"))
            .andExpect(jsonPath("$.executionAdapterId").doesNotExist());
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void negotiatesFieldsExecutionAdapter(boolean capable) throws Exception {
        GreetingRoutingContext contexts = new GreetingRoutingContext();
        String token = contexts.issue("career.hyundai-autoever.com", "/ko/o/*/apply");
        String request = new ClassPathResource("formanalysis/greeting-fields-current-v2.json")
            .getContentAsString(StandardCharsets.UTF_8)
            .replace("\"schemaVersion\": 2,",
                "\"schemaVersion\": 2, \"routingContext\": \"" + token + "\",");
        var result = mvc(Decision.RETRYABLE_FAILURE, true, contexts)
            .perform(post("/api/v1/fields/analyze")
                .header("X-Career-Form-Capabilities", capable ? "greeting-adapter-v1" : "routing-context-v1")
                .contentType(MediaType.APPLICATION_JSON).content(request));
        if (capable) {
            result.andExpect(status().isOk())
                .andExpect(jsonPath("$.analysisStatus").value("COMPLETE"))
                .andExpect(jsonPath("$.executionAdapterId").value("greeting-v1"));
        } else {
            result.andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CLIENT_CAPABILITY_REQUIRED"))
                .andExpect(jsonPath("$.executionAdapterId").doesNotExist());
        }
    }

    private static MockMvc mvc(Decision evidence, boolean policyAvailable) {
        return mvc(evidence, policyAvailable, new GreetingRoutingContext());
    }

    private static MockMvc mvc(
        Decision evidence, boolean policyAvailable, GreetingRoutingContext contexts
    ) {
        FormAnalysisRouter router = new FormAnalysisRouter(
            (host, path) -> new CompanyFormPolicyProvider.NotRegistered(),
            (host, path) -> evidence,
            () -> policyAvailable
                ? new CompanyFormPolicyProvider.Available(CompanyFormPolicyFixture.greeting())
                : new CompanyFormPolicyProvider.Unavailable(), contexts
        );
        ActionResolver generic = request -> new ActionResolver.Resolution(
            2, request.snapshotId(), List.of()
        );
        return MockMvcBuilders.standaloneSetup(new PreparationAnalysisController(
                new PreparationAnalysisService(Optional.of(generic), router, contexts)),
                new FieldsAnalysisController(new FieldsAnalysisService(Optional.empty(), router,
                    new FieldInteractionPolicy(), new SupportedProfileFields())))
            .setControllerAdvice(new FormAnalysisExceptionHandler()).build();
    }

    private static String fixture() throws Exception {
        return new ClassPathResource("formanalysis/greeting-preparation-current-v2.json")
            .getContentAsString(StandardCharsets.UTF_8);
    }
}
