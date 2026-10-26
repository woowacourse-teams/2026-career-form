package com.careerform.notification;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

import com.careerform.monitoring.ExternalCallMetrics;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

@DisplayName("Web Push 발송기")
@ExtendWith(OutputCaptureExtension.class)
class PushDispatcherTest {
    private static final Instant NOW = Instant.parse("2030-01-01T00:00:00Z");
    private final MemoryNotificationStore store = new MemoryNotificationStore();
    private final MutableClock clock = new MutableClock(NOW);
    private final FakeWebPushClient client = new FakeWebPushClient();
    private final SimpleMeterRegistry meters = new SimpleMeterRegistry();
    private final PushDispatchMetrics metrics = new PushDispatchMetrics(meters, new ExternalCallMetrics(meters));
    private final PushSettings settings = PushSettings.defaults();
    private final PushDispatcher dispatcher = new PushDispatcher(store, client, new RetryPolicy(settings.maxAttempts()), settings, clock, Runnable::run, metrics);
    private final JobPostingService postings = new JobPostingService(store, clock);
    private final String p256dh = VapidTestKeys.generate().publicKey;
    private final String auth = randomAuth();

    @Test
    @DisplayName("예정 시각이 지난 대기 건을 한 주기 안에 보내 수락됨으로 기록하고 다음 주기에는 다시 보내지 않는다")
    void sendsDuePendingDeliveriesOnce() {
        subscribe("s1"); subscribe("s2");
        var postingId = register("https://careers.example.test/jobs/1", NOW.minusSeconds(60), NOW.plusSeconds(7200));
        var cycle = dispatcher.dispatch();
        assertThat(cycle.due()).isEqualTo(2);
        assertThat(cycle.claimed()).isEqualTo(2);
        assertThat(cycle.accepted()).isEqualTo(2);
        assertThat(client.calls()).hasSize(2).allSatisfy(call -> {
            assertThat(call.ttl()).isEqualTo(Duration.ofSeconds(7200));
            assertThat(new String(call.payload(), StandardCharsets.UTF_8)).contains("\"id\":\"" + postingId + "\"", "\"company\":\"합성 회사\"", "\"sentAt\":\"2030-01-01T00:00:00Z\"");
        });
        assertThat(store.deliveries()).hasSize(2).allSatisfy(delivery -> {
            assertThat(delivery.status()).isEqualTo(PushDelivery.Status.ACCEPTED);
            assertThat(delivery.attempts()).isEqualTo(1);
            assertThat(delivery.lastResponseCode()).isEqualTo(201);
            assertThat(delivery.lastReason()).isEqualTo("ACCEPTED");
            assertThat(delivery.lastAttemptAt()).isEqualTo(NOW);
            assertThat(delivery.leaseUntil()).isNull();
        });
        var next = dispatcher.dispatch();
        assertThat(next.due()).isZero();
        assertThat(client.calls()).hasSize(2);
    }

    @Test
    @DisplayName("접수 시작이 미래인 공고는 그 시각 전에는 FCM 호출이 나가지 않는다")
    void waitsForApplicationStart() {
        subscribe("s1");
        register("https://careers.example.test/jobs/2", NOW.plusSeconds(3600), NOW.plusSeconds(86400));
        assertThat(dispatcher.dispatch().due()).isZero();
        assertThat(client.calls()).isEmpty();
        clock.set(NOW.plusSeconds(3600));
        assertThat(dispatcher.dispatch().accepted()).isEqualTo(1);
        assertThat(client.calls()).singleElement().satisfies(call -> assertThat(call.ttl()).isEqualTo(Duration.ofSeconds(82800)));
    }

