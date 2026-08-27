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
