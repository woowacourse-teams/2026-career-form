package com.careerform.llm.mapping.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayInputStream;
import java.io.InputStream;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpInputMessage;
import org.springframework.http.converter.StringHttpMessageConverter;

import com.careerform.llm.mapping.config.LlmMappingProperties;
import com.careerform.llm.mapping.domain.LlmMappingRequest;

class LlmMappingRequestBodyAdviceTest {

    private static final int MAX_REQUEST_BYTES = 1024;

    private final LlmMappingRequestBodyAdvice advice = new LlmMappingRequestBodyAdvice(
        new LlmMappingProperties(true, "gpt-5.6-luna", 2, 2, MAX_REQUEST_BYTES, 2048)
    );

    @Test
    void rejectsDeclaredContentLengthBeforeReadingTheBody() {
        HttpInputMessage message = message(new byte[0], MAX_REQUEST_BYTES + 1);

        assertThatThrownBy(() -> advise(message))
            .isInstanceOf(LlmRequestTooLargeException.class);
    }

    @Test
    void rejectsAnUnknownLengthBodyBeforeMessageConversion() {
        HttpInputMessage message = message(new byte[MAX_REQUEST_BYTES + 1], -1);

        assertThatThrownBy(() -> advise(message))
            .isInstanceOf(LlmRequestTooLargeException.class);
    }

    @Test
    void allowsAnUnknownLengthStreamAtTheExactLimit() throws Exception {
        HttpInputMessage advised = advise(message(new byte[MAX_REQUEST_BYTES], -1));

        assertThat(advised.getBody().readAllBytes()).hasSize(MAX_REQUEST_BYTES);
    }

    private HttpInputMessage advise(HttpInputMessage message) throws Exception {
        return advice.beforeBodyRead(
            message,
            null,
            LlmMappingRequest.class,
            StringHttpMessageConverter.class
        );
    }

    private static HttpInputMessage message(byte[] body, long contentLength) {
        HttpHeaders headers = new HttpHeaders();
        if (contentLength >= 0) {
            headers.setContentLength(contentLength);
        }
        return new HttpInputMessage() {
            @Override
            public InputStream getBody() {
                return new ByteArrayInputStream(body);
            }

            @Override
            public HttpHeaders getHeaders() {
                return headers;
            }
        };
    }
}
