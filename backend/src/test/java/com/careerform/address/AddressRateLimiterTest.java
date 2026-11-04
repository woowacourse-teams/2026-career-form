package com.careerform.address;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("주소 검색 고정 창 요청 제한")
class AddressRateLimiterTest {
    private static final Duration WINDOW = Duration.ofSeconds(60);

    private static final class MutableClock extends Clock {
        private Instant now = Instant.parse("2030-01-01T00:00:00Z");

        void advance(Duration duration) { now = now.plus(duration); }

        @Override public ZoneId getZone() { return ZoneOffset.UTC; }

        @Override public Clock withZone(ZoneId zone) { return this; }

        @Override public Instant instant() { return now; }
    }

    private final MutableClock clock = new MutableClock();

    @Test
    @DisplayName("같은 창에서 클라이언트별 한도를 넘으면 거부하고 다른 클라이언트는 영향받지 않는다")
    void limitsPerClientWithinWindow() {
        var limiter = new AddressRateLimiter(2, WINDOW, 10, clock);

        assertThat(limiter.tryAcquire("client-a")).isTrue();
        assertThat(limiter.tryAcquire("client-a")).isTrue();
        assertThat(limiter.tryAcquire("client-a")).isFalse();
        assertThat(limiter.tryAcquire("client-b")).isTrue();
    }

    @Test
    @DisplayName("창이 끝나는 시각부터 다시 허용하고 직전 시각까지는 거부한다")
    void resetsExactlyAtWindowBoundary() {
        var limiter = new AddressRateLimiter(1, WINDOW, 10, clock);
        assertThat(limiter.tryAcquire("client-a")).isTrue();

        clock.advance(WINDOW.minusMillis(1));
        assertThat(limiter.tryAcquire("client-a")).isFalse();

        clock.advance(Duration.ofMillis(1));
        assertThat(limiter.tryAcquire("client-a")).isTrue();
    }

    @Test
    @DisplayName("추적 클라이언트 수가 상한에 닿으면 새 클라이언트만 거부하고 창이 바뀌면 메모리를 비운다")
    void boundsTrackedClients() {
        var limiter = new AddressRateLimiter(5, WINDOW, 2, clock);
        assertThat(limiter.tryAcquire("client-a")).isTrue();
        assertThat(limiter.tryAcquire("client-b")).isTrue();

        assertThat(limiter.tryAcquire("client-c")).isFalse();
        assertThat(limiter.tryAcquire("client-a")).isTrue();
        assertThat(limiter.trackedClients()).isEqualTo(2);

        clock.advance(WINDOW);
        assertThat(limiter.tryAcquire("client-c")).isTrue();
        assertThat(limiter.trackedClients()).isEqualTo(1);
    }

    @Test
    @DisplayName("0 이하의 제한 설정은 시작 시 거부한다")
    void rejectsInvalidConfiguration() {
        assertThatThrownBy(() -> new AddressRateLimiter(0, WINDOW, 10, clock)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new AddressRateLimiter(1, Duration.ZERO, 10, clock)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new AddressRateLimiter(1, WINDOW, 0, clock)).isInstanceOf(IllegalStateException.class);
    }
}
