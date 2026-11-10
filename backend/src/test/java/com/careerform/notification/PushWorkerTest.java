package com.careerform.notification;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.net.http.HttpTimeoutException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

import com.careerform.monitoring.ExternalCallMetrics;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

@DisplayName("발송 워커")
@ExtendWith(OutputCaptureExtension.class)
class PushWorkerTest {
    private static final Instant NOW = Instant.parse("2030-01-01T00:00:00Z");
    private static final Duration QUEUE_LEASE = Duration.ofMinutes(15);
    private final Fixture sqs = new Fixture(PushSettings.defaults(), Runnable::run);

    @Test
    @DisplayName("큐에서 꺼낸 건을 선점해 보내고 수락됨으로 기록한 뒤 메시지를 지운다")
    void sendsQueuedDeliveryAndDeletesMessage() throws Exception {
        sqs.subscribe("s1"); sqs.subscribe("s2");
        sqs.register("https://careers.example.test/jobs/1");
        assertThat(sqs.relay.relay().queued()).isEqualTo(2);
        assertThat(sqs.worker.poll(Duration.ZERO)).isEqualTo(2);
        assertThat(sqs.client.calls()).hasSize(2);
        assertThat(sqs.store.deliveries()).hasSize(2).allSatisfy(delivery -> {
            assertThat(delivery.status()).isEqualTo(PushDelivery.Status.ACCEPTED);
            assertThat(delivery.attempts()).isEqualTo(1);
            assertThat(delivery.lastReason()).isEqualTo("ACCEPTED");
            assertThat(delivery.leaseUntil()).isNull();
        });
        assertThat(sqs.queue.size()).isZero();
        assertThat(sqs.worker.poll(Duration.ZERO)).isZero();
    }

    @Test
    @DisplayName("같은 발송 ID의 메시지가 두 번 들어와도 Web Push는 한 번만 나가고 메시지는 둘 다 지운다")
    void duplicateMessageSendsOnce() throws Exception {
        sqs.subscribe("s1");
        sqs.register("https://careers.example.test/jobs/2");
        sqs.relay.relay();
        sqs.queue.put(sqs.store.deliveries().getFirst().id());
        assertThat(sqs.worker.poll(Duration.ZERO)).isEqualTo(2);
        assertThat(sqs.client.calls()).hasSize(1);
        assertThat(sqs.store.deliveries().getFirst().attempts()).isEqualTo(1);
        assertThat(sqs.queue.size()).isZero();
        assertThat(sqs.meters.get("career.form.push.worker.messages").tag("result", "skipped").counter().count()).isEqualTo(1);
    }

    @Test
    @DisplayName("릴레이가 큐에 넣은 직후 표시 전에 멈췄다 다시 돌아도 유실과 중복 발송이 없다")
    void relayCrashAfterEnqueueDoesNotLoseOrDuplicate() throws Exception {
        sqs.subscribe("s1");
        sqs.register("https://careers.example.test/jobs/3");
        var pending = sqs.store.deliveries().getFirst();
        sqs.queue.put(pending.id());
        assertThat(pending.status()).isEqualTo(PushDelivery.Status.PENDING);
        assertThat(sqs.relay.relay().queued()).as("다시 뜬 릴레이는 아직 대기인 건을 한 번 더 넣는다").isEqualTo(1);
        assertThat(sqs.worker.poll(Duration.ZERO)).isEqualTo(2);
        assertThat(sqs.client.calls()).hasSize(1);
        assertThat(sqs.store.deliveries().getFirst().status()).isEqualTo(PushDelivery.Status.ACCEPTED);
        assertThat(sqs.relay.relay().due()).isZero();
        assertThat(sqs.queue.size()).isZero();
    }

    @Test
    @DisplayName("표시 전에 워커가 먼저 보낸 건은 다시 뜬 릴레이가 넣지 않는다")
    void workerClaimsPendingBeforeRelayMarks() throws Exception {
        sqs.subscribe("s1");
        sqs.register("https://careers.example.test/jobs/4");
        sqs.queue.put(sqs.store.deliveries().getFirst().id());
        assertThat(sqs.worker.poll(Duration.ZERO)).isEqualTo(1);
        assertThat(sqs.client.calls()).hasSize(1);
        assertThat(sqs.relay.relay().due()).isZero();
    }

