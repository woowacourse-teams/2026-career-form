package com.careerform.evaluation.provider;

import java.net.Inet4Address;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.UnknownHostException;
import java.util.List;
import java.util.Locale;

/**
 * 평가 공급자 주소 정책. 키를 쓰는 공급자는 https와 그 키에 허용된 호스트로만 보낸다. 키 없는 공급자도 https와 공인 주소만
 * 쓴다. 서버 설정으로 로컬을 허용하면 키 없는 자체 서빙(예: 로컬 Ollama)만 http와 내부 주소를 쓸 수 있다. 호스트는 주소를
 * 만들 때마다 다시 풀어 확인한다.
 */
public final class EndpointPolicy {

    @FunctionalInterface
    public interface Resolver {
        List<InetAddress> resolve(String host) throws UnknownHostException;
    }

    private final ProviderKeys keys;
    private final boolean allowLocal;
    private final Resolver resolver;

    public EndpointPolicy(ProviderKeys keys, boolean allowLocal, Resolver resolver) {
        this.keys = keys;
        this.allowLocal = allowLocal;
        this.resolver = resolver;
    }

    public static Resolver systemResolver() {
        return host -> List.of(InetAddress.getAllByName(host));
    }

    /** 기준 주소(예: https://api.example.com/v1)로 chat/completions 주소를 만든다. 정책에 맞지 않으면 거부한다. */
    public URI endpoint(String baseUrl, String keyName) {
        URI base;
        try {
            base = new URI(baseUrl == null ? "" : baseUrl.trim());
        }
        catch (URISyntaxException exception) {
            throw new ProviderRejected(ProviderRejected.Code.INVALID_URL);
        }
        String scheme = base.getScheme() == null ? "" : base.getScheme().toLowerCase(Locale.ROOT);
        String host = base.getHost() == null ? null : base.getHost().toLowerCase(Locale.ROOT);
        if (host == null || base.getRawUserInfo() != null || base.getRawQuery() != null
            || base.getRawFragment() != null || !List.of("http", "https").contains(scheme)) {
            throw new ProviderRejected(ProviderRejected.Code.INVALID_URL);
        }
        boolean keyed = keyName != null;
        if (keyed && keys.secret(keyName).isEmpty()) {
            throw new ProviderRejected(ProviderRejected.Code.UNKNOWN_KEY);
        }
        boolean local = allowLocal && !keyed;
        if (!"https".equals(scheme) && !local) {
            throw new ProviderRejected(ProviderRejected.Code.INSECURE_URL);
        }
        if (keyed && !keys.hosts(keyName).contains(host)) {
            throw new ProviderRejected(ProviderRejected.Code.HOST_NOT_ALLOWED_FOR_KEY);
        }
        List<InetAddress> addresses;
        try {
            addresses = resolver.resolve(host);
        }
        catch (UnknownHostException | RuntimeException exception) {
            throw new ProviderRejected(ProviderRejected.Code.UNRESOLVABLE_HOST);
        }
        if (addresses.isEmpty()) {
            throw new ProviderRejected(ProviderRejected.Code.UNRESOLVABLE_HOST);
        }
        if (!local && addresses.stream().anyMatch(EndpointPolicy::internal)) {
            throw new ProviderRejected(ProviderRejected.Code.INTERNAL_ADDRESS);
        }
        String path = base.getRawPath() == null ? "" : base.getRawPath().replaceAll("/+$", "");
        return URI.create(scheme + "://" + base.getRawAuthority() + path + "/chat/completions");
    }

    static boolean internal(InetAddress address) {
        if (address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress()
            || address.isSiteLocalAddress() || address.isMulticastAddress()) {
            return true;
        }
        byte[] bytes = address.getAddress();
        if (address instanceof Inet4Address) {
            int first = bytes[0] & 0xff;
            int second = bytes[1] & 0xff;
            return first == 0 || (first == 100 && second >= 64 && second <= 127);
        }
        return address instanceof Inet6Address && (bytes[0] & 0xfe) == 0xfc;
    }
}
