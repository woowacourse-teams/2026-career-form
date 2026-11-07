package com.careerform.evaluation.provider;

import java.util.Collections;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.regex.Pattern;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 평가 공급자 키 묶음. 서버 환경 변수 하나(이름별 키 JSON)로 받는다. 키마다 그 키를 보낼 수 있는 호스트를 함께 정해,
 * 화면에서 공급자 주소를 바꿔도 키가 다른 곳으로 가지 않게 한다. 바깥에는 이름과 호스트만 보이고 키 원문은
 * {@link #secret(String)}로 전송부에만 넘긴다.
 */
public final class ProviderKeys {

    static final Pattern NAME = Pattern.compile("^[a-z][a-z0-9-]{1,31}$");
    private static final Pattern HOST = Pattern.compile("^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$");
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private record Key(String secret, Set<String> hosts) {

        @Override
        public String toString() {
            return "Key[hosts=" + hosts + "]";
        }
    }

    private final Map<String, Key> keys;

    private ProviderKeys(Map<String, Key> keys) {
        this.keys = Collections.unmodifiableMap(keys);
    }

    public static ProviderKeys empty() {
        return new ProviderKeys(new TreeMap<>());
    }

    /** {@code {"이름":{"key":"…","hosts":["api.example.com"]}}}. 비어 있으면 키가 없다. 잘못된 값은 원문 없이 거부한다. */
    public static ProviderKeys parse(String json) {
        if (json == null || json.isBlank()) {
            return empty();
        }
        JsonNode root;
        try {
            root = JSON.readTree(json);
        }
        catch (RuntimeException exception) {
            throw invalid();
        }
        if (root == null || !root.isObject()) {
            throw invalid();
        }
        Map<String, Key> keys = new TreeMap<>();
        for (var entry : root.properties()) {
            String name = entry.getKey();
            JsonNode value = entry.getValue();
            String secret = value.path("key").isString() ? value.path("key").asString() : null;
            JsonNode hosts = value.path("hosts");
            if (!NAME.matcher(name).matches() || secret == null || secret.isBlank() || !hosts.isArray()
                || hosts.isEmpty()) {
                throw invalid();
            }
            Set<String> allowed = new TreeSet<>();
            for (JsonNode host : hosts) {
                String normalized = host.isString() ? host.asString().toLowerCase(Locale.ROOT) : "";
                if (!HOST.matcher(normalized).matches()) {
                    throw invalid();
                }
                allowed.add(normalized);
            }
            keys.put(name, new Key(secret, Set.copyOf(allowed)));
        }
        return new ProviderKeys(keys);
    }

    private static IllegalStateException invalid() {
        return new IllegalStateException("평가 공급자 키 묶음 형식이 올바르지 않습니다");
    }

    public Set<String> names() {
        return Collections.unmodifiableSet(new TreeSet<>(keys.keySet()));
    }

    public Set<String> hosts(String name) {
        Key key = keys.get(name);
        return key == null ? Set.of() : key.hosts();
    }

    public Optional<String> secret(String name) {
        return Optional.ofNullable(name == null ? null : keys.get(name)).map(Key::secret);
    }

    @Override
    public String toString() {
        return "ProviderKeys" + keys.keySet();
    }
}
