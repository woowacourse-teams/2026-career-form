package com.careerform.quality;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.net.URI;
import java.util.Arrays;
import java.util.Set;

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
        if (!request.isSecure()) { reject(response, 403); return; }
        var path = request.getRequestURI();
        if (path.equals("/quality") || path.startsWith("/quality/")) {
            if (!access.configured()) { reject(response, 503); return; }
            if (!Set.of("/quality/login.html", "/quality/login.js", "/quality/quality.css").contains(path)
                && !access.authorize(session(request), null, false)) {
                response.sendRedirect("/quality/login.html");
                return;
            }
            chain.doFilter(request, response);
            return;
        }
        var writing = !request.getMethod().equals("GET") && !request.getMethod().equals("HEAD");
        var reporting = path.matches(PREFIX + "/executions/[A-Za-z0-9_-]+/report") && request.getMethod().equals("POST");
        var login = path.equals(PREFIX + "/login") && request.getMethod().equals("POST");
        if (!reporting && !sameOrigin(request)) { reject(response, 403); return; }
        if (!reporting && !login) {
            var token = session(request);
            var query = path.equals(PREFIX + "/stats") && request.getMethod().equals("GET") && access.canQuery(bearer(request));
            if (!query && !access.authorize(token, request.getHeader("X-Quality-CSRF"), writing)) {
                reject(response, writing && access.authorize(token, null, false) ? 403 : 401);
                return;
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

    static String session(HttpServletRequest request) {
        return cookie(request, "CF_QUALITY_SESSION");
    }

    static String claimant(HttpServletRequest request) { return cookie(request, "CF_QUALITY_CLAIM"); }

    private static String cookie(HttpServletRequest request, String name) {
        return request.getCookies() == null ? null : Arrays.stream(request.getCookies())
            .filter(cookie -> cookie.getName().equals(name)).map(jakarta.servlet.http.Cookie::getValue).findFirst().orElse(null);
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
            var port = uri.getPort() < 0 ? 443 : uri.getPort();
            return "https".equals(uri.getScheme()) && uri.getUserInfo() == null && uri.getRawQuery() == null
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
