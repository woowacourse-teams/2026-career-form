package com.careerform.admission;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

class TrustedClientAddressTest {
    @Test
    void acceptsOnlyExplicitProxyAndSingleHttpsHeaders() {
        var addresses = new TrustedClientAddress("127.0.0.1");
        var request = new MockHttpServletRequest();
        request.setRemoteAddr("127.0.0.1");
        request.addHeader("X-Real-IP", "198.51.100.10");
        request.addHeader("X-Forwarded-Proto", "https");
        assertThat(addresses.resolve(request)).isEqualTo("198.51.100.10");
        request.setRemoteAddr("198.51.100.20");
        assertThatThrownBy(() -> addresses.resolve(request)).isInstanceOf(AdmissionFailure.class);
        request.setRemoteAddr("127.0.0.1");
        request.addHeader("X-Real-IP", "203.0.113.10");
        assertThatThrownBy(() -> addresses.resolve(request)).isInstanceOf(AdmissionFailure.class);
    }

    @Test
    void rejectsPlainHttpAndHostnameValues() {
        var addresses = new TrustedClientAddress("127.0.0.1");
        var request = new MockHttpServletRequest();
        request.setRemoteAddr("127.0.0.1");
        request.addHeader("X-Real-IP", "example.test");
        request.addHeader("X-Forwarded-Proto", "https");
        assertThatThrownBy(() -> addresses.resolve(request)).isInstanceOf(AdmissionFailure.class);
    }
}
