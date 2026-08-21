package com.careerform.llm.mapping.api;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Type;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpInputMessage;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.RequestBodyAdviceAdapter;

import com.careerform.llm.mapping.config.LlmMappingProperties;
import com.careerform.llm.mapping.domain.LlmMappingRequest;

@ControllerAdvice
@ConditionalOnProperty(
    prefix = "career-form.llm",
    name = "enabled",
    havingValue = "true"
)
final class LlmMappingRequestBodyAdvice extends RequestBodyAdviceAdapter {

    private final int maxRequestBytes;

    LlmMappingRequestBodyAdvice(LlmMappingProperties properties) {
        this.maxRequestBytes = properties.maxRequestBytes();
    }

    @Override
    public boolean supports(
        MethodParameter methodParameter,
        Type targetType,
        Class<? extends HttpMessageConverter<?>> converterType
    ) {
        return LlmMappingRequest.class.equals(targetType);
    }

    @Override
    public HttpInputMessage beforeBodyRead(
        HttpInputMessage inputMessage,
        MethodParameter parameter,
        Type targetType,
        Class<? extends HttpMessageConverter<?>> converterType
    ) throws IOException {
        if (inputMessage.getHeaders().getContentLength() > maxRequestBytes) {
            throw tooLarge();
        }
        byte[] body = inputMessage.getBody().readNBytes(maxRequestBytes + 1);
        if (body.length > maxRequestBytes) {
            throw tooLarge();
        }
        InputStream bufferedBody = new ByteArrayInputStream(body);
        return new HttpInputMessage() {
            @Override
            public InputStream getBody() {
                return bufferedBody;
            }

            @Override
            public HttpHeaders getHeaders() {
                return inputMessage.getHeaders();
            }
        };
    }

    private static LlmRequestTooLargeException tooLarge() {
        return new LlmRequestTooLargeException(
            "LLM 매핑 요청 크기 제한을 초과했습니다"
        );
    }
}
