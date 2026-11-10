package com.careerform.notification;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.careerform.monitoring.ExternalCallMetrics;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

@DisplayName("발송 한 건 실행")
class PushDeliveryExecutorTest {
    private static final Instant NOW = Instant.parse("2030-01-01T00:00:00Z");
    private final MemoryNotificationStore store = new MemoryNotificationStore();
    private final MutableClock clock = new MutableClock(NOW);
    private final FakeWebPushClient client = new FakeWebPushClient();
    private final SimpleMeterRegistry meters = new SimpleMeterRegistry();
    private final PushDispatchMetrics metrics = new PushDispatchMetrics(meters, new ExternalCallMetrics(meters));

    /**
     * 공고 조회가 캐시 맵의 잠금 안에서 일어나면, 같은 공고를 동시에 처리하는 두 번째 실행은 첫 조회가 끝날 때까지 맵 잠금에서 기다린다.
     * 가상 스레드는 그 잠금을 쥐거나 기다리는 동안 운반 스레드를 놓지 못해, CPU가 적은 컨테이너에서 발송 전체가 멈춘다(CF-445 리허설에서 확인).
     */
    @Test
    @DisplayName("같은 공고를 동시에 처리해도 공고 조회가 캐시 잠금 안에서 서로를 막지 않는다")
    void lookupDoesNotHoldCacheLock() throws Exception {
        var p256dh = VapidTestKeys.generate().publicKey;
        var auth = randomAuth();
        for (var id : List.of("s1", "s2")) {
            store.insertSubscription(new PushSubscription(id, "https://fcm.googleapis.com/fcm/send/" + id, p256dh, auth, NOW, null, null));
        }
        new JobPostingService(store, JobCategories.load(), clock).register(new JobPostingService.Draft("합성 회사", List.of("IT.BACKEND"),
            "https://careers.example.test/jobs/pinned", NOW.minusSeconds(60), NOW.plusSeconds(86400)));
        var bothLookingUp = new CountDownLatch(2);
        var blocking = (NotificationStore) Proxy.newProxyInstance(NotificationStore.class.getClassLoader(), new Class<?>[] {NotificationStore.class},
            (proxy, method, arguments) -> {
                if (method.getName().equals("findPosting")) {
                    bothLookingUp.countDown();
                    bothLookingUp.await(2, TimeUnit.SECONDS);
                }
                try { return method.invoke(store, arguments); }
                catch (InvocationTargetException exception) { throw exception.getCause(); }
            });
        var executor = new PushDeliveryExecutor(blocking, client, new RetryPolicy(8), clock, metrics);
        var postings = new ConcurrentHashMap<String, Optional<JobPosting>>();
        var claimed = store.findDueDeliveries(NOW, 10).stream().map(delivery -> store.claimDelivery(delivery, NOW, NOW.plusSeconds(120)).orElseThrow()).toList();
        try (var threads = Executors.newFixedThreadPool(2)) {
            var first = threads.submit(() -> executor.execute(claimed.get(0), NOW, postings));
            var second = threads.submit(() -> executor.execute(claimed.get(1), NOW, postings));
            assertThat(first.get(10, TimeUnit.SECONDS)).isEqualTo(PushDeliveryExecutor.Outcome.ACCEPTED);
            assertThat(second.get(10, TimeUnit.SECONDS)).isEqualTo(PushDeliveryExecutor.Outcome.ACCEPTED);
        }
        assertThat(bothLookingUp.getCount()).as("두 실행이 동시에 공고를 조회했어야 한다").isZero();
        assertThat(postings).hasSize(1);
    }

    @Test
    @DisplayName("한 번 조회한 공고는 같은 캐시로 다시 조회하지 않는다")
    void reusesCachedPosting() {
        var p256dh = VapidTestKeys.generate().publicKey;
        var auth = randomAuth();
        for (var id : List.of("s1", "s2")) {
            store.insertSubscription(new PushSubscription(id, "https://fcm.googleapis.com/fcm/send/" + id, p256dh, auth, NOW, null, null));
        }
        new JobPostingService(store, JobCategories.load(), clock).register(new JobPostingService.Draft("합성 회사", List.of("IT.BACKEND"),
            "https://careers.example.test/jobs/cached", NOW.minusSeconds(60), NOW.plusSeconds(86400)));
        var lookups = new java.util.concurrent.atomic.AtomicInteger();
        var counting = (NotificationStore) Proxy.newProxyInstance(NotificationStore.class.getClassLoader(), new Class<?>[] {NotificationStore.class},
            (proxy, method, arguments) -> {
                if (method.getName().equals("findPosting")) { lookups.incrementAndGet(); }
                try { return method.invoke(store, arguments); }
                catch (InvocationTargetException exception) { throw exception.getCause(); }
            });
        var executor = new PushDeliveryExecutor(counting, client, new RetryPolicy(8), clock, metrics);
        var postings = new ConcurrentHashMap<String, Optional<JobPosting>>();
        for (var delivery : store.findDueDeliveries(NOW, 10)) {
            executor.execute(store.claimDelivery(delivery, NOW, NOW.plusSeconds(120)).orElseThrow(), NOW, postings);
        }
        assertThat(lookups.get()).isEqualTo(1);
        assertThat(client.calls()).hasSize(2);
    }

    private static String randomAuth() {
        var bytes = new byte[16];
        new SecureRandom().nextBytes(bytes);
        return VapidTestKeys.base64Url(bytes);
    }
}
