package com.careerform.notification;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.time.Instant;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("FCM 응답별 재시도 표")
class RetryPolicyTest {
    private static final Instant NOW = Instant.parse("2030-01-01T00:00:00Z");
    private final RetryPolicy policy = new RetryPolicy(8);

    @Test
    @DisplayName("2xx는 시도 횟수와 무관하게 수락됨이다")
    void acceptsSuccessfulResponses() {
        assertThat(policy.onResponse(new WebPushClient.Response(201, null), 1, NOW)).isEqualTo(new RetryPolicy.Accepted(201));
        assertThat(policy.onResponse(new WebPushClient.Response(200, null), 8, NOW)).isEqualTo(new RetryPolicy.Accepted(200));
        assertThat(policy.onResponse(new WebPushClient.Response(202, Duration.ofSeconds(5)), 3, NOW)).isEqualTo(new RetryPolicy.Accepted(202));
    }

    @Test
    @DisplayName("404와 410은 포기하고 구독을 삭제한다")
    void abandonsGoneSubscriptions() {
        assertThat(policy.onResponse(new WebPushClient.Response(410, null), 1, NOW)).isEqualTo(new RetryPolicy.Abandon(410, "GONE", true));
        assertThat(policy.onResponse(new WebPushClient.Response(404, null), 5, NOW)).isEqualTo(new RetryPolicy.Abandon(404, "GONE", true));
    }

    @Test
    @DisplayName("400·403·413은 구독을 유지한 채 잘못된 요청으로 포기한다")
    void abandonsInvalidRequests() {
        for (var status : new int[] {400, 403, 413}) {
            assertThat(policy.onResponse(new WebPushClient.Response(status, null), 1, NOW)).isEqualTo(new RetryPolicy.Abandon(status, "INVALID_REQUEST", false));
        }
    }

    @Test
    @DisplayName("429와 Retry-After 있는 503은 응답이 준 시각 뒤에 다시 시도하고 없으면 1분 뒤다")
    void retriesAfterServerHint() {
        assertThat(policy.onResponse(new WebPushClient.Response(429, Duration.ofSeconds(30)), 1, NOW))
            .isEqualTo(new RetryPolicy.Retry(NOW.plusSeconds(30), 429, "RETRY_AFTER"));
        assertThat(policy.onResponse(new WebPushClient.Response(429, null), 3, NOW))
            .isEqualTo(new RetryPolicy.Retry(NOW.plus(Duration.ofMinutes(1)), 429, "RETRY_AFTER"));
        assertThat(policy.onResponse(new WebPushClient.Response(503, Duration.ofSeconds(45)), 2, NOW))
            .isEqualTo(new RetryPolicy.Retry(NOW.plusSeconds(45), 503, "RETRY_AFTER"));
        assertThat(policy.onResponse(new WebPushClient.Response(429, Duration.ofHours(5)), 1, NOW))
            .as("Retry-After는 1시간을 넘기지 않는다").isEqualTo(new RetryPolicy.Retry(NOW.plus(Duration.ofHours(1)), 429, "RETRY_AFTER"));
        assertThat(policy.onResponse(new WebPushClient.Response(429, Duration.ofSeconds(30)), 8, NOW))
            .as("마지막 시도에서는 포기한다").isEqualTo(new RetryPolicy.Abandon(429, "MAX_ATTEMPTS", false));
    }

    @Test
    @DisplayName("그 밖의 오류와 시간 초과는 1·2·4·8·16·32·64분 지수 백오프로 재시도하고 8회째에 포기한다")
    void backsOffExponentiallyUntilMaxAttempts() {
        var expected = new long[] {1, 2, 4, 8, 16, 32, 64};
        for (var attempt = 1; attempt <= 7; attempt++) {
            assertThat(policy.onResponse(new WebPushClient.Response(500, null), attempt, NOW))
                .isEqualTo(new RetryPolicy.Retry(NOW.plus(Duration.ofMinutes(expected[attempt - 1])), 500, "SERVER_ERROR"));
        }
        assertThat(policy.onResponse(new WebPushClient.Response(500, null), 8, NOW)).isEqualTo(new RetryPolicy.Abandon(500, "MAX_ATTEMPTS", false));
        assertThat(policy.onResponse(new WebPushClient.Response(503, null), 1, NOW))
            .isEqualTo(new RetryPolicy.Retry(NOW.plus(Duration.ofMinutes(1)), 503, "SERVER_ERROR"));
        assertThat(policy.onResponse(new WebPushClient.Response(401, null), 2, NOW))
            .isEqualTo(new RetryPolicy.Retry(NOW.plus(Duration.ofMinutes(2)), 401, "UNEXPECTED_STATUS"));
        assertThat(policy.onResponse(new WebPushClient.Response(302, null), 1, NOW))
            .isEqualTo(new RetryPolicy.Retry(NOW.plus(Duration.ofMinutes(1)), 302, "UNEXPECTED_STATUS"));
        assertThat(policy.onFailure(new HttpTimeoutException("synthetic"), 1, NOW)).isEqualTo(new RetryPolicy.Retry(NOW.plus(Duration.ofMinutes(1)), null, "TIMEOUT"));
        assertThat(policy.onFailure(new IOException("synthetic"), 3, NOW)).isEqualTo(new RetryPolicy.Retry(NOW.plus(Duration.ofMinutes(4)), null, "IO_ERROR"));
        assertThat(policy.onFailure(new IOException("synthetic"), 8, NOW)).isEqualTo(new RetryPolicy.Abandon(null, "MAX_ATTEMPTS", false));
        assertThat(RetryPolicy.backoff(9)).as("8회를 넘는 설정에서도 64분을 넘지 않는다").isEqualTo(Duration.ofMinutes(64));
        assertThat(new RetryPolicy(3).onResponse(new WebPushClient.Response(500, null), 3, NOW)).isEqualTo(new RetryPolicy.Abandon(500, "MAX_ATTEMPTS", false));
    }
}
