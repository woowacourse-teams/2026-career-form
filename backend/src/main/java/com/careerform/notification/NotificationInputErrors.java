package com.careerform.notification;

import java.util.Map;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestControllerAdvice(assignableTypes = {NotificationController.class})
@ConditionalOnProperty(prefix = "career-form.notification", name = "enabled", havingValue = "true")
public final class NotificationInputErrors {
    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentNotValidException.class,
        MissingServletRequestParameterException.class, MethodArgumentTypeMismatchException.class})
    public ResponseEntity<Map<String, String>> invalid() { return ResponseEntity.badRequest().body(Map.of("error", "INVALID_INPUT")); }
}
