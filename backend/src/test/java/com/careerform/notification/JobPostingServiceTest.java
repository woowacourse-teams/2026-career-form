package com.careerform.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;

import java.time.Duration;
import java.time.Instant;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("공고 등록과 발송 예약")
class JobPostingServiceTest {
    private static final Instant NOW = Instant.parse("2030-01-01T00:00:00Z");
    private final MemoryNotificationStore store = new MemoryNotificationStore();
    private final MutableClock clock = new MutableClock(NOW);
    private final JobPostingService service = new JobPostingService(store, clock);

    @Test
    @DisplayName("등록 즉시 구독자 수만큼 대기 발송이 만들어지고 예정 시각은 등록 시각이다")
    void registersPostingAndCreatesPendingDeliveryPerSubscriber() {
        subscribe("s1"); subscribe("s2"); subscribe("s3");
        var registered = assertInstanceOf(JobPostingService.Registered.class,
            service.register(draft("https://careers.example.test/jobs/1", NOW.minusSeconds(3600), NOW.plusSeconds(86400))));
        assertThat(registered.deliveries()).isEqualTo(3);
        assertThat(registered.posting().id()).matches("[0-9a-f]{32}");
        assertThat(registered.posting().registeredAt()).isEqualTo(NOW);
        assertThat(registered.posting().scheduledAt()).isEqualTo(NOW);
        assertThat(store.deliveries()).hasSize(3).allSatisfy(delivery -> {
            assertThat(delivery.status()).isEqualTo(PushDelivery.Status.PENDING);
            assertThat(delivery.postingId()).isEqualTo(registered.posting().id());
            assertThat(delivery.scheduledAt()).isEqualTo(NOW);
            assertThat(delivery.nextAttemptAt()).isEqualTo(NOW);
            assertThat(delivery.attempts()).isZero();
            assertThat(delivery.id()).matches("[0-9a-f]{32}");
        });
        assertThat(store.deliveries()).extracting(PushDelivery::subscriptionId).containsExactlyInAnyOrder("s1", "s2", "s3");
        assertThat(store.findDueDeliveries(NOW, 10)).hasSize(3);
    }

    @Test
    @DisplayName("접수 시작이 미래인 공고는 그 시각에 예약되고 그 전에는 대기 건이 집히지 않는다")
    void schedulesFuturePostingAtApplicationStart() {
        subscribe("s1");
        var registered = assertInstanceOf(JobPostingService.Registered.class,
            service.register(draft("https://careers.example.test/jobs/2", NOW.plusSeconds(3600), NOW.plusSeconds(86400))));
        assertThat(registered.posting().scheduledAt()).isEqualTo(NOW.plusSeconds(3600));
        assertThat(store.deliveries()).singleElement().satisfies(delivery -> {
            assertThat(delivery.scheduledAt()).isEqualTo(NOW.plusSeconds(3600));
            assertThat(delivery.nextAttemptAt()).isEqualTo(NOW.plusSeconds(3600));
        });
        assertThat(store.findDueDeliveries(NOW.plusSeconds(3599), 10)).isEmpty();
        assertThat(store.findDueDeliveries(NOW.plusSeconds(3600), 10)).hasSize(1);
    }

    @Test
    @DisplayName("같은 링크의 재등록은 기존 공고 ID와 함께 거절되고 발송을 추가하지 않는다")
    void rejectsDuplicateLinkAndKeepsExistingDeliveries() {
        subscribe("s1");
        var first = assertInstanceOf(JobPostingService.Registered.class,
            service.register(draft("https://careers.example.test/jobs/3", NOW.minusSeconds(60), NOW.plusSeconds(86400))));
        var duplicate = assertInstanceOf(JobPostingService.Duplicate.class, service.register(new JobPostingService.Draft("다른 회사", "다른 직무",
            "https://careers.example.test/jobs/3", NOW.minusSeconds(60), NOW.plusSeconds(172800))));
        assertThat(duplicate.existingId()).isEqualTo(first.posting().id());
        assertThat(store.deliveries()).hasSize(1);
        assertThat(store.listPostings()).hasSize(1);
    }