    @Test
    @DisplayName("발송기 두 개가 같은 대기 건을 집어도 FCM 호출은 건당 한 번만 나간다")
    void twoDispatchersSendEachDeliveryOnce() throws Exception {
        for (var index = 0; index < 50; index++) { subscribe("s" + index); }
        register("https://careers.example.test/jobs/3", NOW.minusSeconds(60), NOW.plusSeconds(86400));
        client.latency = Duration.ofMillis(5);
        var start = new CountDownLatch(1);
        try (var first = Executors.newVirtualThreadPerTaskExecutor(); var second = Executors.newVirtualThreadPerTaskExecutor()) {
            var dispatchers = new PushDispatcher[] {
                new PushDispatcher(store, client, new RetryPolicy(8), settings, clock, first, metrics),
                new PushDispatcher(store, client, new RetryPolicy(8), settings, clock, second, metrics)};
            var cycles = new PushDispatcher.Cycle[2];
            var threads = new Thread[2];
            for (var index = 0; index < 2; index++) {
                var slot = index;
                threads[index] = Thread.ofPlatform().start(() -> {
                    try { start.await(); } catch (InterruptedException exception) { Thread.currentThread().interrupt(); }
                    cycles[slot] = dispatchers[slot].dispatch();
                });
            }
            start.countDown();
            for (var thread : threads) { thread.join(); }
            assertThat(cycles[0].claimed() + cycles[1].claimed()).isEqualTo(50);
        }
        assertThat(client.calls()).hasSize(50);
        assertThat(store.deliveries()).hasSize(50).allMatch(delivery -> delivery.status() == PushDelivery.Status.ACCEPTED && delivery.attempts() == 1);
    }

    @Test
    @DisplayName("호출 도중 멈춘 발송기의 건은 리스 만료 뒤에만 다시 보내고 그 외 건은 중복되지 않는다")
    void recoversExpiredLeaseOnly() {
        subscribe("s1"); subscribe("s2");
        register("https://careers.example.test/jobs/4", NOW.minusSeconds(60), NOW.plusSeconds(86400));
        var crashed = store.findDueDeliveries(NOW, 10).getFirst();
        store.claimDelivery(crashed, NOW, NOW.plus(settings.lease())).orElseThrow();

        var first = dispatcher.dispatch();
        assertThat(first.claimed()).isEqualTo(1);
        assertThat(client.calls()).singleElement().satisfies(call -> assertThat(call.subscriptionId()).isNotEqualTo(crashed.subscriptionId()));
        assertThat(store.findDelivery(crashed.id()).orElseThrow().status()).isEqualTo(PushDelivery.Status.SENDING);

        clock.set(NOW.plus(settings.lease()).minusSeconds(1));
        assertThat(dispatcher.dispatch().due()).isZero();
        clock.set(NOW.plus(settings.lease()));
        var recovered = dispatcher.dispatch();
        assertThat(recovered.claimed()).isEqualTo(1);
        assertThat(recovered.accepted()).isEqualTo(1);
        assertThat(client.calls()).hasSize(2);
        var delivery = store.findDelivery(crashed.id()).orElseThrow();
        assertThat(delivery.status()).isEqualTo(PushDelivery.Status.ACCEPTED);
        assertThat(delivery.attempts()).isEqualTo(2);
    }

    @Test
    @DisplayName("404·410 응답은 구독을 삭제하고 같은 구독의 다른 대기 건은 호출 없이 포기한다")
    void goneRemovesSubscriptionAndAbandonsSiblings() {
        subscribe("s1");
        register("https://careers.example.test/jobs/5", NOW.minusSeconds(60), NOW.plusSeconds(86400));
        register("https://careers.example.test/jobs/6", NOW.minusSeconds(60), NOW.plusSeconds(86400));
        client.always(410);
        var cycle = dispatcher.dispatch();
        assertThat(cycle.abandoned()).isEqualTo(2);
        assertThat(client.calls()).hasSize(1);
        assertThat(store.subscriptionIds()).isEmpty();
        assertThat(store.deliveries()).hasSize(2).allMatch(delivery -> delivery.status() == PushDelivery.Status.ABANDONED);
        assertThat(store.deliveries()).extracting(PushDelivery::lastReason).containsExactlyInAnyOrder("GONE", "SUBSCRIPTION_MISSING");
        assertThat(store.deliveries()).filteredOn(delivery -> "GONE".equals(delivery.lastReason())).singleElement()
            .satisfies(delivery -> assertThat(delivery.lastResponseCode()).isEqualTo(410));
    }

