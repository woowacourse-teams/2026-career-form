package com.careerform.formanalysis.infrastructure.dns;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import com.careerform.formanalysis.application.port.GreetingDomainEvidence.Decision;
import com.careerform.formanalysis.infrastructure.dns.GreetingDnsEvidence.Alias;
import com.careerform.formanalysis.infrastructure.dns.GreetingDnsEvidence.NoAlias;
import com.careerform.formanalysis.infrastructure.dns.GreetingDnsEvidence.LookupFailure;

class GreetingDnsEvidenceTest {
    private static final String PATH = "/ko/o/*/apply";

    @Test
    void arbitraryCustomDomainResolvesThroughBoundedCnameChain() {
        Map<String, String> aliases = Map.of("new-customer.example.org", "edge.example.org",
            "edge.example.org", "TENANT.career.greetinghr.com.");
        List<String> queried = new ArrayList<>();
        var evidence = new GreetingDnsEvidence(host -> {
            queried.add(host);
            return new Alias(aliases.get(host));
        });
        assertThat(evidence.classify("new-customer.example.org", PATH)).isEqualTo(Decision.POSITIVE);
        assertThat(queried).containsExactly("new-customer.example.org", "edge.example.org");
        assertThat(evidence.classify("new-customer.example.org", "/en/o/123/apply")).isEqualTo(Decision.POSITIVE);
        assertThat(queried).hasSize(2);
    }

    @Test
    void defaultDomainNeedsNoDnsLookup() {
        var evidence = new GreetingDnsEvidence(host -> { throw new AssertionError("no lookup"); });
        assertThat(evidence.classify("tenant.career.greetinghr.com", PATH)).isEqualTo(Decision.POSITIVE);
    }

    @ParameterizedTest
    @ValueSource(strings = {"tenant.career.greetinghr.com.evil.org", "evilcareer.greetinghr.com", "career.greetinghr.com", "a.b.career.greetinghr.com"})
    void lookalikeCnameDoesNotConfirmGreeting(String alias) {
        var evidence = new GreetingDnsEvidence(host -> host.equals("new-customer.example.org")
            ? new Alias(alias) : new NoAlias());
        assertThat(evidence.classify("new-customer.example.org", PATH)).isEqualTo(Decision.NO_POSITIVE_EVIDENCE);
    }

    @ParameterizedTest
    @ValueSource(strings = {"localhost", "127.0.0.1", "10.0.0.1", "host.local", "host.internal", "host.test", "[::1]", "host.example.org:8080"})
    void privateOrInvalidHostDoesNotQueryDns(String host) {
        var evidence = new GreetingDnsEvidence(name -> { throw new AssertionError("no lookup"); });
        assertThat(evidence.classify(host, PATH)).isEqualTo(Decision.NO_POSITIVE_EVIDENCE);
    }

    @Test
    void unrelatedPathDoesNotQueryDns() {
        var evidence = new GreetingDnsEvidence(host -> { throw new AssertionError("no lookup"); });
        assertThat(evidence.classify("new-customer.example.org", "/home")).isEqualTo(Decision.NO_POSITIVE_EVIDENCE);
    }

    @Test
    void failureAndUnresolvedChainsRemainUnavailable() {
        assertThat(new GreetingDnsEvidence(host -> new LookupFailure()).classify("new-customer.example.org", PATH))
            .isEqualTo(Decision.RETRYABLE_FAILURE);
        assertThat(new GreetingDnsEvidence(host -> new Alias(host)).classify("new-customer.example.org", PATH))
            .isEqualTo(Decision.RETRYABLE_FAILURE);
        AtomicInteger calls = new AtomicInteger();
        var evidence = new GreetingDnsEvidence(host -> new Alias("hop" + calls.incrementAndGet() + ".example.org"));
        assertThat(evidence.classify("new-customer.example.org", PATH)).isEqualTo(Decision.RETRYABLE_FAILURE);
        assertThat(calls).hasValue(3);
    }

    @Test
    void domainCacheIsBoundedAndDoesNotBlockUncachedLookup() {
        var evidence = new GreetingDnsEvidence(host -> new Alias("tenant.career.greetinghr.com"));
        for (int i = 0; i < 4100; i++) {
            assertThat(evidence.classify("customer" + i + ".example.org", PATH)).isEqualTo(Decision.POSITIVE);
        }
        assertThat(evidence.cachedHostCount()).isEqualTo(4096);
    }
}
