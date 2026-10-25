package com.careerform.notification;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** 메모리 구현과 MongoDB 구현이 같은 저장 의미를 가지는지 확인하는 공통 계약. */
abstract class NotificationStoreContract {
    static final Instant NOW = Instant.parse("2030-01-01T00:00:00Z");

    protected abstract NotificationStore store();

    @Test
    @DisplayName("같은 링크의 공고는 한 번만 저장된다")
    void rejectsDuplicateLink() {
        var store = store();
        assertThat(store.insertPosting(posting("p1", "https://careers.example.test/jobs/1", NOW.minusSeconds(60), NOW.plusSeconds(3600)))).isTrue();
        assertThat(store.insertPosting(posting("p2", "https://careers.example.test/jobs/1", NOW.minusSeconds(60), NOW.plusSeconds(3600)))).isFalse();
        assertThat(store.findPostingByLink("https://careers.example.test/jobs/1")).map(JobPosting::id).contains("p1");
        assertThat(store.findPosting("p2")).isEmpty();
    }

    @Test
    @DisplayName("같은 endpoint의 구독은 한 번만 저장되고 endpoint로 찾는다")
    void rejectsDuplicateEndpointAndFindsByEndpoint() {
        var store = store();
        assertThat(store.insertSubscription(subscription("s1", "https://fcm.googleapis.com/fcm/send/synthetic-1"))).isTrue();
        assertThat(store.insertSubscription(subscription("s2", "https://fcm.googleapis.com/fcm/send/synthetic-1"))).isFalse();
        assertThat(store.findSubscriptionByEndpoint("https://fcm.googleapis.com/fcm/send/synthetic-1")).map(PushSubscription::id).contains("s1");
        assertThat(store.subscriptionIds()).containsExactly("s1");
        assertThat(store.deleteSubscriptionByEndpoint("https://fcm.googleapis.com/fcm/send/synthetic-1")).isTrue();
        assertThat(store.deleteSubscriptionByEndpoint("https://fcm.googleapis.com/fcm/send/synthetic-1")).isFalse();
        assertThat(store.subscriptionIds()).isEmpty();
    }

    @Test
    @DisplayName("공고와 구독 쌍이 같은 발송 문서는 하나만 남는다")
    void ignoresDuplicateDeliveryPairs() {
        var store = store();
        store.insertDeliveries(List.of(PushDelivery.pending("d1", "p1", "s1", NOW), PushDelivery.pending("d2", "p1", "s1", NOW),
            PushDelivery.pending("d3", "p1", "s2", NOW)));
        assertThat(store.findDueDeliveries(NOW, 10)).extracting(PushDelivery::id).containsExactly("d1", "d3");
        assertThat(store.deliveryProgress("p1").pending()).isEqualTo(2);
    }

    @Test
    @DisplayName("예정 시각이 지난 대기 건과 리스가 만료된 발송 중 건만 찾는다")
    void findsDueDeliveriesAtBoundaries() {
        var store = store();
        var expiredLease = PushDelivery.pending("lease-expired", "p1", "s3", NOW.minusSeconds(600)).claimed(NOW.minusSeconds(300), NOW);
        var liveLease = PushDelivery.pending("lease-live", "p1", "s4", NOW.minusSeconds(600)).claimed(NOW.minusSeconds(10), NOW.plusSeconds(1));
        var accepted = PushDelivery.pending("accepted", "p1", "s5", NOW.minusSeconds(600)).claimed(NOW.minusSeconds(10), NOW.plusSeconds(60)).accepted(201);
        store.insertDeliveries(List.of(PushDelivery.pending("due-now", "p1", "s1", NOW), PushDelivery.pending("future", "p1", "s2", NOW.plusSeconds(1)),
            expiredLease, liveLease, accepted));
        assertThat(store.findDueDeliveries(NOW, 10)).extracting(PushDelivery::id).containsExactlyInAnyOrder("due-now", "lease-expired");
        assertThat(store.findDueDeliveries(NOW.plusSeconds(1), 10)).extracting(PushDelivery::id)
            .containsExactlyInAnyOrder("due-now", "future", "lease-expired", "lease-live");
        assertThat(store.findDueDeliveries(NOW, 1)).hasSize(1);
    }

