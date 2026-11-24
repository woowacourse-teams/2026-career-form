package com.careerform.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

import com.careerform.monitoring.ExternalCallMetrics;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

/**
 * 단일 노드 MongoDB에서 공고 저장과 발송 문서 저장은 한 트랜잭션이 아니다. 등록이 공고 저장 직후, 발송 문서 저장 도중,
 * 완료 표시 직전에 끊겨도 다음 발송기 주기가 빠진 발송 문서를 채우고, 몇 번을 반복해도 공고 × 구독 쌍은 하나뿐이어야 한다.
 */
@DisplayName("공고 등록 누락 자동 복구")
@ExtendWith(OutputCaptureExtension.class)
class RegistrationRecoveryTest {
    private static final Instant NOW = Instant.parse("2030-01-01T00:00:00Z");
    private static final int SUBSCRIBERS = 100;
    private static final int SAVED_BEFORE_FAILURE = 40;
    private static final String LINK = "https://careers.example.test/jobs/recovery";
    private final MemoryNotificationStore store = new MemoryNotificationStore();
    private final MutableClock clock = new MutableClock(NOW);
    private final FakeWebPushClient client = new FakeWebPushClient();
    private final SimpleMeterRegistry meters = new SimpleMeterRegistry();
    private final PushDispatchMetrics metrics = new PushDispatchMetrics(meters, new ExternalCallMetrics(meters));
    private final PushSettings settings = PushSettings.defaults();
    private final PushDispatcher dispatcher = dispatcher(store);
    private final String p256dh = VapidTestKeys.generate().publicKey;
    private final String auth = randomAuth();

    @Test
    @DisplayName("공고 저장 직후 끊긴 등록은 다음 주기에 모든 대상 구독의 발송 문서가 채워지고 완료로 바뀐다")
    void recoversRegistrationStoppedAfterPosting(CapturedOutput output) {
        subscribers();
        registerThrough(StoreFaults.failing(store, "insertDeliveries"));
        JobPosting posting = stranded();
        assertThat(store.deliveries()).isEmpty();

        PushDispatcher.Cycle cycle = dispatcher.dispatch();

        assertThat(pairs()).hasSize(SUBSCRIBERS);
        assertThat(cycle.accepted()).isEqualTo(SUBSCRIBERS);
        assertThat(store.deliveries()).allSatisfy(delivery -> assertThat(delivery.scheduledAt()).isEqualTo(posting.scheduledAt()));
        assertThat(store.findPosting(posting.id()).orElseThrow().deliveriesReady()).isTrue();
        assertThat(output.getAll()).contains("POSTING_REGISTRATION_RECOVERED postingId=" + posting.id() + " targets=" + SUBSCRIBERS)
            .doesNotContain("careers.example.test");
    }

    @Test
    @DisplayName("발송 문서 저장 도중 끊긴 등록은 빠진 쌍만 채워지고 이미 저장된 발송 문서는 그대로 남는다")
    void recoversRegistrationStoppedDuringDeliveries() {
        subscribers();
        registerThrough(StoreFaults.partialDeliveries(store, SAVED_BEFORE_FAILURE));
        JobPosting posting = stranded();
        List<String> saved = store.deliveries().stream().map(PushDelivery::id).toList();
        assertThat(saved).hasSize(SAVED_BEFORE_FAILURE);

        dispatcher.dispatch();

        assertThat(pairs()).hasSize(SUBSCRIBERS);
        assertThat(store.deliveries()).extracting(PushDelivery::id).containsAll(saved);
        assertThat(store.findPosting(posting.id()).orElseThrow().deliveriesReady()).isTrue();
        assertThat(client.calls()).hasSize(SUBSCRIBERS);
    }

    @Test
    @DisplayName("완료 표시 직전에 끊긴 등록은 새 발송 문서 없이 다음 주기에 완료로 바뀐다")
    void recoversRegistrationStoppedBeforeReadyMark() {
        subscribers();
        registerThrough(StoreFaults.failing(store, "markDeliveriesReady"));
        JobPosting posting = stranded();
        List<String> saved = store.deliveries().stream().map(PushDelivery::id).toList();
        assertThat(saved).hasSize(SUBSCRIBERS);

        dispatcher.dispatch();

        assertThat(store.deliveries()).extracting(PushDelivery::id).containsExactlyInAnyOrderElementsOf(saved);
        assertThat(store.findPosting(posting.id()).orElseThrow().deliveriesReady()).isTrue();
        assertThat(client.calls()).hasSize(SUBSCRIBERS);
    }

