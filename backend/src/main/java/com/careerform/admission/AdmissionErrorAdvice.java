package com.careerform.admission;

import java.time.Instant;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
@org.springframework.context.annotation.Conditional(AdmissionAvailableCondition.class)
public final class AdmissionErrorAdvice {
    public record Error(String code, Instant retryAt) { }
    @ExceptionHandler(AdmissionFailure.class)
    public ResponseEntity<Error> failure(AdmissionFailure error) {
        var response = ResponseEntity.status(error.status()).header("Cache-Control", "no-store").header("X-Career-Form-Admission", error.code());
        if (error.retryAt() != null) response.header("X-Career-Form-Retry-At", error.retryAt().toString()).header("Retry-After", Long.toString(Math.max(1, error.retryAt().getEpochSecond() - Instant.now().getEpochSecond())));
        return response.body(new Error(error.code(), error.retryAt()));
    }
}
