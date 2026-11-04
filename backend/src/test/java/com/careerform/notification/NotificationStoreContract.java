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

    @Test
    @DisplayName("직무 코드 배열은 순서대로 저장·복원되고 roles가 없는 레거시 공고는 null로 읽힌다")
    void roundTripsRolesAndKeepsLegacyNull() {
        var store = store();
        store.insertPosting(new JobPosting("with-roles", "합성 회사", "백엔드·프론트엔드", List.of("IT.BACKEND", "IT.FRONTEND"),
            "https://careers.example.test/jobs/roles", NOW.minusSeconds(60), NOW.plusSeconds(3600), NOW));
        store.insertPosting(new JobPosting("legacy", "합성 회사", "합성 직무", null, "https://careers.example.test/jobs/legacy",
            NOW.minusSeconds(60), NOW.plusSeconds(3600), NOW.minusSeconds(1)));
        assertThat(store.findPosting("with-roles").orElseThrow().roles()).containsExactly("IT.BACKEND", "IT.FRONTEND");
        assertThat(store.findPosting("legacy").orElseThrow().roles()).isNull();
        assertThat(store.findPostingByLink("https://careers.example.test/jobs/roles").orElseThrow().roles()).containsExactly("IT.BACKEND", "IT.FRONTEND");
        assertThat(store.listPostings()).extracting(JobPosting::roles).containsExactly(List.of("IT.BACKEND", "IT.FRONTEND"), null);
        assertThat(store.listOpenPostings(NOW)).extracting(JobPosting::roles).containsExactlyInAnyOrder(List.of("IT.BACKEND", "IT.FRONTEND"), null);
    }

    @Test
    @DisplayName("기간 요약은 예정 시각이 기간 안인 발송의 상태별 건수·시도 합·수락 지연 백분위와 기간 안 등록 공고 수, 구독 수를 준다")
    void summarizesDeliveriesAndCounts() {
        var store = store();
        var from = NOW.minusSeconds(3600);
        var to = NOW.plusSeconds(3600);
        store.insertPosting(posting("in-1", "https://careers.example.test/jobs/a", NOW.minusSeconds(60), NOW.plusSeconds(7200)));
        store.insertPosting(posting("in-2", "https://careers.example.test/jobs/b", NOW.minusSeconds(60), NOW.plusSeconds(7200)));
        store.insertPosting(new JobPosting("out", "합성 회사", null, null, "https://careers.example.test/jobs/c", NOW.minusSeconds(60), NOW.plusSeconds(7200), NOW.minusSeconds(7200)));
        store.insertSubscription(subscription("s1", "https://fcm.googleapis.com/fcm/send/synthetic-1"));
        store.insertSubscription(subscription("s2", "https://fcm.googleapis.com/fcm/send/synthetic-2"));
        var lease = NOW.plusSeconds(120);
        var acceptedOnce = PushDelivery.pending("a1", "p1", "s1", NOW.minusSeconds(600)).claimed(NOW.minusSeconds(590), lease).accepted(201);
        var acceptedTwice = PushDelivery.pending("a2", "p1", "s2", NOW.minusSeconds(600)).claimed(NOW.minusSeconds(590), lease)
            .retry(NOW.minusSeconds(560), 503, "SERVER_ERROR").claimed(NOW.minusSeconds(560), lease).accepted(201);
        store.insertDeliveries(List.of(acceptedOnce, acceptedTwice,
            PushDelivery.pending("ab", "p2", "s1", NOW.minusSeconds(300)).claimed(NOW.minusSeconds(290), lease).abandoned(410, "GONE"),
            PushDelivery.pending("pe", "p2", "s2", NOW.plusSeconds(60)),
            PushDelivery.pending("se", "p3", "s1", NOW.minusSeconds(100)).claimed(NOW.minusSeconds(90), lease),
            PushDelivery.pending("ou", "p4", "s1", NOW.plusSeconds(7200))));

        var summary = store.summarizeDeliveries(from, to);
        assertThat(summary.pending()).isEqualTo(1);
        assertThat(summary.sending()).isEqualTo(1);
        assertThat(summary.accepted()).isEqualTo(2);
        assertThat(summary.abandoned()).isEqualTo(1);
        assertThat(summary.attempts()).isEqualTo(5);
        assertThat(summary.latencyP50Millis()).isBetween(10_000L, 40_000L);
        assertThat(summary.latencyP95Millis()).isBetween(summary.latencyP50Millis(), 40_000L);
        assertThat(store.summarizeDeliveries(NOW.plusSeconds(10_000), NOW.plusSeconds(20_000)))
            .isEqualTo(new DeliverySummary(0, 0, 0, 0, 0, null, null));
        assertThat(store.countPostingsRegisteredBetween(from, to)).isEqualTo(2);
        assertThat(store.countPostingsRegisteredBetween(NOW.minusSeconds(7200), NOW.minusSeconds(3600))).isEqualTo(1);
        assertThat(store.countSubscriptions()).isEqualTo(2);
        assertThat(store.countDeliveries(PushDelivery.Status.PENDING)).isEqualTo(2);
        assertThat(store.countDeliveries(PushDelivery.Status.SENDING)).isEqualTo(1);
        assertThat(store.countDeliveries(PushDelivery.Status.ACCEPTED)).isEqualTo(2);
    }

    static JobPosting posting(String id, String link, Instant opensAt, Instant closesAt) {
        return new JobPosting(id, "합성 회사", "백엔드", List.of("IT.BACKEND"), link, opensAt, closesAt, NOW.minusSeconds(120));
    }

    @Test
    @DisplayName("구독의 받을 직무는 갱신 시각과 함께 저장되고 null이면 미선택으로 돌아가며 없는 구독은 false다")
    void updatesSubscriptionRoles() {
        var store = store();
        store.insertSubscription(subscription("s1", "https://fcm.googleapis.com/fcm/send/synthetic-1"));
        assertThat(store.findSubscription("s1").orElseThrow().roles()).isNull();
        assertThat(store.updateSubscriptionRoles("s1", List.of("IT.BACKEND", "IT.DATA"), NOW.plusSeconds(10))).isTrue();
        var selected = store.findSubscription("s1").orElseThrow();
        assertThat(selected.roles()).containsExactly("IT.BACKEND", "IT.DATA");
        assertThat(selected.rolesUpdatedAt()).isEqualTo(NOW.plusSeconds(10));
        assertThat(selected.endpoint()).isEqualTo("https://fcm.googleapis.com/fcm/send/synthetic-1");
        assertThat(selected.registeredAt()).isEqualTo(NOW);
        assertThat(store.updateSubscriptionRoles("s1", null, NOW.plusSeconds(20))).isTrue();
        var unselected = store.findSubscriptionByEndpoint("https://fcm.googleapis.com/fcm/send/synthetic-1").orElseThrow();
        assertThat(unselected.roles()).isNull();
        assertThat(unselected.rolesUpdatedAt()).isEqualTo(NOW.plusSeconds(20));
        assertThat(store.updateSubscriptionRoles("missing", List.of("IT.BACKEND"), NOW)).isFalse();
        assertThat(store.countSubscriptions()).isEqualTo(1);
    }

    @Test
    @DisplayName("직무별 대상 조회는 겹치는 선택 구독만 주고, 미선택 포함이면 roles가 없거나 빈 구독도 더하며, 겹치지 않는 선택 구독은 늘 뺀다")
    void findsSubscriptionIdsOverlappingRoles() {
        var store = store();
        store.insertSubscription(subscription("backend", "https://fcm.googleapis.com/fcm/send/synthetic-1", List.of("IT.BACKEND")));
        store.insertSubscription(subscription("both", "https://fcm.googleapis.com/fcm/send/synthetic-2", List.of("IT.FRONTEND", "IT.BACKEND")));
        store.insertSubscription(subscription("frontend", "https://fcm.googleapis.com/fcm/send/synthetic-3", List.of("IT.FRONTEND")));
        store.insertSubscription(subscription("unselected", "https://fcm.googleapis.com/fcm/send/synthetic-4"));
        store.insertSubscription(subscription("empty", "https://fcm.googleapis.com/fcm/send/synthetic-5", List.of()));
        assertThat(store.subscriptionIdsForRoles(List.of("IT.BACKEND"), false)).containsExactlyInAnyOrder("backend", "both");
        assertThat(store.subscriptionIdsForRoles(List.of("IT.BACKEND"), true)).containsExactlyInAnyOrder("backend", "both", "unselected", "empty");
        assertThat(store.subscriptionIdsForRoles(List.of("IT.BACKEND", "IT.FRONTEND"), false)).containsExactlyInAnyOrder("backend", "both", "frontend");
        assertThat(store.subscriptionIdsForRoles(List.of("IT.DATA"), false)).isEmpty();
        assertThat(store.subscriptionIdsForRoles(List.of("IT.DATA"), true)).containsExactlyInAnyOrder("unselected", "empty");
        assertThat(store.countSubscriptionsWithRoles()).as("roles가 1개 이상인 구독 수").isEqualTo(3);
        assertThat(store.countSubscriptions()).isEqualTo(5);
    }

    static PushSubscription subscription(String id, String endpoint) {
        return new PushSubscription(id, endpoint, "synthetic-p256dh", "synthetic-auth", NOW, null, null);
    }

    static PushSubscription subscription(String id, String endpoint, List<String> roles) {
        return new PushSubscription(id, endpoint, "synthetic-p256dh", "synthetic-auth", NOW, roles, NOW);
    }
}