    @Test
    @DisplayName("완료 표시가 계속 실패해 보충이 주기마다 반복돼도 공고 × 구독 쌍의 발송 문서는 하나뿐이고 알림도 한 번만 나간다")
    void repeatedRecoveryKeepsOneDeliveryPerPair() {
        subscribers();
        registerThrough(StoreFaults.partialDeliveries(store, SAVED_BEFORE_FAILURE));
        PushDispatcher stuck = dispatcher(StoreFaults.failing(store, "markDeliveriesReady"));

        for (int cycle = 0; cycle < 10; cycle++) {
            stuck.dispatch();
            clock.advance(Duration.ofMinutes(1));
        }

        assertThat(store.deliveries()).hasSize(SUBSCRIBERS);
        assertThat(pairs()).hasSize(SUBSCRIBERS);
        assertThat(client.calls()).hasSize(SUBSCRIBERS);
        assertThat(stranded().deliveriesReady()).isFalse();
    }

    @Test
    @DisplayName("보충 대상은 공고 직무의 대상 구독 가운데 공고 등록 시각까지 가입한 구독이다")
    void recoversOnlyTargetsRegisteredByPosting() {
        subscribe("backend", List.of("IT.BACKEND"), NOW);
        subscribe("unselected", null, NOW);
        subscribe("frontend", List.of("IT.FRONTEND"), NOW);
        subscribe("later", null, NOW.plusSeconds(30));
        registerThrough(StoreFaults.failing(store, "insertDeliveries"));
        clock.advance(Duration.ofMinutes(1));

        dispatcher.dispatch();

        assertThat(store.deliveries()).extracting(PushDelivery::subscriptionId).containsExactlyInAnyOrder("backend", "unselected");
    }

    @Test
    @DisplayName("마감이 지난 미완료 공고와 완료 표시가 없는 기존 공고는 보충하지 않는다")
    void skipsClosedAndLegacyPostings() {
        subscribers();
        store.insertPosting(new JobPosting("closed", "합성 회사", "백엔드", List.of("IT.BACKEND"), "https://careers.example.test/jobs/closed",
            NOW.minusSeconds(7200), NOW, NOW.minusSeconds(3600), false));
        store.insertPosting(new JobPosting("legacy", "합성 회사", "합성 직무", null, "https://careers.example.test/jobs/legacy",
            NOW.minusSeconds(60), NOW.plusSeconds(86400), NOW.minusSeconds(60)));

        dispatcher.dispatch();

        assertThat(store.deliveries()).isEmpty();
        assertThat(store.findPosting("closed").orElseThrow().deliveriesReady()).isFalse();
    }

    @Test
    @DisplayName("미완료 공고 조회가 실패해도 그 주기의 대기 발송은 그대로 나간다")
    void dispatchesDueDeliveriesWhenRecoveryFails(CapturedOutput output) {
        subscribers();
        new JobPostingService(store, JobCategories.load(), clock).register(draft());
        PushDispatcher broken = dispatcher(StoreFaults.failing(store, "findIncompletePostings"));

        assertThat(broken.dispatch().accepted()).isEqualTo(SUBSCRIBERS);
        assertThat(output.getAll()).contains("POSTING_REGISTRATION_RECOVERY_FAILED");
    }

    private void registerThrough(NotificationStore faulty) {
        assertThatThrownBy(() -> new JobPostingService(faulty, JobCategories.load(), clock).register(draft()))
            .isInstanceOf(StoreFaults.InjectedFailure.class);
    }

    private JobPosting stranded() { return store.findPostingByLink(LINK).orElseThrow(); }

    private HashSet<String> pairs() {
        HashSet<String> pairs = new HashSet<>();
        store.deliveries().forEach(delivery -> pairs.add(delivery.postingId() + ":" + delivery.subscriptionId()));
        return pairs;
    }

    private static JobPostingService.Draft draft() {
        return new JobPostingService.Draft("합성 회사", List.of("IT.BACKEND"), LINK, NOW.minusSeconds(60), NOW.plusSeconds(86400));
    }

    private PushDispatcher dispatcher(NotificationStore target) {
        return new PushDispatcher(target, client, new RetryPolicy(settings.maxAttempts()), settings, clock, Runnable::run, metrics);
    }

    private void subscribers() {
        for (int index = 0; index < SUBSCRIBERS; index++) { subscribe("s" + index, null, NOW); }
    }

    private void subscribe(String id, List<String> roles, Instant registeredAt) {
        store.insertSubscription(new PushSubscription(id, "https://fcm.googleapis.com/fcm/send/" + id, p256dh, auth, registeredAt, roles,
            roles == null ? null : registeredAt));
    }

    private static String randomAuth() {
        byte[] bytes = new byte[16];
        new SecureRandom().nextBytes(bytes);
        return VapidTestKeys.base64Url(bytes);
    }
}
