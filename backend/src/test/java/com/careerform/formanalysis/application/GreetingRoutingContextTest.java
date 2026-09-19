package com.careerform.formanalysis.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;

class GreetingRoutingContextTest {

    @Test
    void bindsOpaqueContextToHostPathAndExpiry() {
        AtomicReference<Instant> now = new AtomicReference<>(
            Instant.parse("2026-09-19T00:00:00Z")
        );
        Clock clock = new Clock() {
            @Override public ZoneId getZone() { return ZoneOffset.UTC; }
            @Override public Clock withZone(ZoneId zone) { return this; }
            @Override public Instant instant() { return now.get(); }
        };
        GreetingRoutingContext contexts = new GreetingRoutingContext(clock, new SecureRandom());

        String token = contexts.issue(
            "CAREER.HYUNDAI-AUTOEVER.COM.", "/ko/o/*/apply"
        );

        assertThat(token).matches("[A-Za-z0-9_-]{32}");
        assertThat(contexts.isValid(token, "career.hyundai-autoever.com", "/ko/o/*/apply"))
            .isTrue();
        assertThat(contexts.isValid(token, "career.other.com", "/ko/o/*/apply"))
            .isFalse();
        assertThat(contexts.isValid(token, "career.hyundai-autoever.com", "/ko/o/*"))
            .isFalse();
        assertThat(contexts.isValid("forged", "career.hyundai-autoever.com", "/ko/o/*/apply"))
            .isFalse();

        now.set(now.get().plus(Duration.ofMinutes(11)));
        assertThat(contexts.isValid(token, "career.hyundai-autoever.com", "/ko/o/*/apply"))
            .isFalse();
    }
}
