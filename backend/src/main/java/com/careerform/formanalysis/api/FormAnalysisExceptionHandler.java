package com.careerform.formanalysis.api;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;

import com.careerform.formanalysis.application.InvalidFormAnalysisRequestException;

@RestControllerAdvice(basePackages = "com.careerform.formanalysis.api")
final class FormAnalysisExceptionHandler {

    @ExceptionHandler({
        InvalidFormAnalysisRequestException.class,
        MethodArgumentNotValidException.class,
        HandlerMethodValidationException.class,
        HttpMessageNotReadableException.class
    })
    ResponseEntity<ApiError> invalidRequest() {
        return ResponseEntity.badRequest().body(new ApiError(
            "INVALID_REQUEST",
            "지원서 snapshot 요청을 처리할 수 없습니다"
        ));
    }

    @ExceptionHandler(SnapshotTooLargeException.class)
    ResponseEntity<ApiError> requestTooLarge() {
        return ResponseEntity.status(HttpStatus.CONTENT_TOO_LARGE).body(new ApiError(
            "SNAPSHOT_TOO_LARGE",
            "지원서 snapshot 크기 제한을 초과했습니다"
        ));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiError> internalError() {
        return ResponseEntity.internalServerError().body(new ApiError(
            "INTERNAL_ERROR",
            "지원서 분석을 처리할 수 없습니다"
        ));
    }

    record ApiError(String code, String message) {
    }
}