    @Test
    @DisplayName("회사·직무·링크·기간이 계약을 벗어나면 이유와 함께 거절한다")
    void rejectsInvalidDrafts() {
        var opens = NOW.minusSeconds(60);
        var closes = NOW.plusSeconds(86400);
        assertReason(new JobPostingService.Draft(" ", "직무", "https://careers.example.test/jobs/4", opens, closes), "COMPANY");
        assertReason(new JobPostingService.Draft("회".repeat(81), "직무", "https://careers.example.test/jobs/4", opens, closes), "COMPANY");
        assertReason(new JobPostingService.Draft("회사", "직".repeat(121), "https://careers.example.test/jobs/4", opens, closes), "ROLE");
        assertReason(new JobPostingService.Draft("회사", "직무", null, opens, closes), "LINK");
        assertReason(new JobPostingService.Draft("회사", "직무", "ftp://careers.example.test/jobs/4", opens, closes), "LINK");
        assertReason(new JobPostingService.Draft("회사", "직무", "https://user:secret@careers.example.test/jobs/4", opens, closes), "LINK");
        assertReason(new JobPostingService.Draft("회사", "직무", "https://careers.example.test/" + "a".repeat(1000), opens, closes), "LINK");
        assertReason(new JobPostingService.Draft("회사", "직무", "https://careers.example.test/jobs/4", null, closes), "PERIOD");
        assertReason(new JobPostingService.Draft("회사", "직무", "https://careers.example.test/jobs/4", opens, null), "PERIOD");
        assertReason(new JobPostingService.Draft("회사", "직무", "https://careers.example.test/jobs/4", closes, opens), "PERIOD");
        assertReason(new JobPostingService.Draft("회사", "직무", "https://careers.example.test/jobs/4", opens, opens), "PERIOD");
        assertReason(new JobPostingService.Draft("회사", "직무", "https://careers.example.test/jobs/4", NOW.minusSeconds(7200), NOW), "CLOSED");
        assertThat(store.listPostings()).isEmpty();
        assertThat(store.deliveries()).isEmpty();
    }

    @Test
    @DisplayName("직무를 비우거나 생략한 공고도 저장·발송 예약되고 직무는 null로 남는다")
    void registersPostingWithoutRole() {
        subscribe("s1");
        var omitted = assertInstanceOf(JobPostingService.Registered.class, service.register(new JobPostingService.Draft("합성 회사", null,
            "https://careers.example.test/jobs/no-role", NOW.minusSeconds(60), NOW.plusSeconds(86400))));
        var blank = assertInstanceOf(JobPostingService.Registered.class, service.register(new JobPostingService.Draft("합성 회사", "   ",
            "https://careers.example.test/jobs/blank-role", NOW.minusSeconds(60), NOW.plusSeconds(86400))));
        assertThat(omitted.posting().role()).isNull();
        assertThat(blank.posting().role()).isNull();
        assertThat(omitted.deliveries()).isEqualTo(1);
        assertThat(store.findPosting(omitted.posting().id()).orElseThrow().role()).isNull();
        assertThat(service.open()).extracting(JobPosting::link).contains("https://careers.example.test/jobs/no-role", "https://careers.example.test/jobs/blank-role");
        assertThat(service.list()).hasSize(2);
        var withRole = assertInstanceOf(JobPostingService.Registered.class, service.register(new JobPostingService.Draft("합성 회사", " 백엔드 ",
            "https://careers.example.test/jobs/with-role", NOW.minusSeconds(60), NOW.plusSeconds(86400))));
        assertThat(withRole.posting().role()).isEqualTo("백엔드");
    }

