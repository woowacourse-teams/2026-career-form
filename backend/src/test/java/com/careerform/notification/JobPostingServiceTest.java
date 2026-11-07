package com.careerform.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

@DisplayName("공고 등록과 발송 예약")
@ExtendWith(OutputCaptureExtension.class)
class JobPostingServiceTest {
    private static final Instant NOW = Instant.parse("2030-01-01T00:00:00Z");
    private final MemoryNotificationStore store = new MemoryNotificationStore();
    private final MutableClock clock = new MutableClock(NOW);
    private final JobPostingService service = new JobPostingService(store, JobCategories.load(), clock);

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
        var duplicate = assertInstanceOf(JobPostingService.Duplicate.class, service.register(new JobPostingService.Draft("다른 회사", List.of("IT.FRONTEND"),
            "https://careers.example.test/jobs/3", NOW.minusSeconds(60), NOW.plusSeconds(172800))));
        assertThat(duplicate.existingId()).isEqualTo(first.posting().id());
        assertThat(store.deliveries()).hasSize(1);
        assertThat(store.listPostings()).hasSize(1);
    }

    @Test
    @DisplayName("회사·직무·링크·기간이 계약을 벗어나면 이유와 함께 거절하고 검사 순서는 회사, 직무, 링크, 기간, 마감이다")
    void rejectsInvalidDrafts() {
        var opens = NOW.minusSeconds(60);
        var closes = NOW.plusSeconds(86400);
        var roles = List.of("IT.BACKEND");
        assertReason(new JobPostingService.Draft(" ", roles, "https://careers.example.test/jobs/4", opens, closes), "COMPANY");
        assertReason(new JobPostingService.Draft("회".repeat(81), roles, "https://careers.example.test/jobs/4", opens, closes), "COMPANY");
        assertReason(new JobPostingService.Draft(" ", null, null, opens, closes), "COMPANY");
        assertReason(new JobPostingService.Draft("회사", null, "https://careers.example.test/jobs/4", opens, closes), "ROLE");
        assertReason(new JobPostingService.Draft("회사", List.of(), "https://careers.example.test/jobs/4", opens, closes), "ROLE");
        assertReason(new JobPostingService.Draft("회사", Arrays.asList((String) null), "https://careers.example.test/jobs/4", opens, closes), "ROLE");
        assertReason(new JobPostingService.Draft("회사", List.of("  "), "https://careers.example.test/jobs/4", opens, closes), "ROLE");
        assertReason(new JobPostingService.Draft("회사", List.of("IT.BACKEND", "IT.NOPE"), "https://careers.example.test/jobs/4", opens, closes), "ROLE");
        assertReason(new JobPostingService.Draft("회사", List.of("it.backend"), "https://careers.example.test/jobs/4", opens, closes), "ROLE");
        assertReason(new JobPostingService.Draft("회사", List.of("IT"), "https://careers.example.test/jobs/4", opens, closes), "ROLE");
        assertReason(new JobPostingService.Draft("회사", null, "ftp://careers.example.test/jobs/4", opens, closes), "ROLE");
        assertReason(new JobPostingService.Draft("회사", roles, null, opens, closes), "LINK");
        assertReason(new JobPostingService.Draft("회사", roles, "ftp://careers.example.test/jobs/4", opens, closes), "LINK");
        assertReason(new JobPostingService.Draft("회사", roles, "https://user:secret@careers.example.test/jobs/4", opens, closes), "LINK");
        assertReason(new JobPostingService.Draft("회사", roles, "https://careers.example.test/" + "a".repeat(1000), opens, closes), "LINK");
        assertReason(new JobPostingService.Draft("회사", roles, "https://careers.example.test/jobs/4", null, closes), "PERIOD");
        assertReason(new JobPostingService.Draft("회사", roles, "https://careers.example.test/jobs/4", opens, null), "PERIOD");
        assertReason(new JobPostingService.Draft("회사", roles, "https://careers.example.test/jobs/4", closes, opens), "PERIOD");
        assertReason(new JobPostingService.Draft("회사", roles, "https://careers.example.test/jobs/4", opens, opens), "PERIOD");
        assertReason(new JobPostingService.Draft("회사", roles, "https://careers.example.test/jobs/4", NOW.minusSeconds(7200), NOW), "CLOSED");
        assertThat(store.listPostings()).isEmpty();
        assertThat(store.deliveries()).isEmpty();
    }

    @Test
    @DisplayName("직무 코드는 공백을 벗기고 null과 중복을 뺀 순서대로 저장되며 라벨은 소분류 라벨을 가운뎃점으로 이어 파생하고, 분류 전체를 고르면 '전체 직무'다")
    void normalizesRolesAndDerivesLabel() {
        subscribe("s1");
        var registered = assertInstanceOf(JobPostingService.Registered.class, service.register(new JobPostingService.Draft("합성 회사",
            Arrays.asList(" IT.BACKEND ", null, "IT.BACKEND", "IT.FRONTEND"), "https://careers.example.test/jobs/roles", NOW.minusSeconds(60), NOW.plusSeconds(86400))));
        assertThat(registered.posting().roles()).containsExactly("IT.BACKEND", "IT.FRONTEND");
        assertThat(registered.posting().role()).isEqualTo("백엔드·프론트엔드");
        assertThat(registered.deliveries()).isEqualTo(1);
        var stored = store.findPosting(registered.posting().id()).orElseThrow();
        assertThat(stored.roles()).containsExactly("IT.BACKEND", "IT.FRONTEND");
        assertThat(stored.role()).isEqualTo("백엔드·프론트엔드");
        var row = service.list().stream().filter(candidate -> candidate.posting().id().equals(registered.posting().id())).findFirst().orElseThrow();
        assertThat(row.roles()).containsExactly(new JobCategories.Role("IT.BACKEND", "백엔드"), new JobCategories.Role("IT.FRONTEND", "프론트엔드"));

        var all = roleCodes(Integer.MAX_VALUE);
        assertThat(all).hasSize(JobCategories.load().roleCount()).hasSizeGreaterThan(10);
        var allWithDuplicate = new ArrayList<>(all);
        allWithDuplicate.add(all.getFirst());
        var everything = assertInstanceOf(JobPostingService.Registered.class, service.register(new JobPostingService.Draft("합성 회사", allWithDuplicate,
            "https://careers.example.test/jobs/all", NOW.minusSeconds(60), NOW.plusSeconds(86400))));
        assertThat(everything.posting().roles()).containsExactlyElementsOf(all);
        assertThat(everything.posting().role()).isEqualTo("전체 직무");
        var allButOne = all.subList(0, all.size() - 1);
        var most = register(service, allButOne, "https://careers.example.test/jobs/most");
        assertThat(most.roles()).containsExactlyElementsOf(allButOne);
        assertThat(most.role()).isNotEqualTo("전체 직무").hasSizeLessThanOrEqualTo(JobPostingService.MAX_ROLE_LENGTH)
            .isEqualTo(String.join("·", allButOne.stream().map(code -> JobCategories.load().roleLabel(code).orElseThrow()).toList()));
    }

    @Test
    @DisplayName("라벨 합이 120자를 넘으면 앞 라벨 몇 개와 ' 외 n개'를 붙여 120자 안에 드는 가장 긴 모양으로 줄이고, 분류 전체를 고르면 길이와 무관하게 '전체 직무'다")
    void truncatesDerivedLabelBeyondLimit() {
        var synthetic = JobCategories.parse(JobCategoriesTest.json(1, JobCategoriesTest.category("LONG", "긴 분류",
            JobCategoriesTest.role("LONG.A", "가".repeat(40)), JobCategoriesTest.role("LONG.B", "나".repeat(40)),
            JobCategoriesTest.role("LONG.C", "다".repeat(38)), JobCategoriesTest.role("LONG.D", "라".repeat(40)), JobCategoriesTest.role("LONG.E", "마".repeat(40)))));
        var longService = new JobPostingService(store, synthetic, clock);
        var exact = register(longService, List.of("LONG.A", "LONG.B", "LONG.C"), "https://careers.example.test/jobs/exact");
        assertThat(exact.role()).hasSize(JobPostingService.MAX_ROLE_LENGTH).isEqualTo("가".repeat(40) + "·" + "나".repeat(40) + "·" + "다".repeat(38));
        var over = register(longService, List.of("LONG.A", "LONG.B", "LONG.D"), "https://careers.example.test/jobs/over");
        assertThat(over.role()).isEqualTo("가".repeat(40) + "·" + "나".repeat(40) + " 외 1개");
        var four = register(longService, List.of("LONG.A", "LONG.B", "LONG.C", "LONG.D"), "https://careers.example.test/jobs/four");
        assertThat(four.role()).isEqualTo("가".repeat(40) + "·" + "나".repeat(40) + " 외 2개");
        assertThat(four.roles()).containsExactly("LONG.A", "LONG.B", "LONG.C", "LONG.D");
        var all = register(longService, List.of("LONG.E", "LONG.D", "LONG.C", "LONG.B", "LONG.A"), "https://careers.example.test/jobs/all-long");
        assertThat(all.role()).isEqualTo("전체 직무");
        assertThat(all.roles()).containsExactly("LONG.E", "LONG.D", "LONG.C", "LONG.B", "LONG.A");
        assertThat(store.listPostings()).extracting(JobPosting::role).allSatisfy(role -> assertThat(role).hasSizeLessThanOrEqualTo(JobPostingService.MAX_ROLE_LENGTH));
    }

    @Test
    @DisplayName("대기 발송은 공고 직무와 겹치는 선택 구독과 받을 직무가 없거나 빈 미선택 구독에 늘 만들어지고 등록 로그에는 건수만 남는다")
    void targetsOverlappingAndUnselectedSubscriptions(CapturedOutput output) {
        subscribe("backend", List.of("IT.BACKEND"));
        subscribe("frontend", List.of("IT.FRONTEND"));
        subscribe("both", List.of("IT.FRONTEND", "IT.BACKEND"));
        subscribe("unselected");
        subscribe("empty", List.of());
        var backend = assertInstanceOf(JobPostingService.Registered.class,
            service.register(draft("https://careers.example.test/jobs/backend", NOW.minusSeconds(60), NOW.plusSeconds(86400))));
        assertThat(backend.deliveries()).isEqualTo(4);
        assertThat(store.deliveries()).filteredOn(delivery -> delivery.postingId().equals(backend.posting().id()))
            .extracting(PushDelivery::subscriptionId).containsExactlyInAnyOrder("backend", "both", "unselected", "empty");
        assertThat(output.getAll()).contains("POSTING_REGISTERED postingId=" + backend.posting().id() + " roles=1 deliveries=4")
            .doesNotContain("careers.example.test", "IT.BACKEND", "합성 회사");

        var data = assertInstanceOf(JobPostingService.Registered.class, service.register(new JobPostingService.Draft("합성 회사", List.of("IT.DATA"),
            "https://careers.example.test/jobs/data", NOW.minusSeconds(60), NOW.plusSeconds(86400))));
        assertThat(data.deliveries()).as("겹치는 선택 구독이 없어도 미선택 구독은 받는다").isEqualTo(2);
        assertThat(store.deliveries()).filteredOn(delivery -> delivery.postingId().equals(data.posting().id()))
            .extracting(PushDelivery::subscriptionId).containsExactlyInAnyOrder("unselected", "empty");
        assertThat(store.deliveries()).hasSize(6);
        assertThat(output.getAll()).contains("POSTING_REGISTERED postingId=" + data.posting().id() + " roles=1 deliveries=2");
    }

    @Test
    @DisplayName("겹치는 선택 구독도 미선택 구독도 없으면 대기 발송 없이 등록만 성공한다")
    void registersWithoutTargets(CapturedOutput output) {
        subscribe("frontend", List.of("IT.FRONTEND"));
        var none = assertInstanceOf(JobPostingService.Registered.class, service.register(new JobPostingService.Draft("합성 회사", List.of("IT.DATA"),
            "https://careers.example.test/jobs/none", NOW.minusSeconds(60), NOW.plusSeconds(86400))));
        assertThat(none.deliveries()).isZero();
        assertThat(store.findPosting(none.posting().id())).as("대상이 없어도 등록은 성공한다").isPresent();
        assertThat(store.deliveries()).isEmpty();
        assertThat(output.getAll()).contains("POSTING_REGISTERED postingId=" + none.posting().id() + " roles=1 deliveries=0");
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
    @DisplayName("관리 목록은 최근 등록 순이며 공고별 발송 진행과 직무 라벨을 함께 주고 레거시 공고의 직무 목록은 null이다")
    void listsPostingsWithProgressNewestFirst() {
        subscribe("s1"); subscribe("s2");
        var first = assertInstanceOf(JobPostingService.Registered.class,
            service.register(draft("https://careers.example.test/jobs/6", NOW.minusSeconds(60), NOW.plusSeconds(86400))));
        clock.advance(Duration.ofSeconds(30));
        var second = assertInstanceOf(JobPostingService.Registered.class,
            service.register(draft("https://careers.example.test/jobs/7", NOW.minusSeconds(60), NOW.plusSeconds(86400))));
        store.insertPosting(new JobPosting("legacy", "합성 회사", "합성 직무", null, "https://careers.example.test/jobs/legacy", NOW.minusSeconds(60),
            NOW.plusSeconds(86400), NOW.minusSeconds(60)));
        var observed = store.findDueDeliveries(NOW, 10).stream().filter(delivery -> delivery.postingId().equals(first.posting().id())).findFirst().orElseThrow();
        var claimed = store.claimDelivery(observed, clock.instant(), clock.instant().plusSeconds(120)).orElseThrow();
        store.completeDelivery(claimed, claimed.accepted(201));

        var rows = service.list();
        assertThat(rows).extracting(row -> row.posting().id()).containsExactly(second.posting().id(), first.posting().id(), "legacy");
        assertThat(rows.get(1).progress()).isEqualTo(new DeliveryProgress(1, 0, 1, 0, NOW.plusSeconds(30)));
        assertThat(rows.get(0).progress()).isEqualTo(new DeliveryProgress(2, 0, 0, 0, null));
        assertThat(rows.get(0).roles()).containsExactly(new JobCategories.Role("IT.BACKEND", "백엔드"));
        assertThat(rows.get(2).roles()).isNull();
        assertThat(rows.get(2).progress()).isEqualTo(DeliveryProgress.empty());
    }

    private void assertReason(JobPostingService.Draft draft, String reason) {
        assertThatThrownBy(() -> service.register(draft)).isInstanceOf(JobPostingService.InvalidPosting.class)
            .extracting(exception -> ((JobPostingService.InvalidPosting) exception).reason()).isEqualTo(reason);
    }

    private void subscribe(String id) { subscribe(id, null); }

    private void subscribe(String id, List<String> roles) {
        store.insertSubscription(new PushSubscription(id, "https://fcm.googleapis.com/fcm/send/" + id, "synthetic-p256dh", "synthetic-auth", NOW, roles,
            roles == null ? null : NOW));
    }

    private static JobPosting register(JobPostingService target, List<String> roles, String link) {
        return assertInstanceOf(JobPostingService.Registered.class,
            target.register(new JobPostingService.Draft("합성 회사", roles, link, NOW.minusSeconds(60), NOW.plusSeconds(86400)))).posting();
    }

    /** 실제 분류 파일의 소분류 코드를 파일 순서대로 count개. */
    static List<String> roleCodes(int count) {
        return JobCategories.load().categories().stream().flatMap(category -> category.roles().stream()).map(JobCategories.Role::code).limit(count).toList();
    }

    private static JobPostingService.Draft draft(String link, Instant opensAt, Instant closesAt) {
        return new JobPostingService.Draft("합성 회사", List.of("IT.BACKEND"), link, opensAt, closesAt);
    }
}