    @Test
    @DisplayName("429는 대기와 다음 시도 시각으로 남기고 메시지를 지우며 그 시각이 지나야 릴레이가 다시 넣는다")
    void retryGoesBackToPendingAndRelayRequeuesWhenDue() throws Exception {
        sqs.subscribe("s1");
        sqs.register("https://careers.example.test/jobs/5");
        sqs.client.always(429, Duration.ofSeconds(90));
        sqs.relay.relay();
        sqs.worker.poll(Duration.ZERO);
        var delivery = sqs.store.deliveries().getFirst();
        assertThat(delivery.status()).isEqualTo(PushDelivery.Status.PENDING);
        assertThat(delivery.nextAttemptAt()).isEqualTo(NOW.plusSeconds(90));
        assertThat(delivery.lastReason()).isEqualTo("RETRY_AFTER");
        assertThat(sqs.queue.size()).isZero();
        sqs.clock.set(NOW.plusSeconds(89));
        assertThat(sqs.relay.relay().due()).as("Retry-After 전에는 넣지 않는다").isZero();
        sqs.clock.set(NOW.plusSeconds(90));
        sqs.client.always(201);
        assertThat(sqs.relay.relay().queued()).isEqualTo(1);
        sqs.worker.poll(Duration.ZERO);
        delivery = sqs.store.deliveries().getFirst();
        assertThat(delivery.status()).isEqualTo(PushDelivery.Status.ACCEPTED);
        assertThat(delivery.attempts()).isEqualTo(2);
        assertThat(sqs.client.calls()).hasSize(2);
    }

    @Test
    @DisplayName("응답별 상태, 사유, 응답 코드, 다음 시도 시각, 구독 삭제가 발송기와 같다")
    void transitionsMatchDirectDispatcher() throws Exception {
        List<java.util.function.Consumer<FakeWebPushClient>> behaviors = List.of(
            client -> client.always(201), client -> client.always(404), client -> client.always(410), client -> client.always(400),
            client -> client.always(403), client -> client.always(413), client -> client.always(429), client -> client.always(429, Duration.ofSeconds(45)),
            client -> client.always(503), client -> client.always(503, Duration.ofSeconds(7200)), client -> client.always(500),
            client -> client.always(302), client -> client.fail(new HttpTimeoutException("synthetic timeout")),
            client -> client.fail(new IOException("synthetic reset")));
        for (var behavior : behaviors) {
            var direct = new Fixture(PushSettings.defaults(), Runnable::run);
            var queued = new Fixture(PushSettings.defaults(), Runnable::run);
            for (var fixture : List.of(direct, queued)) {
                fixture.subscribe("s1");
                fixture.register("https://careers.example.test/jobs/same");
                behavior.accept(fixture.client);
            }
            direct.dispatcher.dispatch();
            queued.relay.relay();
            queued.worker.poll(Duration.ZERO);
            var expected = direct.store.deliveries().getFirst();
            var actual = queued.store.deliveries().getFirst();
            assertThat(actual.status()).isEqualTo(expected.status());
            assertThat(actual.attempts()).isEqualTo(expected.attempts());
            assertThat(actual.lastReason()).isEqualTo(expected.lastReason());
            assertThat(actual.lastResponseCode()).isEqualTo(expected.lastResponseCode());
            assertThat(actual.nextAttemptAt()).isEqualTo(expected.nextAttemptAt());
            assertThat(actual.leaseUntil()).isEqualTo(expected.leaseUntil());
            assertThat(queued.store.subscriptionIds()).isEqualTo(direct.store.subscriptionIds());
        }
    }

    @Test
    @DisplayName("시도 횟수 상한에 이르면 발송기와 같이 포기한다")
    void abandonsAtMaxAttempts() throws Exception {
        var narrow = new PushSettings(Duration.ofSeconds(60), 20, 2, Duration.ofSeconds(120), Duration.ofSeconds(10), 500, 20000, Set.of("fcm.googleapis.com"));
        var fixture = new Fixture(narrow, Runnable::run);
        fixture.subscribe("s1");
        fixture.register("https://careers.example.test/jobs/6");
        fixture.client.always(500);
        fixture.relay.relay();
        fixture.worker.poll(Duration.ZERO);
        fixture.clock.set(fixture.store.deliveries().getFirst().nextAttemptAt());
        fixture.relay.relay();
        fixture.worker.poll(Duration.ZERO);
        var delivery = fixture.store.deliveries().getFirst();
        assertThat(delivery.status()).isEqualTo(PushDelivery.Status.ABANDONED);
        assertThat(delivery.lastReason()).isEqualTo("MAX_ATTEMPTS");
        assertThat(delivery.attempts()).isEqualTo(2);
    }

