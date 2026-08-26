package com.careerform.formanalysis.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpInputMessage;
import org.springframework.http.converter.StringHttpMessageConverter;
import org.springframework.core.io.ClassPathResource;

import com.careerform.formanalysis.application.InvalidFormAnalysisRequestException;
import com.careerform.formanalysis.domain.FieldsSnapshot;
import com.careerform.formanalysis.domain.FormControl;
import com.careerform.formanalysis.domain.FormElement;
import com.careerform.formanalysis.domain.PreparationSnapshot;
import com.careerform.formanalysis.domain.Site;
import com.careerform.formanalysis.domain.Visibility;

import tools.jackson.databind.ObjectMapper;

class SnapshotRequestBodyAdviceTest {

    private static final int MAX_REQUEST_BYTES = 1024;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final SnapshotRequestBodyAdvice advice = advice(MAX_REQUEST_BYTES);

    @Test
    void supportsOnlyTheTwoSnapshotContracts() {
        assertThat(advice.supports(
            null,
            PreparationSnapshot.class,
            StringHttpMessageConverter.class
        )).isTrue();
        assertThat(advice.supports(
            null,
            FieldsSnapshot.class,
            StringHttpMessageConverter.class
        )).isTrue();
        assertThat(advice.supports(
            null,
            String.class,
            StringHttpMessageConverter.class
        )).isFalse();
    }

    @Test
    void distinguishesOmittedOptionalValuesFromExplicitNull() throws Exception {
        String request = new ClassPathResource("formanalysis/fields-request-v2.json")
            .getContentAsString(StandardCharsets.UTF_8);

        FieldsSnapshot snapshot = objectMapper.readValue(request, FieldsSnapshot.class);

        assertThat(snapshot.sections().getFirst().parentSectionId()).isNull();
        assertThatThrownBy(() -> advise(message(
            request.replace("\"displayName\": \"이메일\"", "\"displayName\": null")
                .getBytes(StandardCharsets.UTF_8),
            -1
        ))).isInstanceOf(InvalidFormAnalysisRequestException.class);
    }

    @Test
    void rejectsDeclaredContentLengthBeforeReadingTheBody() {
        HttpInputMessage message = message(new byte[0], MAX_REQUEST_BYTES + 1);

        assertThatThrownBy(() -> advise(message))
            .isInstanceOf(SnapshotTooLargeException.class);
    }

    @Test
    void rejectsUnknownLengthBodyAtTheFirstByteBeyondTheLimit() {
        HttpInputMessage message = message(new byte[MAX_REQUEST_BYTES + 1], -1);

        assertThatThrownBy(() -> advise(message))
            .isInstanceOf(SnapshotTooLargeException.class);
    }

    @Test
    void allowsUnknownLengthBodyAtTheExactLimit() throws Exception {
        HttpInputMessage advised = advise(message(new byte[MAX_REQUEST_BYTES], -1));

        assertThat(advised.getBody().readAllBytes()).hasSize(MAX_REQUEST_BYTES);
    }

    @Test
    void rejectsCanonicalJsonBeyondTheLimit() {
        FieldsSnapshot snapshot = snapshot();
        int canonicalBytes = objectMapper.writeValueAsBytes(snapshot).length;

        assertThatThrownBy(() -> advice(canonicalBytes - 1).afterBodyRead(
            snapshot,
            message(new byte[0], 0),
            null,
            FieldsSnapshot.class,
            StringHttpMessageConverter.class
        )).isInstanceOf(SnapshotTooLargeException.class);
    }

    @Test
    void allowsCanonicalJsonAtTheExactLimit() {
        FieldsSnapshot snapshot = snapshot();
        int canonicalBytes = objectMapper.writeValueAsBytes(snapshot).length;

        Object result = advice(canonicalBytes).afterBodyRead(
            snapshot,
            message(new byte[0], 0),
            null,
            FieldsSnapshot.class,
            StringHttpMessageConverter.class
        );

        assertThat(result).isSameAs(snapshot);
    }

    private HttpInputMessage advise(HttpInputMessage message) throws Exception {
        return advice.beforeBodyRead(
            message,
            null,
            FieldsSnapshot.class,
            StringHttpMessageConverter.class
        );
    }

    private SnapshotRequestBodyAdvice advice(int limit) {
        return new SnapshotRequestBodyAdvice(
            new SnapshotRequestLimits(limit, objectMapper)
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

    private static FieldsSnapshot snapshot() {
        return new FieldsSnapshot(
            2,
            "snapshot-1",
            new Site("example.test", "/application/*"),
            List.of(new FieldsSnapshot.Section(
                "section-1",
                null,
                "기본 정보",
                List.of(new FieldsSnapshot.FieldCandidate(
                    "field-1",
                    FormElement.INPUT,
                    FormControl.TEXT,
                    Visibility.VISIBLE,
                    "이메일",
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null
                )),
                List.of()
            ))
        );
    }
}
