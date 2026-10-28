package com.careerform.admission;

import java.net.InetAddress;
import java.util.Arrays;
import java.util.Collections;
import java.util.Set;
import java.util.stream.Collectors;
import jakarta.servlet.http.HttpServletRequest;

public final class TrustedClientAddress {
    private final Set<String> proxies;
    public TrustedClientAddress(String proxies) {
        this.proxies = Arrays.stream(proxies.split(",")).map(String::trim).filter(value -> !value.isEmpty())
            .map(TrustedClientAddress::literal).collect(Collectors.toUnmodifiableSet());
        if (this.proxies.isEmpty()) throw new IllegalArgumentException("Admission requires explicit trusted proxy addresses");
    }
    public String resolve(HttpServletRequest request) {
        if (!proxies.contains(literal(request.getRemoteAddr()))) throw new AdmissionFailure("UNTRUSTED_PROXY", 403, null);
        var proto = Collections.list(request.getHeaders("X-Forwarded-Proto"));
        var real = Collections.list(request.getHeaders("X-Real-IP"));
        if (proto.size() != 1 || !proto.getFirst().equals("https") || real.size() != 1) throw new AdmissionFailure("INSECURE_TRANSPORT", 403, null);
        return literal(real.getFirst());
    }
    private static String literal(String value) {
        if (value == null || value.length() > 45 || !value.matches("[0-9a-fA-F:.]+") || (!value.contains(".") && !value.contains(":"))) {
            throw new AdmissionFailure("INVALID_CLIENT_ADDRESS", 403, null);
        }
        try { return InetAddress.getByName(value).getHostAddress(); }
        catch (java.net.UnknownHostException error) { throw new AdmissionFailure("INVALID_CLIENT_ADDRESS", 403, null); }
    }
}
