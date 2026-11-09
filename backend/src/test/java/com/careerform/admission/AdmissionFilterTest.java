package com.careerform.admission;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import java.time.Clock;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.ObjectMapper;

class AdmissionFilterTest {
    @Test
    void registrationAuthenticatesAnalysisButDoesNotChangeNotificationRoute() throws Exception {
        var service = new InstallService(new InstallServiceTest.MemoryInstalls(),
            new CredentialCrypto(Base64.getEncoder().encodeToString(new byte[32])), Clock.systemUTC(), (address, operation) -> {});
        var addresses = new TrustedClientAddress("127.0.0.1");
        var mvc = MockMvcBuilders.standaloneSetup(new InstallController(service, addresses), new AnalysisEndpoint())
            .setControllerAdvice(new AdmissionErrorAdvice())
            .addFilters(new AdmissionFilter(service, addresses, AdmissionSettings.defaults())).build();
        var registered = mvc.perform(post("/api/v1/analysis-installations").header("X-Real-IP", "198.51.100.1")
            .header("X-Forwarded-Proto", "https").contentType(MediaType.APPLICATION_JSON)
            .content("{\"key\":\"00000000-0000-4000-8000-000000000001\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        var credentials = new ObjectMapper().readValue(registered, InstallService.Credentials.class);
        mvc.perform(post("/api/v1/fields/analyze").header("X-Real-IP", "198.51.100.1").header("X-Forwarded-Proto", "https"))
            .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/fields/analyze").header("X-Real-IP", "198.51.100.1").header("X-Forwarded-Proto", "https")
            .header("X-Career-Form-Installation", credentials.installationId()).header("Authorization", "Bearer " + credentials.token()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.childContext").value(true));
        mvc.perform(post("/api/v1/notifications/test")).andExpect(status().isOk());
        assertThat(org.assertj.core.api.Assertions.catchThrowable(AnalysisContext::current)).isInstanceOf(AdmissionFailure.class);
    }

    @Test
    void encodedAnalysisPathCannotBypassCredentialCheck() throws Exception {
        var service = new InstallService(new InstallServiceTest.MemoryInstalls(),
            new CredentialCrypto(Base64.getEncoder().encodeToString(new byte[32])), Clock.systemUTC(), (address, operation) -> {});
        var filter = new AdmissionFilter(service, new TrustedClientAddress("127.0.0.1"), AdmissionSettings.defaults());
        var request = new org.springframework.mock.web.MockHttpServletRequest("POST", "/api/v1/%66ields/analyze");
        request.addHeader("X-Forwarded-Proto", "https");
        request.addHeader("X-Real-IP", "198.51.100.1");
        var response = new org.springframework.mock.web.MockHttpServletResponse();
        filter.doFilter(request, response, (ignoredRequest, ignoredResponse) -> { throw new AssertionError("Unauthenticated chain executed"); });
        assertThat(response.getStatus()).isEqualTo(401);
    }

    @RestController
    static class AnalysisEndpoint {
        @PostMapping("/api/v1/fields/analyze")
        Map<String, Boolean> analysis() throws Exception {
            var parent = AnalysisContext.current();
            var completed = new CompletableFuture<Boolean>();
            Thread.startVirtualThread(() -> completed.complete(parent.equals(AnalysisContext.current())));
            return Map.of("childContext", completed.get());
        }
        @PostMapping("/api/v1/notifications/test") Map<String, Boolean> notifications() { return Map.of("ok", true); }
    }
}
