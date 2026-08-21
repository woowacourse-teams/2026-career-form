package com.careerform.llm.mapping.api;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;

import com.careerform.llm.mapping.application.InvalidLlmMappingRequestException;
import com.careerform.llm.mapping.application.LlmUpstreamException;

@RestControllerAdvice
@ConditionalOnProperty(
    prefix = "career-form.llm",
    name = "enabled",
    havingValue = "true"
)
final class LlmMappingExceptionHandler {

    @ExceptionHandler({
        InvalidLlmMappingRequestException.class,
        MethodArgumentNotValidException.class,
        HandlerMethodValidationException.class,
        HttpMessageNotReadableException.class
    })
    ResponseEntity<ApiError> invalidRequest() {
        return ResponseEntity.badRequest().body(new ApiError(
            "invalid_llm_mapping_request",
            "LLM 매핑 요청을 처리할 수 없습니다"
        ));
    }

    @ExceptionHandler(LlmRequestTooLargeException.class)
    ResponseEntity<ApiError> requestTooLarge() {
        return ResponseEntity.status(HttpStatus.CONTENT_TOO_LARGE).body(new ApiError(
            "llm_mapping_request_too_large",
            "LLM 매핑 요청 크기 제한을 초과했습니다"
        ));
    }

    @ExceptionHandler(LlmUpstreamException.class)
    ResponseEntity<ApiError> upstream() {
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(new ApiError(
            "llm_upstream_error",
            "LLM 매핑을 완료하지 못했습니다"
        ));
    }

    record ApiError(String code, String message) {
    }
}
