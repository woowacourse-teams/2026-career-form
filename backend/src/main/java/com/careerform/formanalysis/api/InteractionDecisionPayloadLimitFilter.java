package com.careerform.formanalysis.api;

import java.io.ByteArrayInputStream;
import java.io.IOException;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

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
final class InteractionDecisionPayloadLimitFilter extends OncePerRequestFilter {
    private static final int MAX_REQUEST_BYTES = 16 * 1024;
    private static final String PATH = "/api/v1/generic/interaction-decisions";
    private final ObjectMapper mapper;

    InteractionDecisionPayloadLimitFilter(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !"POST".equals(request.getMethod()) || !PATH.equals(request.getRequestURI());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
        throws ServletException, IOException {
        byte[] body = request.getInputStream().readAllBytes();
        if (body.length > MAX_REQUEST_BYTES && exceedsCalendarBudget(body)) {
            response.sendError(413);
            return;
        }
        chain.doFilter(new BufferedRequest(request, body), response);
    }

    private boolean exceedsCalendarBudget(byte[] body) throws IOException {
        try {
            for (var decision : mapper.readTree(body).path("decisions")) {
                if (decision.path("role").asString().startsWith("CALENDAR_")) return true;
            }
            return false;
        }
        catch (JacksonException exception) {
            return true;
        }
    }

    private static final class BufferedRequest extends HttpServletRequestWrapper {
        private final byte[] body;

        private BufferedRequest(HttpServletRequest request, byte[] body) {
            super(request);
            this.body = body;
        }

        @Override
        public int getContentLength() {
            return body.length;
        }

        @Override
        public long getContentLengthLong() {
            return body.length;
        }

        @Override
        public ServletInputStream getInputStream() {
            return new BufferedInputStream(body);
        }
    }

    private static final class BufferedInputStream extends ServletInputStream {
        private final ByteArrayInputStream input;

        private BufferedInputStream(byte[] body) {
            this.input = new ByteArrayInputStream(body);
        }

        @Override
        public boolean isFinished() {
            return input.available() == 0;
        }

        @Override
        public boolean isReady() {
            return true;
        }

        @Override
        public void setReadListener(ReadListener listener) {
            throw new UnsupportedOperationException();
        }

        @Override
        public int read() {
            return input.read();
        }
    }
}
