package com.careerform.notification;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;

import com.careerform.monitoring.ExternalCallMetrics;

/**
 * FCM 응답별 상태 전이. 2xx 수락 / 404·410 포기+구독 삭제 / 429와 Retry-After 있는 503은 그 시각 뒤(없으면 1분, 상한 1시간) /
 * 400·403·413 포기 / 그 밖의 오류와 시간 초과는 1·2·4·8·16·32·64분 지수 백오프. 시도 횟수가 상한에 이르면 포기한다.
 */
public final class RetryPolicy {
    public static final Duration RETRY_AFTER_CAP = Duration.ofHours(1);
    public static final Duration DEFAULT_RETRY_DELAY = Duration.ofMinutes(1);
    private static final int MAX_BACKOFF_EXPONENT = 6;
    private final int maxAttempts;

    public RetryPolicy(int maxAttempts) {
        if (maxAttempts < 1) { throw new IllegalArgumentException("Invalid push max attempts"); }
        this.maxAttempts = maxAttempts;
    }

    public sealed interface Decision permits Accepted, Retry, Abandon { }

    public record Accepted(int statusCode) implements Decision { }

    public record Retry(Instant nextAttemptAt, Integer statusCode, String reason) implements Decision { }

    public record Abandon(Integer statusCode, String reason, boolean removeSubscription) implements Decision { }

    public Decision onResponse(WebPushClient.Response response, int attempt, Instant now) {
        var status = response.statusCode();
        if (status >= 200 && status < 300) { return new Accepted(status); }
        if (status == 404 || status == 410) { return new Abandon(status, "GONE", true); }
        if (status == 400 || status == 403 || status == 413) { return new Abandon(status, "INVALID_REQUEST", false); }
        if (status == 429 || (status == 503 && response.retryAfter() != null)) {
            var delay = response.retryAfter() == null ? DEFAULT_RETRY_DELAY : clamp(response.retryAfter());
            return retryOrAbandon(status, attempt, now.plus(delay), "RETRY_AFTER");
        }
        return retryOrAbandon(status, attempt, now.plus(backoff(attempt)), status >= 500 ? "SERVER_ERROR" : "UNEXPECTED_STATUS");
    }

    public Decision onFailure(Throwable failure, int attempt, Instant now) {
        var reason = ExternalCallMetrics.isTimeout(failure) ? "TIMEOUT" : failure instanceof IOException ? "IO_ERROR" : "INTERNAL_ERROR";
        return retryOrAbandon(null, attempt, now.plus(backoff(attempt)), reason);
    }

    /** attempt번째 실패 뒤의 대기: 1, 2, 4, 8, 16, 32, 64분. 그 이상은 64분을 유지한다. */
    public static Duration backoff(int attempt) {
        return Duration.ofMinutes(1L << Math.min(Math.max(attempt, 1) - 1, MAX_BACKOFF_EXPONENT));
    }

    private Decision retryOrAbandon(Integer status, int attempt, Instant nextAttemptAt, String reason) {
        return attempt >= maxAttempts ? new Abandon(status, "MAX_ATTEMPTS", false) : new Retry(nextAttemptAt, status, reason);
    }

    private static Duration clamp(Duration delay) {
        if (delay.isNegative()) { return Duration.ZERO; }
        return delay.compareTo(RETRY_AFTER_CAP) > 0 ? RETRY_AFTER_CAP : delay;
    }
}
