package com.careerform.admission;

import java.io.IOException;
import java.util.Collections;
import java.util.Set;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.ObjectMapper;

public final class AdmissionFilter extends OncePerRequestFilter {
    private static final Set<String> PATHS = Set.of("/api/v1/preparation/analyze", "/api/v1/fields/analyze",
        "/api/v1/generic/sections/classify", "/api/v1/generic/fields/analyze", "/api/v1/generic/interaction-decisions");
    private final InstallService installs;
    private final TrustedClientAddress addresses;
    private final AdmissionSettings settings;
    private final ObjectMapper mapper = new ObjectMapper();
    public AdmissionFilter(InstallService installs, TrustedClientAddress addresses, AdmissionSettings settings) {
        this.installs = installs; this.addresses = addresses; this.settings = settings;
    }
    @Override protected boolean shouldNotFilter(HttpServletRequest request) {
        var path = org.springframework.web.util.UriUtils.decode(request.getRequestURI(), java.nio.charset.StandardCharsets.UTF_8)
            .replaceAll(";[^/]*", "").replaceAll("/+", "/");
        if (path.endsWith("/")) path = path.substring(0, path.length() - 1);
        return !request.getMethod().equals("POST") || !PATHS.contains(path);
    }
    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws IOException, ServletException {
        try {
            addresses.resolve(request);
            var id = single(request, "X-Career-Form-Installation");
            var authorization = single(request, "Authorization");
            var token = authorization != null && authorization.startsWith("Bearer ") ? authorization.substring(7) : null;
            AnalysisContext.begin(installs.authenticate(id, token), settings.requestTimeout());
            chain.doFilter(request, response);
        } catch (AdmissionFailure error) {
            if (!response.isCommitted()) {
                response.setStatus(error.status());
                response.setHeader("X-Career-Form-Admission", error.code());
                if (error.retryAt() != null) response.setHeader("X-Career-Form-Retry-At", error.retryAt().toString());
                response.setContentType("application/json");
                response.setHeader("Cache-Control", "no-store");
                if (error.retryAt() != null) response.setHeader("Retry-After", Long.toString(Math.max(1, error.retryAt().getEpochSecond() - java.time.Instant.now().getEpochSecond())));
                mapper.writeValue(response.getOutputStream(), new AdmissionErrorAdvice.Error(error.code(), error.retryAt()));
            }
        } finally { AnalysisContext.clear(); }
    }
    private static String single(HttpServletRequest request, String name) {
        var values = Collections.list(request.getHeaders(name));
        if (values.size() != 1) throw new AdmissionFailure("INVALID_INSTALLATION", 401, null);
        return values.getFirst();
    }
}