    @Test
    @DisplayName("워커가 선점한 뒤 죽은 건은 리스가 지난 뒤 릴레이가 다시 넣어 발송된다")
    void crashedWorkerDeliveryIsRedeliveredAfterLease() throws Exception {
        sqs.subscribe("s1");
        sqs.register("https://careers.example.test/jobs/7");
        sqs.relay.relay();
        var id = sqs.store.deliveries().getFirst().id();
        sqs.queue.receive(1, Duration.ZERO);
        sqs.store.claimQueuedDelivery(id, NOW, NOW.plus(sqs.settings.lease())).orElseThrow();
        sqs.queue.redeliver();
        assertThat(sqs.worker.poll(Duration.ZERO)).as("리스가 남은 동안 다시 온 메시지는 보내지 않고 지운다").isEqualTo(1);
        assertThat(sqs.client.calls()).isEmpty();
        assertThat(sqs.queue.size()).isZero();
        sqs.clock.set(NOW.plus(sqs.settings.lease()));
        assertThat(sqs.relay.relay().queued()).isEqualTo(1);
        sqs.worker.poll(Duration.ZERO);
        var delivery = sqs.store.deliveries().getFirst();
        assertThat(delivery.status()).isEqualTo(PushDelivery.Status.ACCEPTED);
        assertThat(delivery.attempts()).isEqualTo(2);
        assertThat(sqs.client.calls()).hasSize(1);
    }

    @Test
    @DisplayName("발송 ID 형식이 아닌 메시지는 지우지 않고 남겨 큐의 재전달 한도 뒤 DLQ로 가게 둔다")
    void leavesUnparseableMessageForDlq(CapturedOutput output) throws Exception {
        sqs.queue.put("{\"endpoint\":\"not-an-id\"}");
        assertThat(sqs.worker.poll(Duration.ZERO)).isEqualTo(1);
        assertThat(sqs.queue.receivedBodies()).hasSize(1);
        assertThat(output).contains("PUSH_WORKER_MESSAGE_INVALID");
        assertThat(output.getOut()).doesNotContain("not-an-id");
        assertThat(sqs.meters.get("career.form.push.worker.messages").tag("result", "invalid").counter().count()).isEqualTo(1);
    }

    @Test
    @DisplayName("이미 끝났거나 없는 발송의 메시지는 보내지 않고 지운다")
    void deletesMessagesForUnclaimableDeliveries() throws Exception {
        sqs.subscribe("s1");
        sqs.register("https://careers.example.test/jobs/8");
        sqs.relay.relay();
        sqs.worker.poll(Duration.ZERO);
        sqs.queue.put(sqs.store.deliveries().getFirst().id());
        sqs.queue.put("0123456789abcdef0123456789abcdef");
        assertThat(sqs.worker.poll(Duration.ZERO)).isEqualTo(2);
        assertThat(sqs.client.calls()).hasSize(1);
        assertThat(sqs.queue.size()).isZero();
    }

    @Test
    @DisplayName("선점이나 실행이 예외로 끝나면 메시지를 지우지 않아 다시 받을 수 있다")
    void keepsMessageWhenStoreFails(CapturedOutput output) throws Exception {
        sqs.subscribe("s1");
        sqs.register("https://careers.example.test/jobs/9");
        sqs.relay.relay();
        var failing = new PushWorker(FailingClaimStore.of(sqs.store), sqs.queue, sqs.deliveries, sqs.settings, sqs.clock, Runnable::run, sqs.metrics);
        assertThat(failing.poll(Duration.ZERO)).isEqualTo(1);
        assertThat(sqs.queue.receivedBodies()).hasSize(1);
        assertThat(output).contains("PUSH_WORKER_FAILED failure=IllegalStateException");
        sqs.queue.redeliver();
        sqs.worker.poll(Duration.ZERO);
        assertThat(sqs.store.deliveries().getFirst().status()).isEqualTo(PushDelivery.Status.ACCEPTED);
    }

