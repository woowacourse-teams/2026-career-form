package com.careerform.formanalysis.api;

import com.careerform.formanalysis.application.InvalidFormAnalysisRequestException;

import tools.jackson.core.JacksonException;
import tools.jackson.core.JsonParser;
import tools.jackson.core.JsonToken;
import tools.jackson.databind.ObjectMapper;

public final class SnapshotRequestLimits {

    private static final String TOO_LARGE_MESSAGE =
        "지원서 snapshot 크기 제한을 초과했습니다";

    private final int maxRequestBytes;
    private final ObjectMapper objectMapper;

    public SnapshotRequestLimits(int maxRequestBytes, ObjectMapper objectMapper) {
        this.maxRequestBytes = maxRequestBytes;
        this.objectMapper = objectMapper;
    }

    int maxRequestBytes() {
        return maxRequestBytes;
    }

    void validateCanonical(Object snapshot) {
        if (objectMapper.writeValueAsBytes(snapshot).length > maxRequestBytes) {
            throw tooLarge();
        }
    }

    void validateNoExplicitNull(byte[] body) {
        try (JsonParser parser = objectMapper.createParser(body)) {
            while (parser.nextToken() != null) {
                if (parser.currentToken() == JsonToken.VALUE_NULL) {
                    throw new InvalidFormAnalysisRequestException(
                        "지원서 snapshot은 명시적인 null을 허용하지 않습니다"
                    );
                }
            }
        }
        catch (JacksonException ignored) {
            // The HTTP message converter reports malformed JSON uniformly.
        }
    }

    static SnapshotTooLargeException tooLarge() {
        return new SnapshotTooLargeException(TOO_LARGE_MESSAGE);
    }
}
