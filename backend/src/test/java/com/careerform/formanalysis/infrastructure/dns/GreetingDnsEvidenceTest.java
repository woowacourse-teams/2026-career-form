package com.careerform.formanalysis.infrastructure.dns;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;

import com.careerform.formanalysis.application.port.GreetingDomainEvidence.Decision;

class GreetingDnsEvidenceTest {

    private static final String APPLY_PATH = "/ko/o/*/apply";

    @Test
    void recognizesOnlyTheExactGreetingBaseDomainBoundary() {
        AtomicInteger queries = new AtomicInteger();
        GreetingDnsEvidence evidence = new GreetingDnsEvidence(host -> {
            queries.incrementAndGet();
            return new GreetingDnsEvidence.NoAlias();
        }, Set.of());

        assertThat(evidence.classify("kakaomobility.career.greetinghr.com", APPLY_PATH))
            .isEqualTo(Decision.POSITIVE);
        assertThat(evidence.classify("career.greetinghr.com.evil.example", APPLY_PATH))
            .isEqualTo(Decision.NO_POSITIVE_EVIDENCE);
        assertThat(evidence.classify("career.greetinghr.com", APPLY_PATH))
            .isEqualTo(Decision.NO_POSITIVE_EVIDENCE);
        assertThat(queries).hasValue(1);
    }

    @Test
    void recognizesPositiveCustomDomainCnameButNotSimilarTarget() {
        GreetingDnsEvidence evidence = new GreetingDnsEvidence(host ->
            host.equals("career.hyundai-autoever.com")
                ? new GreetingDnsEvidence.Alias("hyundai-autoever.career.greetinghr.com.")
                : new GreetingDnsEvidence.Alias("career.greetinghr.com.evil.example"), Set.of());

        assertThat(evidence.classify("career.hyundai-autoever.com", APPLY_PATH))
            .isEqualTo(Decision.POSITIVE);
        assertThat(evidence.classify("careers.example.com", APPLY_PATH))
            .isEqualTo(Decision.NO_POSITIVE_EVIDENCE);
    }

    @Test
    void keepsNormalNoAliasSeparateFromRetryableDnsFailure() {
        GreetingDnsEvidence absent = new GreetingDnsEvidence(
            host -> new GreetingDnsEvidence.NoAlias(), Set.of());
        GreetingDnsEvidence failed = new GreetingDnsEvidence(
            host -> new GreetingDnsEvidence.LookupFailure(), Set.of());

        assertThat(absent.classify("careers.example.com", APPLY_PATH))
            .isEqualTo(Decision.NO_POSITIVE_EVIDENCE);
        assertThat(failed.classify("careers.example.com", APPLY_PATH))
            .isEqualTo(Decision.RETRYABLE_FAILURE);
    }

    @Test
    void explicitHostRegistrationCoversHiddenCnameWithoutQuery() {
        GreetingDnsEvidence evidence = new GreetingDnsEvidence(
            host -> { throw new AssertionError("registered host must not query DNS"); },
            Set.of("careers.hybecorp.com"));

        assertThat(evidence.classify("CAREERS.HYBECORP.COM.", APPLY_PATH))
            .isEqualTo(Decision.POSITIVE);
    }

    @Test
    void toleratesRepeatedConfiguredHosts() {
        GreetingDnsEvidence evidence = new GreetingDnsEvidence(
            "career.hyundai-autoever.com,career.hyundai-autoever.com"
        );

        assertThat(evidence.classify("career.hyundai-autoever.com", APPLY_PATH))
            .isEqualTo(Decision.POSITIVE);
    }

    @Test
    void rejectsIrrelevantPathsAndLocalTargetsBeforeLookup() {
        GreetingDnsEvidence evidence = new GreetingDnsEvidence(
            host -> { throw new AssertionError("irrelevant page must not query DNS"); },
            Set.of());

        assertThat(evidence.classify("careers.example.com", "/features/career-site"))
            .isEqualTo(Decision.NO_POSITIVE_EVIDENCE);
        assertThat(evidence.classify("localhost:3000", APPLY_PATH))
            .isEqualTo(Decision.NO_POSITIVE_EVIDENCE);
        assertThat(evidence.classify("127.0.0.1", APPLY_PATH))
            .isEqualTo(Decision.NO_POSITIVE_EVIDENCE);
    }
}
