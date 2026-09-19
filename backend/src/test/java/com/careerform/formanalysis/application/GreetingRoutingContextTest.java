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

    @Test
    void remembersConfirmedSitesWithoutUnboundedGrowth() {
        GreetingRoutingContext contexts = new GreetingRoutingContext();

        assertThat(contexts.rememberPositive(
            "CAREER.HYUNDAI-AUTOEVER.COM.", "/ko/o/*/apply"
        )).isTrue();
        assertThat(contexts.requiresFailClosedOnMissingEvidence(
            "career.hyundai-autoever.com", "/ko/o/*/apply"
        )).isTrue();
        assertThat(contexts.requiresFailClosedOnMissingEvidence(
            "career.hyundai-autoever.com", "/ko/o/*"
        )).isTrue();

        for (int index = 1; index < 4_096; index++) {
            assertThat(contexts.rememberPositive(
                "career" + index + ".example.org", "/ko/o/*/apply"
            )).isTrue();
        }
        assertThat(contexts.rememberPositive(
            "career-over-limit.example.org", "/ko/o/*/apply"
        )).isFalse();
        assertThat(contexts.rememberPositive(
            "career.hyundai-autoever.com", "/ko/o/*/apply"
        )).isTrue();
    }

    @Test
    void freesPositiveSiteCapacityAfterTheExecutionWindow() {
        AtomicReference<Instant> now = new AtomicReference<>(
            Instant.parse("2026-09-19T00:00:00Z")
        );
        Clock clock = new Clock() {
            @Override public ZoneId getZone() { return ZoneOffset.UTC; }
            @Override public Clock withZone(ZoneId zone) { return this; }
            @Override public Instant instant() { return now.get(); }
        };
        GreetingRoutingContext contexts = new GreetingRoutingContext(clock, new SecureRandom());
        for (int index = 0; index < 4_096; index++) {
            assertThat(contexts.rememberPositive(
                "career" + index + ".example.org", "/ko/o/*/apply"
            )).isTrue();
        }
        assertThat(contexts.rememberPositive(
            "career-new.example.org", "/ko/o/*/apply"
        )).isFalse();
        assertThat(contexts.requiresFailClosedOnMissingEvidence(
            "career-new.example.org", "/ko/o/*/apply"
        )).isTrue();

        now.set(now.get().plus(Duration.ofMinutes(11)));
        assertThat(contexts.requiresFailClosedOnMissingEvidence(
            "career-new.example.org", "/ko/o/*/apply"
        )).isTrue();

        now.set(now.get().plus(Duration.ofMinutes(10)));

        assertThat(contexts.requiresFailClosedOnMissingEvidence(
            "career-new.example.org", "/ko/o/*/apply"
        )).isFalse();
        assertThat(contexts.rememberPositive(
            "career-new.example.org", "/ko/o/*/apply"
        )).isTrue();
    }

    @Test
    void tracksDnsPositiveEvidencePerHostAcrossPostingPaths() {
        GreetingRoutingContext contexts = new GreetingRoutingContext();
        for (int posting = 1; posting <= 4_200; posting++) {
            assertThat(contexts.rememberPositive(
                "career.hyundai-autoever.com", "/ko/o/" + posting + "/apply"
            )).isTrue();
        }
        for (int index = 0; index < 4_095; index++) {
            assertThat(contexts.rememberPositive(
                "career" + index + ".example.org", "/ko/o/*/apply"
            )).isTrue();
        }
        assertThat(contexts.rememberPositive(
            "career-over-limit.example.org", "/ko/o/*/apply"
        )).isFalse();
    }
}
