package com.careerform.formanalysis.api;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Type;

import org.springframework.core.MethodParameter;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpInputMessage;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.RequestBodyAdviceAdapter;

import com.careerform.formanalysis.domain.FieldsSnapshot;
import com.careerform.formanalysis.domain.PreparationSnapshot;

@ControllerAdvice(basePackages = "com.careerform.formanalysis.api")
final class SnapshotRequestBodyAdvice extends RequestBodyAdviceAdapter {

    private final SnapshotRequestLimits limits;

    SnapshotRequestBodyAdvice(SnapshotRequestLimits limits) {
        this.limits = limits;
    }

    @Override
    public boolean supports(
        MethodParameter methodParameter,
        Type targetType,
        Class<? extends HttpMessageConverter<?>> converterType
    ) {
        return PreparationSnapshot.class.equals(targetType)
            || FieldsSnapshot.class.equals(targetType);
    }

    @Override
    public HttpInputMessage beforeBodyRead(
        HttpInputMessage inputMessage,
        MethodParameter parameter,
        Type targetType,
        Class<? extends HttpMessageConverter<?>> converterType
    ) throws IOException {
        if (inputMessage.getHeaders().getContentLength() > limits.maxRequestBytes()) {
            throw SnapshotRequestLimits.tooLarge();
        }
        byte[] body = inputMessage.getBody().readNBytes(limits.maxRequestBytes() + 1);
        if (body.length > limits.maxRequestBytes()) {
            throw SnapshotRequestLimits.tooLarge();
        }
        limits.validateNoExplicitNull(body);
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

    @Override
    public Object afterBodyRead(
        Object body,
        HttpInputMessage inputMessage,
        MethodParameter parameter,
        Type targetType,
        Class<? extends HttpMessageConverter<?>> converterType
    ) {
        limits.validateCanonical(body);
        return body;
    }
}
