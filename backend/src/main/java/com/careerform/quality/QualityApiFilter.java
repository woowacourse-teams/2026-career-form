package com.careerform.quality;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;

@Component
@Order(-90)
public final class QualityApiFilter extends OncePerRequestFilter {
    private static final String PREFIX = "/api/v1/quality";
    private final QualityAccess access;

    public QualityApiFilter(QualityAccess access) { this.access = access; }

    @org.springframework.beans.factory.annotation.Autowired
    public QualityApiFilter(org.springframework.beans.factory.ObjectProvider<QualityAccess> access) { this.access = access.getIfAvailable(); }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith(PREFIX + "/") && !request.getRequestURI().startsWith("/quality/") && !request.getRequestURI().equals("/quality");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        secureHeaders(response);
        if (access == null) { reject(response, 404); return; }
        var path = request.getRequestURI();
        if (path.equals("/quality") || path.startsWith("/quality/")) {
            if (!access.configured()) { reject(response, 503); return; }
            chain.doFilter(request, response);
            return;
        }
        var writing = !request.getMethod().equals("GET") && !request.getMethod().equals("HEAD");
        var reporting = path.matches(PREFIX + "/executions/[A-Za-z0-9_-]+/report") && request.getMethod().equals("POST");
        var login = path.equals(PREFIX + "/login") && request.getMethod().equals("POST");
        if (!reporting && !sameOrigin(request)) { reject(response, 403); return; }
        if (!reporting && !login) {
            var query = path.equals(PREFIX + "/stats") && request.getMethod().equals("GET") && access.canQuery(bearer(request));
            if (!query) {
                var status = access.login(password(request), request.getRemoteAddr()).status();
                if (status != QualityAccess.LoginStatus.OK) {
                    reject(response, status == QualityAccess.LoginStatus.THROTTLED ? 429
                        : status == QualityAccess.LoginStatus.NOT_CONFIGURED ? 503 : 401);
                    return;
                }
            }
        }
        if (writing) {
            var cap = login ? 4096 : 128 * 1024;
            var body = request.getInputStream().readNBytes(cap + 1);
            if (body.length > cap) { reject(response, 413); return; }
            chain.doFilter(new BufferedRequest(request, body), response);
        } else {
            chain.doFilter(request, response);
        }
    }

    static String claimant(HttpServletRequest request) { return request.getHeader("X-Quality-Claimant"); }

    private String password(HttpServletRequest request) {
        var authorization = request.getHeader("Authorization");
        if (authorization == null || !authorization.startsWith("Basic ") || authorization.length() > 8192) { return null; }
        try {
            var decoded = new String(Base64.getDecoder().decode(authorization.substring(6)), StandardCharsets.UTF_8);
            return decoded.startsWith("quality:") ? decoded.substring(8) : null;
        } catch (IllegalArgumentException exception) { return null; }
    }

    static String bearer(HttpServletRequest request) {
        var authorization = request.getHeader("Authorization");
        return authorization != null && authorization.startsWith("Bearer ") ? authorization.substring(7) : null;
    }

    private boolean sameOrigin(HttpServletRequest request) {
        var origin = request.getHeader("Origin");
        if (origin == null) { return true; }
        try {
            var uri = URI.create(origin);
            var scheme = request.isSecure() ? "https" : "http";
            var port = uri.getPort() < 0 ? (scheme.equals("https") ? 443 : 80) : uri.getPort();
            return scheme.equals(uri.getScheme()) && uri.getUserInfo() == null && uri.getRawQuery() == null
                && uri.getRawFragment() == null && (uri.getRawPath() == null || uri.getRawPath().isEmpty())
                && request.getServerName().equalsIgnoreCase(uri.getHost()) && request.getServerPort() == port;
        } catch (IllegalArgumentException exception) { return false; }
    }

    private void secureHeaders(HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Referrer-Policy", "no-referrer");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("X-Frame-Options", "DENY");
        response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    }

    private void reject(HttpServletResponse response, int status) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json");
        response.getWriter().write("{\"error\":\"QUALITY_ACCESS_UNAVAILABLE\"}");
    }

    private static final class BufferedRequest extends HttpServletRequestWrapper {
        private final byte[] body;
        private BufferedRequest(HttpServletRequest request, byte[] body) { super(request); this.body = body; }
        @Override public int getContentLength() { return body.length; }
        @Override public long getContentLengthLong() { return body.length; }
        @Override public ServletInputStream getInputStream() {
            return new ServletInputStream() {
                private final ByteArrayInputStream input = new ByteArrayInputStream(body);
                @Override public int read() { return input.read(); }
                @Override public boolean isFinished() { return input.available() == 0; }
                @Override public boolean isReady() { return true; }
                @Override public void setReadListener(ReadListener listener) { throw new UnsupportedOperationException(); }
            };
        }
    }
}