    @Test
    @DisplayName("공고 삭제는 대기 발송만 취소하고 수락된 기록은 남긴다")
    void deleteCancelsPendingDeliveriesAndKeepsAccepted() {
        subscribe("s1"); subscribe("s2");
        var registered = assertInstanceOf(JobPostingService.Registered.class,
            service.register(draft("https://careers.example.test/jobs/5", NOW.minusSeconds(60), NOW.plusSeconds(86400))));
        var observed = store.findDueDeliveries(NOW, 10).getFirst();
        var claimed = store.claimDelivery(observed, NOW, NOW.plusSeconds(120)).orElseThrow();
        assertThat(store.completeDelivery(claimed, claimed.accepted(201))).isTrue();

        assertThat(service.delete(registered.posting().id())).isTrue();
        assertThat(store.findPosting(registered.posting().id())).isEmpty();
        assertThat(store.deliveries()).singleElement().satisfies(delivery -> {
            assertThat(delivery.id()).isEqualTo(claimed.id());
            assertThat(delivery.status()).isEqualTo(PushDelivery.Status.ACCEPTED);
        });
        assertThat(service.delete(registered.posting().id())).isFalse();
        assertThat(service.list()).isEmpty();
    }

    @Test
    @DisplayName("진행 중 목록은 접수 시작 이후 마감 전인 공고만 마감순으로 준다")
    void listsOpenPostingsWithinWindow() {
        service.register(draft("https://careers.example.test/jobs/late", NOW.minusSeconds(60), NOW.plusSeconds(7200)));
        service.register(draft("https://careers.example.test/jobs/now", NOW, NOW.plusSeconds(3600)));
        service.register(draft("https://careers.example.test/jobs/future", NOW.plusSeconds(1), NOW.plusSeconds(5400)));
        service.register(draft("https://careers.example.test/jobs/closing", NOW.minusSeconds(60), NOW.plusSeconds(1)));
        assertThat(service.open()).extracting(JobPosting::link)
            .containsExactly("https://careers.example.test/jobs/closing", "https://careers.example.test/jobs/now", "https://careers.example.test/jobs/late");
        clock.advance(Duration.ofSeconds(1));
        assertThat(service.open()).extracting(JobPosting::link)
            .containsExactly("https://careers.example.test/jobs/now", "https://careers.example.test/jobs/future", "https://careers.example.test/jobs/late");
    }

    @Test
    @DisplayName("관리 목록은 최근 등록 순이며 공고별 발송 진행을 함께 준다")
    void listsPostingsWithProgressNewestFirst() {
        subscribe("s1"); subscribe("s2");
        var first = assertInstanceOf(JobPostingService.Registered.class,
            service.register(draft("https://careers.example.test/jobs/6", NOW.minusSeconds(60), NOW.plusSeconds(86400))));
        clock.advance(Duration.ofSeconds(30));
        var second = assertInstanceOf(JobPostingService.Registered.class,
            service.register(draft("https://careers.example.test/jobs/7", NOW.minusSeconds(60), NOW.plusSeconds(86400))));
        var observed = store.findDueDeliveries(NOW, 10).stream().filter(delivery -> delivery.postingId().equals(first.posting().id())).findFirst().orElseThrow();
        var claimed = store.claimDelivery(observed, clock.instant(), clock.instant().plusSeconds(120)).orElseThrow();
        store.completeDelivery(claimed, claimed.accepted(201));

        var rows = service.list();
        assertThat(rows).extracting(row -> row.posting().id()).containsExactly(second.posting().id(), first.posting().id());
        assertThat(rows.get(1).progress()).isEqualTo(new DeliveryProgress(1, 0, 1, 0, NOW.plusSeconds(30)));
        assertThat(rows.get(0).progress()).isEqualTo(new DeliveryProgress(2, 0, 0, 0, null));
    }

    private void assertReason(JobPostingService.Draft draft, String reason) {
        assertThatThrownBy(() -> service.register(draft)).isInstanceOf(JobPostingService.InvalidPosting.class)
            .extracting(exception -> ((JobPostingService.InvalidPosting) exception).reason()).isEqualTo(reason);
    }

    private void subscribe(String id) {
        store.insertSubscription(new PushSubscription(id, "https://fcm.googleapis.com/fcm/send/" + id, "synthetic-p256dh", "synthetic-auth", NOW));
    }

    private static JobPostingService.Draft draft(String link, Instant opensAt, Instant closesAt) {
        return new JobPostingService.Draft("합성 회사", "합성 직무", link, opensAt, closesAt);
    }
}
