package com.careerform.quality;

import java.util.Map;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestControllerAdvice(assignableTypes = {QualityLoginController.class, QualityReportingController.class,
    QualityRegistryController.class, QualityStatsController.class})
@ConditionalOnProperty(prefix = "career-form.quality", name = "enabled", havingValue = "true")
public final class QualityInputErrors {
    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentNotValidException.class,
        MissingServletRequestParameterException.class, MethodArgumentTypeMismatchException.class})
    public ResponseEntity<Map<String, String>> invalid() {
        return ResponseEntity.badRequest().body(Map.of("error", "INVALID_INPUT"));
    }
}
