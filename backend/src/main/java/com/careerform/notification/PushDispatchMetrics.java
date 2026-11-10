package com.careerform.notification;

import java.time.Duration;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

import com.careerform.monitoring.ExternalCallMetrics;

import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;

/** 발송 관측. 라벨은 결과와 이유 코드만 쓰고 식별자, endpoint, 키는 쓰지 않는다. */
public final class PushDispatchMetrics {
    private static final String PROVIDER = "fcm";
    private static final String OPERATION = "push";
    private static final List<String[]> KNOWN_OUTCOMES = List.of(
        new String[] {"accepted", "ACCEPTED"}, new String[] {"retry", "RETRY_AFTER"}, new String[] {"retry", "SERVER_ERROR"},
        new String[] {"retry", "TIMEOUT"}, new String[] {"retry", "IO_ERROR"}, new String[] {"retry", "UNEXPECTED_STATUS"},
        new String[] {"abandoned", "GONE"}, new String[] {"abandoned", "INVALID_REQUEST"}, new String[] {"abandoned", "MAX_ATTEMPTS"},
        new String[] {"abandoned", "DEADLINE_PASSED"}, new String[] {"abandoned", "SUBSCRIPTION_MISSING"}, new String[] {"abandoned", "POSTING_MISSING"},
        new String[] {"abandoned", "FILTER_MISMATCH"});
    private final MeterRegistry registry;
    private final ExternalCallMetrics external;
    private final AtomicLong pendingBacklog = new AtomicLong();
    private final AtomicLong queuedBacklog = new AtomicLong();
    private final AtomicLong sendingBacklog = new AtomicLong();
    private final AtomicLong subscriptionCount = new AtomicLong();

    public PushDispatchMetrics(MeterRegistry registry, ExternalCallMetrics external) {
        this.registry = registry;
        this.external = external;
        for (var outcome : KNOWN_OUTCOMES) { registry.counter("career.form.push.delivery", "outcome", outcome[0], "reason", outcome[1]); }
        registry.counter("career.form.external.timeouts", "provider", PROVIDER, "operation", OPERATION);
        Gauge.builder("career.form.push.backlog", pendingBacklog, AtomicLong::get).tag("status", "pending").register(registry);
        Gauge.builder("career.form.push.backlog", queuedBacklog, AtomicLong::get).tag("status", "queued").register(registry);
        Gauge.builder("career.form.push.backlog", sendingBacklog, AtomicLong::get).tag("status", "sending").register(registry);
        Gauge.builder("career.form.push.subscriptions", subscriptionCount, AtomicLong::get).register(registry);
    }

    /** 예정 시각에서 FCM 수락까지의 지연. 전환 전후 비교의 기준 수치다. */
    public void latency(Duration latency) {
        Timer.builder("career.form.push.delivery.latency")
            .publishPercentiles(0.5, 0.95, 0.99).publishPercentileHistogram()
            .minimumExpectedValue(Duration.ofSeconds(1)).maximumExpectedValue(Duration.ofHours(6))
            .register(registry).record(latency.isNegative() ? Duration.ZERO : latency);
    }

    /** 주기마다 갱신하는 대기·발송 중 백로그와 구독 수. 큐 대기는 SQS 방식에서만 0이 아니다. */
    public void backlog(long pending, long sending) { backlog(pending, 0, sending); }

    public void backlog(long pending, long queued, long sending) {
        pendingBacklog.set(pending);
        queuedBacklog.set(queued);
        sendingBacklog.set(sending);
    }

    public void subscriptions(long count) { subscriptionCount.set(count); }

    /** FCM 호출 한 건의 소요 시간. p50·p99와 히스토그램을 함께 내보낸다. */
    public void send(String outcome, long nanos, boolean failed, boolean timeout) {
        Timer.builder("career.form.push.send").tag("outcome", outcome)
            .publishPercentiles(0.5, 0.99).publishPercentileHistogram()
            .minimumExpectedValue(Duration.ofMillis(10)).maximumExpectedValue(Duration.ofSeconds(60))
            .register(registry).record(Math.max(0, nanos), TimeUnit.NANOSECONDS);
        external.record(PROVIDER, OPERATION, nanos, failed, timeout);
    }

    public void delivery(String outcome, String reason) {
        registry.counter("career.form.push.delivery", "outcome", outcome, "reason", reason).increment();
    }

    /** 릴레이 한 주기. 주기 시간과 처리 건수는 발송기와 같은 이름으로 내 전후를 같은 지표로 비교한다. */
    public void relay(PushRelay.Cycle cycle) {
        Timer.builder("career.form.push.dispatch.cycle").publishPercentiles(0.5, 0.99).register(registry).record(cycle.duration());
        DistributionSummary.builder("career.form.push.dispatch.claimed").register(registry).record(cycle.queued());
        registry.counter("career.form.push.relay.enqueued", "result", "queued").increment(cycle.queued());
        registry.counter("career.form.push.relay.enqueued", "result", "failed").increment(cycle.failed());
    }

    /** 예정 시각(재시도는 다음 시도 시각)에서 큐에 넣을 때까지의 지연. */
    public void relayDelay(Duration delay) {
        Timer.builder("career.form.push.relay.delay").publishPercentiles(0.5, 0.95, 0.99)
            .register(registry).record(delay.isNegative() ? Duration.ZERO : delay);
    }

    /** 큐에 들어간 시각에서 워커가 선점할 때까지의 대기. */
    public void queueWait(Duration wait) {
        Timer.builder("career.form.push.queue.wait").publishPercentiles(0.5, 0.95, 0.99)
            .register(registry).record(wait.isNegative() ? Duration.ZERO : wait);
    }

    /** 워커가 받은 메시지 한 건의 처리 결과: processed·skipped(이미 처리됐거나 다른 쪽이 선점)·invalid·failed·interrupted. */
    public void workerMessage(String result) { registry.counter("career.form.push.worker.messages", "result", result).increment(); }

    public void cycle(PushDispatcher.Cycle cycle) {
        Timer.builder("career.form.push.dispatch.cycle").publishPercentiles(0.5, 0.99).register(registry).record(cycle.duration());
        DistributionSummary.builder("career.form.push.dispatch.claimed").register(registry).record(cycle.claimed());
    }
}