    @Test
    @DisplayName("동시 발송 수는 설정한 한도를 넘지 않고 받는 건수도 남은 한도에 맞춘다")
    void neverExceedsConcurrency() throws Exception {
        var narrow = new PushSettings(Duration.ofSeconds(60), 5, 8, Duration.ofSeconds(120), Duration.ofSeconds(10), 500, 20000, Set.of("fcm.googleapis.com"));
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var fixture = new Fixture(narrow, executor);
            for (var index = 0; index < 60; index++) { fixture.subscribe("s" + index); }
            fixture.register("https://careers.example.test/jobs/10");
            fixture.client.latency = Duration.ofMillis(10);
            fixture.relay.relay();
            var received = 0;
            while (received < 60) { received += fixture.worker.poll(Duration.ZERO); }
            fixture.worker.close();
            assertThat(fixture.client.calls()).hasSize(60);
            assertThat(fixture.client.maxInFlight()).isLessThanOrEqualTo(5);
            assertThat(fixture.queue.receiveSizes()).allMatch(size -> size >= 1 && size <= 5);
            assertThat(fixture.store.deliveries()).allMatch(delivery -> delivery.status() == PushDelivery.Status.ACCEPTED && delivery.attempts() == 1);
            assertThat(fixture.queue.size()).isZero();
        }
    }

    @Test
    @DisplayName("한도가 10보다 크면 한 번에 최대 10건만 받는다")
    void receivesAtMostTenPerPoll() throws Exception {
        for (var index = 0; index < 25; index++) { sqs.subscribe("s" + index); }
        sqs.register("https://careers.example.test/jobs/11");
        sqs.relay.relay();
        assertThat(sqs.worker.poll(Duration.ZERO)).isEqualTo(10);
        assertThat(sqs.queue.receiveSizes()).containsExactly(10);
    }

    @Test
    @DisplayName("닫으면 받기를 멈추고 진행 중인 건을 끝낸 뒤 돌아온다")
    void closeStopsReceivingAndFinishesInFlight() throws Exception {
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var fixture = new Fixture(PushSettings.defaults(), executor);
            for (var index = 0; index < 5; index++) { fixture.subscribe("s" + index); }
            fixture.register("https://careers.example.test/jobs/12");
            fixture.client.latency = Duration.ofMillis(150);
            fixture.relay.relay();
            fixture.worker.start();
            var deadline = System.nanoTime() + Duration.ofSeconds(5).toNanos();
            while (fixture.client.maxInFlight() == 0 && System.nanoTime() < deadline) { Thread.sleep(5); }
            fixture.worker.close();
            assertThat(fixture.store.deliveries()).allMatch(delivery -> delivery.status() == PushDelivery.Status.ACCEPTED);
            assertThat(fixture.queue.size()).isZero();
            var polls = fixture.queue.receiveSizes().size();
            Thread.sleep(60);
            assertThat(fixture.queue.receiveSizes()).as("닫은 뒤에는 더 받지 않는다").hasSize(polls);
        }
    }

    @Test
    @DisplayName("큐에 들어간 시각부터 선점까지의 대기와 처리한 메시지 수를 지표로 낸다")
    void recordsQueueWaitAndMessages() throws Exception {
        sqs.subscribe("s1");
        sqs.register("https://careers.example.test/jobs/13");
        sqs.relay.relay();
        sqs.clock.advance(Duration.ofSeconds(4));
        sqs.worker.poll(Duration.ZERO);
        var wait = sqs.meters.get("career.form.push.queue.wait").timer();
        assertThat(wait.count()).isEqualTo(1);
        assertThat(wait.totalTime(java.util.concurrent.TimeUnit.SECONDS)).isEqualTo(4);
        assertThat(sqs.meters.get("career.form.push.worker.messages").tag("result", "processed").counter().count()).isEqualTo(1);
        assertThat(sqs.meters.get("career.form.push.delivery").tags("outcome", "accepted", "reason", "ACCEPTED").counter().count()).isEqualTo(1);
        assertThat(sqs.meters.get("career.form.push.delivery.latency").timer().count()).isEqualTo(1);
    }

    @Test
    @DisplayName("큐 메시지 본문은 발송 ID뿐이고 로그와 지표 라벨에 endpoint, 구독 키, 공고 링크가 없다")
    void keepsSensitiveValuesOutOfQueueLogsAndMetrics(CapturedOutput output) throws Exception {
        sqs.subscribe("s1"); sqs.subscribe("s2");
        sqs.register("https://careers.example.test/jobs/private-link");
        sqs.client.respond((subscription, call) -> new WebPushClient.Response(call == 1 ? 410 : 201, null));
        sqs.relay.relay();
        assertThat(sqs.queue.visibleBodies()).hasSize(2).allMatch(body -> body.matches("[0-9a-f]{32}"));
        sqs.worker.poll(Duration.ZERO);
        var labels = sqs.meters.getMeters().stream().flatMap(meter -> meter.getId().getTags().stream()).map(tag -> tag.getValue()).toList();
        for (var secret : List.of("fcm.googleapis.com", "/fcm/send/", sqs.p256dh, sqs.auth, "careers.example.test", "private-link")) {
            assertThat(output.getAll()).as("로그").doesNotContain(secret);
            assertThat(labels).as("지표 라벨").noneMatch(value -> value.contains(secret));
        }
    }

    @Test
    @DisplayName("닫는 동안 뒤늦게 돌아온 받기 결과는 보내지 않고 큐에 남긴다")
    void doesNotStartDeliveriesReceivedWhileClosing() throws Exception {
        sqs.subscribe("s1");
        sqs.register("https://careers.example.test/jobs/closing");
        sqs.relay.relay();
        var receiving = new java.util.concurrent.CountDownLatch(1);
        var release = new java.util.concurrent.CountDownLatch(1);
        var slow = new PushQueue() {
            @Override public List<String> send(List<String> deliveryIds) { return List.of(); }
            @Override public List<Message> receive(int max, Duration wait) {
                receiving.countDown();
                // 실제 SQS long polling처럼 인터럽트로 풀리지 않는 받기를 흉내 낸다.
                var interrupted = false;
                while (true) {
                    try { if (release.await(5, java.util.concurrent.TimeUnit.SECONDS)) { break; } }
                    catch (InterruptedException exception) { interrupted = true; }
                }
                if (interrupted) { Thread.currentThread().interrupt(); }
                return sqs.queue.receive(max, Duration.ZERO);
            }
            @Override public void delete(Message message) { sqs.queue.delete(message); }
        };
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var worker = new PushWorker(sqs.store, slow, sqs.deliveries, sqs.settings, sqs.clock, executor, sqs.metrics);
            worker.start();
            assertThat(receiving.await(5, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
            var closing = Thread.ofPlatform().start(worker::close);
            Thread.sleep(100);
            release.countDown();
            closing.join(10_000);
            assertThat(closing.isAlive()).isFalse();
        }
        assertThat(sqs.client.calls()).isEmpty();
        assertThat(sqs.store.deliveries().getFirst().status()).isEqualTo(PushDelivery.Status.QUEUED);
        assertThat(sqs.queue.receivedBodies()).as("지우지 않아 가시성 타임아웃 뒤 다시 받을 수 있다").hasSize(1);
    }

    /** 발송기(direct)와 릴레이·워커(sqs)를 같은 저장소 위에 조립한 한 벌. */
    private static final class Fixture {
        final MemoryNotificationStore store = new MemoryNotificationStore();
        final MutableClock clock = new MutableClock(NOW);
        final FakeWebPushClient client = new FakeWebPushClient();
        final SimpleMeterRegistry meters = new SimpleMeterRegistry();
        final PushDispatchMetrics metrics = new PushDispatchMetrics(meters, new ExternalCallMetrics(meters));
        final MemoryPushQueue queue = new MemoryPushQueue(clock);
        final JobPostingService postings = new JobPostingService(store, JobCategories.load(), clock);
        final String p256dh = VapidTestKeys.generate().publicKey;
        final String auth = randomAuth();
        final PushSettings settings;
        final PushDeliveryExecutor deliveries;
        final PushDispatcher dispatcher;
        final PushRelay relay;
        final PushWorker worker;

        Fixture(PushSettings settings, Executor executor) {
            this.settings = settings;
            this.deliveries = new PushDeliveryExecutor(store, client, new RetryPolicy(settings.maxAttempts()), clock, metrics);
            this.dispatcher = new PushDispatcher(store, deliveries, settings, clock, executor, metrics);
            this.relay = new PushRelay(store, queue, settings, QUEUE_LEASE, clock, metrics);
            this.worker = new PushWorker(store, queue, deliveries, settings, clock, executor, metrics);
        }

        void subscribe(String id) {
            store.insertSubscription(new PushSubscription(id, "https://fcm.googleapis.com/fcm/send/" + id, p256dh, auth, NOW, null, null));
        }

        void register(String link) {
            postings.register(new JobPostingService.Draft("합성 회사", List.of("IT.BACKEND"), link, NOW.minusSeconds(60), NOW.plusSeconds(86400)));
        }

        private static String randomAuth() {
            var bytes = new byte[16];
            new SecureRandom().nextBytes(bytes);
            return VapidTestKeys.base64Url(bytes);
        }
    }
}
