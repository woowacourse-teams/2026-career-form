package com.careerform.evaluation.provider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.net.InetAddress;
import java.net.URI;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("평가 공급자 주소 정책: 키가 정해진 호스트 밖으로 나가지 않고 내부망을 부르지 않는다")
class EndpointPolicyTest {

    private static final ProviderKeys KEYS = ProviderKeys.parse(
        "{\"deepseek\":{\"key\":\"sk-secret\",\"hosts\":[\"api.deepseek.com\"]}}");

    private static EndpointPolicy policy(boolean allowLocal, Map<String, String> dns) {
        return new EndpointPolicy(KEYS, allowLocal, host -> {
            String address = dns.get(host);
            if (address == null) {
                throw new java.net.UnknownHostException(host);
            }
            return List.of(InetAddress.getByName(address));
        });
    }

    private static final Map<String, String> PUBLIC_DNS = Map.of(
        "api.deepseek.com", "8.8.8.8", "llm.example.com", "1.1.1.1", "evil.example.com", "9.9.9.9",
        "metadata.example.com", "169.254.169.254", "internal.example.com", "10.0.0.5");

    @Test
    @DisplayName("기준 주소 뒤에 chat/completions를 붙인 https 주소를 만든다")
    void buildsChatCompletionsEndpoint() {
        URI endpoint = policy(false, PUBLIC_DNS).endpoint("https://api.deepseek.com/v1/", "deepseek");

        assertThat(endpoint).isEqualTo(URI.create("https://api.deepseek.com/v1/chat/completions"));
    }

    @Test
    @DisplayName("키를 쓰는 공급자는 그 키에 허용된 호스트로만 보낸다")
    void keyOnlyGoesToItsHosts() {
        assertThatThrownBy(() -> policy(false, PUBLIC_DNS).endpoint("https://evil.example.com/v1", "deepseek"))
            .isInstanceOf(ProviderRejected.class)
            .extracting(error -> ((ProviderRejected) error).code()).isEqualTo(ProviderRejected.Code.HOST_NOT_ALLOWED_FOR_KEY);
        assertThatThrownBy(() -> policy(false, PUBLIC_DNS).endpoint("https://api.deepseek.com/v1", "unknown"))
            .extracting(error -> ((ProviderRejected) error).code()).isEqualTo(ProviderRejected.Code.UNKNOWN_KEY);
    }

    @Test
    @DisplayName("https가 아니거나 사용자 정보·질의·조각이 있는 주소는 거부한다")
    void rejectsUnsafeUrls() {
        for (String url : List.of("http://llm.example.com/v1", "https://user:pw@llm.example.com/v1",
            "https://llm.example.com/v1?x=1", "https://llm.example.com/v1#a", "ftp://llm.example.com", "not a url")) {
            assertThatThrownBy(() -> policy(false, PUBLIC_DNS).endpoint(url, null))
                .isInstanceOf(ProviderRejected.class);
        }
    }

    @Test
    @DisplayName("사설·루프백·링크 로컬(메타데이터) 주소로 풀리는 호스트는 거부한다")
    void rejectsInternalAddresses() {
        for (String host : List.of("internal.example.com", "metadata.example.com")) {
            assertThatThrownBy(() -> policy(false, PUBLIC_DNS).endpoint("https://" + host + "/v1", null))
                .extracting(error -> ((ProviderRejected) error).code()).isEqualTo(ProviderRejected.Code.INTERNAL_ADDRESS);
        }
        assertThatThrownBy(() -> policy(false, Map.of("localhost", "127.0.0.1")).endpoint("https://localhost/v1", null))
            .extracting(error -> ((ProviderRejected) error).code()).isEqualTo(ProviderRejected.Code.INTERNAL_ADDRESS);
    }

    @Test
    @DisplayName("서버 설정으로 로컬을 허용하면 키 없는 자체 서빙 주소는 http와 내부 주소를 쓸 수 있다")
    void allowLocalPermitsKeylessSelfHosting() {
        URI endpoint = policy(true, Map.of("host.docker.internal", "192.168.65.254"))
            .endpoint("http://host.docker.internal:11434/v1", null);

        assertThat(endpoint).isEqualTo(URI.create("http://host.docker.internal:11434/v1/chat/completions"));
        assertThatThrownBy(() -> policy(true, PUBLIC_DNS).endpoint("http://api.deepseek.com/v1", "deepseek"))
            .isInstanceOf(ProviderRejected.class);
    }
}