    @Test
    @DisplayName("429는 Retry-After를 지키고 5xx와 시간 초과는 지수 백오프로 재시도한다")
    void honorsRetryAfterAndBacksOff() {
        subscribe("s1");
        register("https://careers.example.test/jobs/7", NOW.minusSeconds(60), NOW.plusSeconds(86400));
        client.always(429, Duration.ofSeconds(30));
        assertThat(dispatcher.dispatch().retried()).isEqualTo(1);
        var delivery = store.deliveries().getFirst();
        assertThat(delivery.status()).isEqualTo(PushDelivery.Status.PENDING);
        assertThat(delivery.attempts()).isEqualTo(1);
        assertThat(delivery.nextAttemptAt()).isEqualTo(NOW.plusSeconds(30));
        assertThat(delivery.lastResponseCode()).isEqualTo(429);
        assertThat(delivery.lastReason()).isEqualTo("RETRY_AFTER");
        assertThat(delivery.leaseUntil()).isNull();

        clock.set(NOW.plusSeconds(10));
        assertThat(dispatcher.dispatch().due()).as("Retry-After 전에는 집지 않는다").isZero();
        clock.set(NOW.plusSeconds(30));
        client.always(503);
        dispatcher.dispatch();
        delivery = store.deliveries().getFirst();
        assertThat(delivery.attempts()).isEqualTo(2);
        assertThat(delivery.nextAttemptAt()).isEqualTo(NOW.plusSeconds(30).plus(Duration.ofMinutes(2)));
        assertThat(delivery.lastReason()).isEqualTo("SERVER_ERROR");

        clock.set(delivery.nextAttemptAt());
        client.fail(new HttpTimeoutException("synthetic timeout"));
        dispatcher.dispatch();
        delivery = store.deliveries().getFirst();
        assertThat(delivery.attempts()).isEqualTo(3);
        assertThat(delivery.nextAttemptAt()).isEqualTo(clock.instant().plus(Duration.ofMinutes(4)));
        assertThat(delivery.lastReason()).isEqualTo("TIMEOUT");
        assertThat(delivery.lastResponseCode()).isNull();

        clock.set(delivery.nextAttemptAt());
        client.fail(new IOException("synthetic connection reset"));
        dispatcher.dispatch();
        delivery = store.deliveries().getFirst();
        assertThat(delivery.attempts()).isEqualTo(4);
        assertThat(delivery.nextAttemptAt()).isEqualTo(clock.instant().plus(Duration.ofMinutes(8)));
        assertThat(delivery.lastReason()).isEqualTo("IO_ERROR");

        clock.set(delivery.nextAttemptAt());
        client.always(201);
        assertThat(dispatcher.dispatch().accepted()).isEqualTo(1);
        assertThat(store.deliveries().getFirst().status()).isEqualTo(PushDelivery.Status.ACCEPTED);
        assertThat(store.deliveries().getFirst().attempts()).isEqualTo(5);
        assertThat(client.calls()).hasSize(5);
        assertThat(meters.get("career.form.external.timeouts").tags("provider", "fcm", "operation", "push").counter().count()).isEqualTo(1);
    }

    @Test
    @DisplayName("시도 8회에 이르면 포기하고 더 호출하지 않는다")
    void abandonsAfterMaxAttempts() {
        subscribe("s1");
        register("https://careers.example.test/jobs/8", NOW.minusSeconds(60), NOW.plus(Duration.ofDays(2)));
        client.always(500);
        for (var round = 0; round < 20 && store.deliveries().getFirst().status() == PushDelivery.Status.PENDING; round++) {
            clock.set(store.deliveries().getFirst().nextAttemptAt());
            dispatcher.dispatch();
        }
        var delivery = store.deliveries().getFirst();
        assertThat(delivery.status()).isEqualTo(PushDelivery.Status.ABANDONED);
        assertThat(delivery.attempts()).isEqualTo(8);
        assertThat(delivery.lastReason()).isEqualTo("MAX_ATTEMPTS");
        assertThat(delivery.lastResponseCode()).isEqualTo(500);
        assertThat(client.calls()).hasSize(8);
        assertThat(clock.instant()).as("백오프 합 1+2+4+8+16+32+64분").isEqualTo(NOW.plus(Duration.ofMinutes(127)));
        clock.set(clock.instant().plus(Duration.ofHours(1)));
        assertThat(dispatcher.dispatch().due()).isZero();
        assertThat(client.calls()).hasSize(8);
    }

