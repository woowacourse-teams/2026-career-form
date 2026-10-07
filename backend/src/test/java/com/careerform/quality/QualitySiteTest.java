package com.careerform.quality;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("검증 가능한 사이트 소속과 미확인 ATS의 분리")
class QualitySiteTest {
    @Test
    void usesPolicyCompanyAndGreetingTenant() {
        assertThat(QualitySite.identify("careers.example.test", "sk", false, false, "run-a").siteId())
            .isEqualTo("careers.example.test|company=sk");
        assertThat(QualitySite.identify("sample.career.greetinghr.com", "greeting", true, false, "run-a").status())
            .isEqualTo(QualitySite.Status.TENANT);
    }

    @Test
    void neverMergesUnverifiedTenantsAcrossRuns() {
        var first = QualitySite.identify("career.greetinghr.com", null, false, false, "run-a");
        var other = QualitySite.identify("career.greetinghr.com", null, false, false, "run-b");
        assertThat(first.status()).isEqualTo(QualitySite.Status.UNVERIFIED);
        assertThat(first.siteId()).isNotEqualTo(other.siteId());
        assertThat(first.host()).isEqualTo(other.host());
    }

    @Test
    void reusesHostOnlyAfterExplicitManualScopeConfirmation() {
        assertThat(QualitySite.identify("careers.example.test", null, false, true, "run-a"))
            .isEqualTo(QualitySite.identify("careers.example.test", null, false, true, "run-b"));
        assertThat(QualitySite.identify("careers.example.test", null, false, true, "run-a").status())
            .isEqualTo(QualitySite.Status.MANUAL);
    }
}
