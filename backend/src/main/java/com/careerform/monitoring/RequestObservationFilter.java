package com.careerform.monitoring;

import java.io.IOException;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerMapping;

@Component
public class RequestObservationFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(RequestObservationFilter.class);
    private static final Set<String> METHODS = Set.of("GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS");
    private final String environment;

    public RequestObservationFilter(@Value("${management.metrics.tags.env:local}") String environment) {
        this.environment = environment;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        var requestId = UUID.randomUUID().toString();
        var previous = MDC.get("requestId");
        var started = System.nanoTime();
        response.setHeader("X-Request-Id", requestId);
        MDC.put("requestId", requestId);
        try {
            chain.doFilter(request, response);
            record(request, response.getStatus(), started, requestId, "none");
        } catch (ServletException | IOException | RuntimeException exception) {
            record(request, 500, started, requestId, exception.getClass().getSimpleName());
            throw exception;
        } finally {
            if (previous == null) {
                MDC.remove("requestId");
            } else {
                MDC.put("requestId", previous);
            }
        }
    }

    private void record(HttpServletRequest request, int status, long started,
                        String requestId, String failure) {
        var matched = request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
        var route = matched == null || "/**".equals(matched.toString()) ? "UNKNOWN" : matched.toString();
        var method = METHODS.contains(request.getMethod()) ? request.getMethod() : "OTHER";
        log.info("API_RESULT env={} service=career-form-backend method={} route={} status={} durationMs={} requestId={} failure={}",
            environment, method, route, status,
            TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started), requestId, failure);
    }
}