    @Test
    @DisplayName("마감이 지난 공고의 발송은 호출 없이 포기한다")
    void abandonsAfterDeadline() {
        subscribe("s1");
        register("https://careers.example.test/jobs/9", NOW.minusSeconds(60), NOW.plus(Duration.ofMinutes(10)));
        client.always(500);
        dispatcher.dispatch();
        for (var round = 0; round < 5 && store.deliveries().getFirst().status() == PushDelivery.Status.PENDING; round++) {
            clock.set(store.deliveries().getFirst().nextAttemptAt());
            dispatcher.dispatch();
        }
        var delivery = store.deliveries().getFirst();
        assertThat(delivery.status()).isEqualTo(PushDelivery.Status.ABANDONED);
        assertThat(delivery.lastReason()).isEqualTo("DEADLINE_PASSED");
        assertThat(delivery.lastResponseCode()).isEqualTo(500);
        assertThat(client.calls()).hasSize(4);
        assertThat(clock.instant()).isAfterOrEqualTo(NOW.plus(Duration.ofMinutes(10)));
    }

    @Test
    @DisplayName("400·403·413은 구독을 유지한 채 포기하고 운영 로그를 남긴다")
    void abandonsInvalidRequestsWithWarning(CapturedOutput output) {
        subscribe("s1");
        register("https://careers.example.test/jobs/10", NOW.minusSeconds(60), NOW.plusSeconds(86400));
        client.always(403);
        assertThat(dispatcher.dispatch().abandoned()).isEqualTo(1);
        var delivery = store.deliveries().getFirst();
        assertThat(delivery.status()).isEqualTo(PushDelivery.Status.ABANDONED);
        assertThat(delivery.lastReason()).isEqualTo("INVALID_REQUEST");
        assertThat(delivery.lastResponseCode()).isEqualTo(403);
        assertThat(store.subscriptionIds()).containsExactly("s1");
        assertThat(output.getAll()).contains("PUSH_INVALID_REQUEST");
    }

    @Test
    @DisplayName("공고가 삭제된 뒤 리스가 만료된 건은 호출 없이 포기한다")
    void abandonsWhenPostingDisappeared() {
        subscribe("s1");
        var postingId = register("https://careers.example.test/jobs/11", NOW.minusSeconds(60), NOW.plusSeconds(86400));
        var claimed = store.claimDelivery(store.findDueDeliveries(NOW, 1).getFirst(), NOW, NOW.plus(settings.lease())).orElseThrow();
        assertThat(postings.delete(postingId)).isTrue();
        clock.set(NOW.plus(settings.lease()));
        var cycle = dispatcher.dispatch();
        assertThat(cycle.abandoned()).isEqualTo(1);
        assertThat(client.calls()).isEmpty();
        assertThat(store.findDelivery(claimed.id()).orElseThrow().lastReason()).isEqualTo("POSTING_MISSING");
    }

    @Test
    @DisplayName("리스를 잃은 뒤의 완료는 반영하지 않고 stale로 센다")
    void countsStaleCompletions() {
        subscribe("s1");
        register("https://careers.example.test/jobs/12", NOW.minusSeconds(60), NOW.plusSeconds(86400));
        client.respond((subscription, call) -> {
            var current = store.deliveries().getFirst();
            store.claimDelivery(current, current.leaseUntil(), current.leaseUntil().plus(settings.lease())).orElseThrow();
            return new WebPushClient.Response(201, null);
        });
        var cycle = dispatcher.dispatch();
        assertThat(cycle.stale()).isEqualTo(1);
        assertThat(cycle.accepted()).isZero();
        var delivery = store.deliveries().getFirst();
        assertThat(delivery.status()).isEqualTo(PushDelivery.Status.SENDING);
        assertThat(delivery.attempts()).isEqualTo(2);
    }

