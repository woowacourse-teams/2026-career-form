package com.careerform.monitoring;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.slf4j.MDC;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.servlet.HandlerMapping;

@ExtendWith(OutputCaptureExtension.class)
class RequestObservationFilterTest {

    @Test
    void restoresPreviousContextAndDoesNotTrustClientRequestId(CapturedOutput output) throws Exception {
        var request = new MockHttpServletRequest("GET", "/synthetic-private-path");
        request.addHeader("X-Request-Id", "synthetic-private-client-id");
        request.setAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE, "/synthetic/{id}");
        var response = new MockHttpServletResponse();
        MDC.put("requestId", "previous-context");
        try {
            new RequestObservationFilter("staging").doFilter(request, response, (incoming, outgoing) -> {
                assertThat(MDC.get("requestId")).isEqualTo(response.getHeader("X-Request-Id"));
                response.setStatus(201);
            });
            assertThat(MDC.get("requestId")).isEqualTo("previous-context");
            assertThat(output.getAll()).contains("env=staging", "route=/synthetic/{id}", "status=201")
                .doesNotContain("synthetic-private-path", "synthetic-private-client-id", "previous-context");
        } finally {
            MDC.remove("requestId");
        }
    }

    @Test
    void rethrowsFailureWithoutLoggingItsMessageAndClearsContext(CapturedOutput output) {
        var request = new MockHttpServletRequest("POST", "/synthetic-private-path");
        var response = new MockHttpServletResponse();
        var failure = new IOException("synthetic-private-exception-message");

        assertThatThrownBy(() -> new RequestObservationFilter("prod").doFilter(
            request, response, (incoming, outgoing) -> { throw failure; }
        )).isSameAs(failure);
        assertThat(MDC.get("requestId")).isNull();
        assertThat(output.getAll()).contains("env=prod", "status=500", "failure=IOException")
            .doesNotContain("synthetic-private-path", "synthetic-private-exception-message");
    }
}
