package com.careerform.formanalysis.exception;

import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;

@RestControllerAdvice(basePackages = "com.careerform.formanalysis.api")
public final class FormAnalysisExceptionHandler {

    @ExceptionHandler({
        InvalidSnapshotException.class,
        MethodArgumentNotValidException.class,
        HandlerMethodValidationException.class,
        HttpMessageNotReadableException.class
    })
    public ResponseEntity<ApiError> invalidRequest() {
        return ResponseEntity.badRequest().body(new ApiError(
            "INVALID_REQUEST",
            "지원서 snapshot 요청을 처리할 수 없습니다"
        ));
    }

    @ExceptionHandler(ClientCapabilityRequiredException.class)
    public ResponseEntity<ApiError> clientCapabilityRequired() {
        return ResponseEntity.status(409).body(new ApiError(
            "CLIENT_CAPABILITY_REQUIRED",
            "지원서 분석을 계속하려면 확장 프로그램을 업데이트해 주세요"
        ));
    }

    @ExceptionHandler(RoutingContextUnavailableException.class)
    public ResponseEntity<ApiError> routingContextUnavailable() {
        return ResponseEntity.status(503).body(new ApiError(
            "ROUTING_CONTEXT_UNAVAILABLE",
            "지원서 분석 문맥을 준비할 수 없습니다. 잠시 후 다시 시도해 주세요"
        ));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> internalError() {
        return ResponseEntity.internalServerError().body(new ApiError(
            "INTERNAL_ERROR",
            "지원서 분석을 처리할 수 없습니다"
        ));
    }

    public record ApiError(String code, String message) {
    }
}