    @Test
    @DisplayName("동시성 한도 안에서만 동시에 보낸다")
    void boundsConcurrency() throws Exception {
        for (var index = 0; index < 12; index++) { subscribe("s" + index); }
        register("https://careers.example.test/jobs/13", NOW.minusSeconds(60), NOW.plusSeconds(86400));
        var narrow = new PushSettings(Duration.ofSeconds(60), 3, 8, Duration.ofSeconds(120), Duration.ofSeconds(10), 500, 20000, Set.of("fcm.googleapis.com"));
        client.latency = Duration.ofMillis(30);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var bounded = new PushDispatcher(store, client, new RetryPolicy(8), narrow, clock, executor, metrics);
            assertThat(bounded.dispatch().accepted()).isEqualTo(12);
        }
        assertThat(client.calls()).hasSize(12);
        assertThat(client.maxInFlight()).isBetween(2, 3);
    }

    @Test
    @DisplayName("로그와 메트릭에 endpoint와 키를 남기지 않고 결과별 건수와 호출 소요를 기록한다")
    void recordsObservabilityWithoutSecrets(CapturedOutput output) {
        store.insertSubscription(new PushSubscription("s1", "https://fcm.googleapis.com/fcm/send/synthetic-endpoint-token-xyz", p256dh, auth, NOW));
        subscribe("s2");
        register("https://careers.example.test/jobs/14", NOW.minusSeconds(60), NOW.plusSeconds(86400));
        var cycle = dispatcher.dispatch();
        assertThat(output.getAll()).contains("PUSH_RESULT", "PUSH_DISPATCH_CYCLE", "EXTERNAL_RESULT provider=fcm operation=push")
            .doesNotContain("synthetic-endpoint-token-xyz", p256dh, auth, "careers.example.test/jobs/14");
        assertThat(meters.get("career.form.push.delivery").tags("outcome", "accepted", "reason", "ACCEPTED").counter().count()).isEqualTo(2);
        assertThat(meters.get("career.form.push.send").tag("outcome", "accepted").timer().count()).isEqualTo(2);
        assertThat(meters.get("career.form.external.call").tags("provider", "fcm", "operation", "push", "outcome", "success").timer().count()).isEqualTo(2);
        assertThat(meters.get("career.form.push.dispatch.cycle").timer().count()).isEqualTo(1);
        assertThat(meters.get("career.form.push.dispatch.claimed").summary().totalAmount()).isEqualTo(2);
        assertThat(meters.find("career.form.push.send").meters()).noneMatch(meter -> meter.getId().getTags().stream()
            .anyMatch(tag -> tag.getValue().contains("fcm.googleapis.com")));
        assertThat(cycle.duration()).isGreaterThanOrEqualTo(Duration.ZERO);
    }

    @Test
    @DisplayName("수락마다 예정→수락 지연을 타이머에 기록하고 주기마다 백로그·구독 수 게이지를 갱신한다")
    void recordsLatencyAndRefreshesGauges() {
        subscribe("s1"); subscribe("s2");
        register("https://careers.example.test/jobs/15", NOW.plusSeconds(3600), NOW.plusSeconds(86400));
        register("https://careers.example.test/jobs/16", NOW.plusSeconds(7200), NOW.plusSeconds(86400));
        clock.set(NOW.plusSeconds(3630));
        assertThat(dispatcher.dispatch().accepted()).isEqualTo(2);
        var latency = meters.get("career.form.push.delivery.latency").timer();
        assertThat(latency.count()).isEqualTo(2);
        assertThat(latency.totalTime(java.util.concurrent.TimeUnit.SECONDS)).isEqualTo(60.0);
        assertThat(latency.max(java.util.concurrent.TimeUnit.SECONDS)).isEqualTo(30.0);
        assertThat(meters.get("career.form.push.backlog").tag("status", "pending").gauge().value()).isEqualTo(2.0);
        assertThat(meters.get("career.form.push.backlog").tag("status", "sending").gauge().value()).isEqualTo(0.0);
        assertThat(meters.get("career.form.push.subscriptions").gauge().value()).isEqualTo(2.0);
        assertThat(meters.find("career.form.push.delivery.latency").meters()).allSatisfy(meter ->
            assertThat(meter.getId().getTags()).noneMatch(tag -> tag.getValue().contains("careers.example.test") || tag.getValue().matches("[0-9a-f]{32}")));
        store.deleteSubscription("s2");
        clock.set(NOW.plusSeconds(7200));
        dispatcher.dispatch();
        assertThat(meters.get("career.form.push.backlog").tag("status", "pending").gauge().value()).isEqualTo(0.0);
        assertThat(meters.get("career.form.push.subscriptions").gauge().value()).isEqualTo(1.0);
    }

    private void subscribe(String id) {
        store.insertSubscription(new PushSubscription(id, "https://fcm.googleapis.com/fcm/send/" + id, p256dh, auth, NOW));
    }

    private String register(String link, Instant opensAt, Instant closesAt) {
        var registered = (JobPostingService.Registered) postings.register(new JobPostingService.Draft("합성 회사", "합성 직무", link, opensAt, closesAt));
        return registered.posting().id();
    }

    private static String randomAuth() {
        var bytes = new byte[16];
        new SecureRandom().nextBytes(bytes);
        return VapidTestKeys.base64Url(bytes);
    }
}
