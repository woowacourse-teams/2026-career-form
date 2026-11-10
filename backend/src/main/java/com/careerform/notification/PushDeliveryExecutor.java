package com.careerform.notification;

import java.io.IOException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.careerform.monitoring.ExternalCallMetrics;

/**
 * 선점한 발송 한 건의 실행. 구독의 현재 받을 직무를 공고와 재검사하고, Web Push를 보내고, 재시도 표에 따라 상태를 바꾼다.
 * 발송기(direct)와 워커(sqs)가 같이 쓴다. 로그에는 발송 ID·공고 ID·응답 코드·소요 시간만 남긴다.
 */
public final class PushDeliveryExecutor {
    private static final Logger log = LoggerFactory.getLogger(PushDeliveryExecutor.class);
    private final NotificationStore store;
    private final WebPushClient client;
    private final RetryPolicy policy;
    private final Clock clock;
    private final PushDispatchMetrics metrics;

    public PushDeliveryExecutor(NotificationStore store, WebPushClient client, RetryPolicy policy, Clock clock, PushDispatchMetrics metrics) {
        this.store = store;
        this.client = client;
        this.policy = policy;
        this.clock = clock;
        this.metrics = metrics;
    }

    /** STALE은 리스를 잃어 반영하지 않은 완료, INTERRUPTED는 호출 도중 끊겨 발송 중으로 남은 건이다. */
    public enum Outcome { ACCEPTED, RETRIED, ABANDONED, STALE, INTERRUPTED }

    /** now는 선점 시각이다. 마감 판단과 TTL의 기준으로 쓴다. */
    public Outcome execute(PushDelivery claimed, Instant now, Map<String, Optional<JobPosting>> postings) {
        try {
            var posting = postings.computeIfAbsent(claimed.postingId(), store::findPosting);
            if (posting.isEmpty()) { return finish(claimed, claimed.abandoned(claimed.lastResponseCode(), "POSTING_MISSING"), 0); }
            if (!now.isBefore(posting.get().closesAt())) { return finish(claimed, claimed.abandoned(claimed.lastResponseCode(), "DEADLINE_PASSED"), 0); }
            var subscription = store.findSubscription(claimed.subscriptionId());
            if (subscription.isEmpty()) { return finish(claimed, claimed.abandoned(claimed.lastResponseCode(), "SUBSCRIPTION_MISSING"), 0); }
            if (!receives(posting.get(), subscription.get())) { return finish(claimed, claimed.abandoned(claimed.lastResponseCode(), "FILTER_MISMATCH"), 0); }
            var ttl = Duration.between(now, posting.get().closesAt());
            var payload = PushPayload.of(posting.get(), clock.instant());
            var callStarted = System.nanoTime();
            RetryPolicy.Decision decision;
            try {
                var response = client.send(subscription.get(), payload, ttl);
                decision = policy.onResponse(response, claimed.attempts(), clock.instant());
                metrics.send(sendOutcome(decision), System.nanoTime() - callStarted, response.statusCode() >= 400, false);
            } catch (IOException exception) {
                var timeout = ExternalCallMetrics.isTimeout(exception);
                decision = policy.onFailure(exception, claimed.attempts(), clock.instant());
                metrics.send(timeout ? "timeout" : "error", System.nanoTime() - callStarted, true, timeout);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                log.warn("PUSH_SEND_INTERRUPTED postingId={} deliveryId={} attempt={}", claimed.postingId(), claimed.id(), claimed.attempts());
                return Outcome.INTERRUPTED;
            }
            return apply(claimed, decision, TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - callStarted));
        } catch (RuntimeException exception) {
            var decision = policy.onFailure(exception, claimed.attempts(), clock.instant());
            log.warn("PUSH_DELIVERY_FAILED postingId={} deliveryId={} attempt={} failure={}", claimed.postingId(), claimed.id(), claimed.attempts(),
                exception.getClass().getSimpleName());
            return apply(claimed, decision, 0);
        }
    }

    /** 선점 뒤 재검사. roles가 없는 레거시 공고와 받을 직무를 고르지 않은 구독은 통과하고, 직무를 고른 구독은 공고와 겹쳐야 한다. */
    private boolean receives(JobPosting posting, PushSubscription subscription) {
        if (posting.roles() == null) { return true; }
        var selected = subscription.roles();
        if (selected == null || selected.isEmpty()) { return true; }
        return selected.stream().anyMatch(posting.roles()::contains);
    }

    private Outcome apply(PushDelivery claimed, RetryPolicy.Decision decision, long durationMs) {
        return switch (decision) {
            case RetryPolicy.Accepted accepted -> finish(claimed, claimed.accepted(accepted.statusCode()), durationMs);
            case RetryPolicy.Retry retry -> finish(claimed, claimed.retry(retry.nextAttemptAt(), retry.statusCode(), retry.reason()), durationMs);
            case RetryPolicy.Abandon abandon -> {
                if (abandon.removeSubscription()) { store.deleteSubscription(claimed.subscriptionId()); }
                if ("INVALID_REQUEST".equals(abandon.reason())) {
                    log.warn("PUSH_INVALID_REQUEST postingId={} deliveryId={} attempt={} responseCode={}", claimed.postingId(), claimed.id(),
                        claimed.attempts(), abandon.statusCode());
                }
                yield finish(claimed, claimed.abandoned(abandon.statusCode(), abandon.reason()), durationMs);
            }
        };
    }

    private Outcome finish(PushDelivery claimed, PushDelivery next, long durationMs) {
        if (!store.completeDelivery(claimed, next)) {
            log.info("PUSH_RESULT_STALE postingId={} deliveryId={} attempt={}", claimed.postingId(), claimed.id(), claimed.attempts());
            return Outcome.STALE;
        }
        var outcome = switch (next.status()) {
            case ACCEPTED -> {
                metrics.latency(Duration.between(next.scheduledAt(), clock.instant()));
                yield Outcome.ACCEPTED;
            }
            case PENDING -> Outcome.RETRIED;
            case ABANDONED -> Outcome.ABANDONED;
            case SENDING -> throw new IllegalStateException("Delivery cannot finish as SENDING");
        };
        var label = switch (outcome) {
            case ACCEPTED -> "accepted";
            case RETRIED -> "retry";
            default -> "abandoned";
        };
        metrics.delivery(label, next.lastReason());
        log.info("PUSH_RESULT postingId={} deliveryId={} attempt={} outcome={} reason={} responseCode={} nextAttemptAt={} durationMs={}",
            next.postingId(), next.id(), next.attempts(), label, next.lastReason(), next.lastResponseCode(),
            next.status() == PushDelivery.Status.PENDING ? next.nextAttemptAt() : null, durationMs);
        return outcome;
    }

    private static String sendOutcome(RetryPolicy.Decision decision) {
        return switch (decision) {
            case RetryPolicy.Accepted accepted -> "accepted";
            case RetryPolicy.Retry retry -> "RETRY_AFTER".equals(retry.reason()) ? "retry_after" : "failure";
            case RetryPolicy.Abandon abandon -> switch (abandon.reason()) {
                case "GONE" -> "gone";
                case "INVALID_REQUEST" -> "invalid";
                default -> "failure";
            };
        };
    }
}
