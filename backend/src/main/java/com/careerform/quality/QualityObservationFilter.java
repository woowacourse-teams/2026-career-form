package com.careerform.quality;

import java.io.IOException;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@Component
@Order(-100)
@ConditionalOnProperty(prefix = "career-form.quality", name = "enabled", havingValue = "true")
public final class QualityObservationFilter extends OncePerRequestFilter {
    private static final Logger log = LoggerFactory.getLogger(QualityObservationFilter.class);
    private static final Set<String> PATHS = Set.of("/api/v1/fields/analyze", "/api/v1/preparation/analyze", "/api/v1/generic/interaction-decisions");
    private final QualityCollectionService collector;
    private final QualityObservationExecutor observer;

    public QualityObservationFilter(QualityCollectionService collector) { this(collector, QualityObservationExecutor.shared()); }

    @org.springframework.beans.factory.annotation.Autowired
    public QualityObservationFilter(QualityCollectionService collector, QualityObservationExecutor observer) {
        this.collector = collector;
        this.observer = observer;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) { return !PATHS.contains(request.getRequestURI()) || !request.getMethod().equals("POST"); }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws IOException, ServletException {
        try (var scope = QualityScope.open()) {
            var failed = false;
            try {
                chain.doFilter(request, response);
            } catch (IOException | ServletException | RuntimeException exception) {
                failed = true;
                throw exception;
            } finally {
                if (!scope.observed()) {
                    try {
                        var event = new QualityCollectionService.RequestEvent(operation(request.getRequestURI()), failed ? 500 : response.getStatus(),
                            scope.durationMs(), null, scope.calls());
                        observer.observe(() -> collector.observe(collector.group("UNKNOWN", "UNKNOWN", "UNKNOWN", null, null),
                            event, null, null, null, false));
                    } catch (RuntimeException exception) {
                        log.warn("QUALITY_REQUEST_OBSERVATION_UNAVAILABLE");
                    }
                }
            }
        }
    }

    private String operation(String path) {
        return path.contains("fields") ? "FIELDS" : path.contains("preparation") ? "PREPARATION" : "INTERACTION";
    }
}