    @Test
    @DisplayName("같은 대기 건을 여러 발송기가 선점해도 하나만 성공한다")
    void claimsEachDeliveryOnce() throws Exception {
        var store = store();
        store.insertDeliveries(List.of(PushDelivery.pending("d1", "p1", "s1", NOW)));
        var observed = store.findDueDeliveries(NOW, 1).getFirst();
        var successes = new AtomicInteger();
        var start = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var futures = new java.util.ArrayList<java.util.concurrent.Future<?>>();
            for (var index = 0; index < 20; index++) {
                futures.add(executor.submit(() -> {
                    start.await();
                    if (store.claimDelivery(observed, NOW, NOW.plusSeconds(120)).isPresent()) { successes.incrementAndGet(); }
                    return null;
                }));
            }
            start.countDown();
            for (var future : futures) { future.get(); }
        }
        assertThat(successes.get()).isEqualTo(1);
        var claimed = store.findDelivery("d1").orElseThrow();
        assertThat(claimed.status()).isEqualTo(PushDelivery.Status.SENDING);
        assertThat(claimed.attempts()).isEqualTo(1);
        assertThat(claimed.leaseUntil()).isEqualTo(NOW.plusSeconds(120));
        assertThat(claimed.lastAttemptAt()).isEqualTo(NOW);
        assertThat(store.claimDelivery(claimed, NOW, NOW.plusSeconds(120))).as("리스가 살아 있는 발송 중 건은 선점할 수 없다").isEmpty();
        assertThat(store.claimDelivery(claimed, NOW.plusSeconds(120), NOW.plusSeconds(240))).map(PushDelivery::attempts)
            .as("리스가 만료된 발송 중 건은 다시 선점된다").contains(2);
    }

    @Test
    @DisplayName("완료는 선점한 리스와 시도 횟수가 같을 때만 반영된다")
    void completesOnlyMatchingClaim() {
        var store = store();
        store.insertDeliveries(List.of(PushDelivery.pending("d1", "p1", "s1", NOW)));
        var claimed = store.claimDelivery(store.findDueDeliveries(NOW, 1).getFirst(), NOW, NOW.plusSeconds(120)).orElseThrow();
        var stale = claimed.claimed(NOW.plusSeconds(1), NOW.plusSeconds(300));
        assertThat(store.completeDelivery(stale, stale.accepted(201))).isFalse();
        assertThat(store.completeDelivery(claimed, claimed.retry(NOW.plusSeconds(60), 503, "BACKOFF"))).isTrue();
        var retried = store.findDelivery("d1").orElseThrow();
        assertThat(retried.status()).isEqualTo(PushDelivery.Status.PENDING);
        assertThat(retried.nextAttemptAt()).isEqualTo(NOW.plusSeconds(60));
        assertThat(retried.leaseUntil()).isNull();
        assertThat(retried.lastResponseCode()).isEqualTo(503);
        assertThat(retried.lastReason()).isEqualTo("BACKOFF");
        assertThat(store.completeDelivery(claimed, claimed.accepted(201))).as("이미 완료된 선점은 다시 완료할 수 없다").isFalse();
    }

    @Test
    @DisplayName("공고의 대기 발송만 삭제하고 진행 집계는 상태별 건수와 마지막 시도 시각을 준다")
    void deletesPendingDeliveriesOnlyAndAggregatesProgress() {
        var store = store();
        store.insertDeliveries(List.of(PushDelivery.pending("pending", "p1", "s1", NOW), PushDelivery.pending("other", "p2", "s1", NOW),
            PushDelivery.pending("accepted", "p1", "s2", NOW.minusSeconds(60)).claimed(NOW.minusSeconds(30), NOW.plusSeconds(90)).accepted(201),
            PushDelivery.pending("sending", "p1", "s3", NOW.minusSeconds(60)).claimed(NOW.minusSeconds(5), NOW.plusSeconds(115)),
            PushDelivery.pending("abandoned", "p1", "s4", NOW.minusSeconds(60)).claimed(NOW.minusSeconds(50), NOW.plusSeconds(70)).abandoned(410, "GONE")));
        var progress = store.deliveryProgress("p1");
        assertThat(progress).isEqualTo(new DeliveryProgress(1, 1, 1, 1, NOW.minusSeconds(5)));
        assertThat(store.deletePendingDeliveries("p1")).isEqualTo(1);
        assertThat(store.findDelivery("pending")).isEmpty();
        assertThat(store.findDelivery("accepted")).isPresent();
        assertThat(store.findDelivery("other")).isPresent();
        assertThat(store.deliveryProgress("p1")).isEqualTo(new DeliveryProgress(0, 1, 1, 1, NOW.minusSeconds(5)));
        assertThat(store.deliveryProgress("missing")).isEqualTo(DeliveryProgress.empty());
    }

    @Test
    @DisplayName("진행 중 목록은 접수 시작 이후 마감 전인 공고만 마감순으로 준다")
    void listsOpenPostingsWithinWindowSortedByDeadline() {
        var store = store();
        store.insertPosting(posting("later-deadline", "https://careers.example.test/jobs/a", NOW.minusSeconds(60), NOW.plusSeconds(7200)));
        store.insertPosting(posting("opens-now", "https://careers.example.test/jobs/b", NOW, NOW.plusSeconds(3600)));
        store.insertPosting(posting("future", "https://careers.example.test/jobs/c", NOW.plusSeconds(1), NOW.plusSeconds(3600)));
        store.insertPosting(posting("closes-now", "https://careers.example.test/jobs/d", NOW.minusSeconds(60), NOW));
        assertThat(store.listOpenPostings(NOW)).extracting(JobPosting::id).containsExactly("opens-now", "later-deadline");
        assertThat(store.listPostings()).hasSize(4);
        assertThat(store.deletePosting("future")).isTrue();
        assertThat(store.deletePosting("future")).isFalse();
        assertThat(store.listPostings()).extracting(JobPosting::id).doesNotContain("future");
    }

    static JobPosting posting(String id, String link, Instant opensAt, Instant closesAt) {
        return new JobPosting(id, "합성 회사", "합성 직무", link, opensAt, closesAt, NOW.minusSeconds(120));
    }

    static PushSubscription subscription(String id, String endpoint) {
        return new PushSubscription(id, endpoint, "synthetic-p256dh", "synthetic-auth", NOW);
    }
}
