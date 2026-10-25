package com.careerform.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.util.Set;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("발송기 설정 범위")
class PushSettingsTest {
    @Test
    @DisplayName("기본값은 60초 주기, 동시성 20, 8회, 리스 120초, 시간 초과 10초, FCM 호스트다")
    void defaultsMatchContract() {
        var settings = PushSettings.defaults();
        assertThat(settings.dispatchInterval()).isEqualTo(Duration.ofSeconds(60));
        assertThat(settings.concurrency()).isEqualTo(20);
        assertThat(settings.maxAttempts()).isEqualTo(8);
        assertThat(settings.lease()).isEqualTo(Duration.ofSeconds(120));
        assertThat(settings.timeout()).isEqualTo(Duration.ofSeconds(10));
        assertThat(settings.allowedEndpointHosts()).containsExactly("fcm.googleapis.com");
    }

    @Test
    @DisplayName("시연용 10초 주기는 허용하고 그보다 짧거나 범위를 벗어난 값은 거절한다")
    void rejectsOutOfRangeValues() {
        var base = PushSettings.defaults();
        assertThat(base.withDispatchInterval(Duration.ofSeconds(10)).dispatchInterval()).isEqualTo(Duration.ofSeconds(10));
        assertThatThrownBy(() -> base.withDispatchInterval(Duration.ofSeconds(9))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> base.withDispatchInterval(Duration.ofHours(2))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new PushSettings(base.dispatchInterval(), 0, 8, base.lease(), base.timeout(), base.batchSize(), base.maxPerCycle(), base.allowedEndpointHosts()))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new PushSettings(base.dispatchInterval(), 20, 0, base.lease(), base.timeout(), base.batchSize(), base.maxPerCycle(), base.allowedEndpointHosts()))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new PushSettings(base.dispatchInterval(), 20, 8, Duration.ofSeconds(10), Duration.ofSeconds(10), base.batchSize(), base.maxPerCycle(), base.allowedEndpointHosts()))
            .as("리스는 호출 시간 초과보다 길어야 한다").isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new PushSettings(base.dispatchInterval(), 20, 8, base.lease(), base.timeout(), 0, base.maxPerCycle(), base.allowedEndpointHosts()))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new PushSettings(base.dispatchInterval(), 20, 8, base.lease(), base.timeout(), base.batchSize(), base.batchSize() - 1, base.allowedEndpointHosts()))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new PushSettings(base.dispatchInterval(), 20, 8, base.lease(), base.timeout(), base.batchSize(), base.maxPerCycle(), Set.of()))
            .isInstanceOf(IllegalArgumentException.class);
    }
}
