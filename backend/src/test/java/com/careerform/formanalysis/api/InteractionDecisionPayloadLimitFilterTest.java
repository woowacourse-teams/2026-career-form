package com.careerform.formanalysis.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;

import tools.jackson.databind.json.JsonMapper;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class InteractionDecisionPayloadLimitFilterTest {

    @Test
    void doesNotApplyCalendarBudgetToSearchOnlyRequests() throws Exception {
        byte[] body = ("{\"decisions\":[{\"role\":\"SEARCH_QUERY_INPUT\",\"context\":\""
            + "x".repeat(16 * 1024) + "\"}]}").getBytes(StandardCharsets.UTF_8);
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        new InteractionDecisionPayloadLimitFilter(JsonMapper.builder().build()).doFilter(request(body), response, chain);

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(((jakarta.servlet.http.HttpServletRequest) chain.getRequest())
            .getInputStream().readAllBytes()).containsExactly(body);
    }

    @Test
    void rejectsInteractionRequestBodiesLargerThanSixteenKibibytes() throws Exception {
        MockHttpServletRequest request = request(new byte[16 * 1024 + 1]);
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        new InteractionDecisionPayloadLimitFilter(JsonMapper.builder().build()).doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(413);
        assertThat(chain.getRequest()).isNull();
    }

    @Test
    void rejectsOversizedMixedRequestsContainingCalendarDecisions() throws Exception {
        byte[] body = ("{\"decisions\":[{\"role\":\"SEARCH_QUERY_INPUT\"},"
            + "{\"role\":\"CALENDAR_MONTH_CONTROL\"}],\"snapshotId\":\""
            + "x".repeat(16 * 1024) + "\"}").getBytes(StandardCharsets.UTF_8);
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        new InteractionDecisionPayloadLimitFilter(JsonMapper.builder().build()).doFilter(request(body), response, chain);

        assertThat(response.getStatus()).isEqualTo(413);
        assertThat(chain.getRequest()).isNull();
    }

    @Test
    void replaysAnInteractionRequestBodyAtTheLimit() throws Exception {
        byte[] body = "x".repeat(16 * 1024).getBytes(StandardCharsets.UTF_8);
        MockHttpServletRequest request = request(body);
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        new InteractionDecisionPayloadLimitFilter(JsonMapper.builder().build()).doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(((jakarta.servlet.http.HttpServletRequest) chain.getRequest())
            .getInputStream().readAllBytes()).containsExactly(body);
    }

    private static MockHttpServletRequest request(byte[] body) {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/generic/interaction-decisions");
        request.setContent(body);
        return request;
    }
}
