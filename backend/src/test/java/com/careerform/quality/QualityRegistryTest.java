package com.careerform.quality;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("사람 확인 목록과 기준 필드 수의 이력")
class QualityRegistryTest {
    private final Instant now = Instant.parse("2030-01-01T00:00:00Z");
    private final java.util.Map<String, QualityRecord> records = new HashMap<>();
    private final QualityStore store = new QualityStore() {
        public boolean insert(QualityRecord record) { return records.putIfAbsent(record.id(), record) == null; }
        public Optional<QualityRecord> find(String id, Instant time) { return Optional.ofNullable(records.get(id)); }
        public boolean replace(QualityRecord previous, QualityRecord next) { return records.replace(previous.id(), previous, next); }
        public List<QualityRecord> list(Query query, Instant time) { return records.values().stream().filter(record -> record.kind() == query.kind()).toList(); }
    };
    private final QualityRegistry registry = new QualityRegistry(store, Clock.fixed(now, ZoneOffset.UTC), "test");
    private final QualityRecord.Group group = new QualityRecord.Group("test", "careers.example.test", "shape1", "GENERIC", "test-build");

    @Test
    @DisplayName("원문 경로 대신 홈페이지와 누락 표시를 제공하고 최초 대기를 보존한다")
    void preservesFirstSeenWithoutSavingOriginalUrl() {
        var candidate = registry.observe(group);
        assertThat(candidate.homepage()).isEqualTo("https://careers.example.test/");
        assertThat(candidate.publicLink()).isNull();
        assertThat(candidate.firstSeen()).isEqualTo(now);
        var later = new QualityRegistry(store, Clock.fixed(now.plusSeconds(3600), ZoneOffset.UTC), "test");
        assertThat(later.observe(group).firstSeen()).isEqualTo(now);
    }

    @Test
    @DisplayName("담당 선점은 하루 뒤 해제되며 다른 사람이 동시에 완료할 수 없다")
    void claimsExpireAndProtectConcurrentConfirmation() {
        var candidate = registry.observe(group);
        registry.claim(candidate.id(), "session-a");
        assertThatThrownBy(() -> registry.claim(candidate.id(), "session-b")).isInstanceOf(QualityRegistry.Conflict.class);
        assertThatThrownBy(() -> registry.confirm(candidate.id(), "session-b", 10, null)).isInstanceOf(QualityRegistry.Conflict.class);
        var later = new QualityRegistry(store, Clock.fixed(now.plusSeconds(86400), ZoneOffset.UTC), "test");
        assertThat(later.claim(candidate.id(), "session-b").claimExpiresAt()).isEqualTo(now.plusSeconds(172800));
    }

    @Test
    @DisplayName("완료된 기준 수는 미래의 같은 화면에만 적용하고 이력을 만료시키지 않는다")
    void confirmsScopeAndKeepsPermanentHistory() {
        var candidate = registry.observe(group);
        var completed = registry.confirm(candidate.id(), "session-a", 10, "https://careers.example.test/public-form");
        assertThat(completed.status()).isEqualTo(QualityRegistry.Status.COMPLETED);
        assertThat(registry.reference(group, now.plusSeconds(1))).contains(10L);
        assertThat(registry.reference(group, now.minusSeconds(1))).isEmpty();
        assertThat(records.values().stream().filter(record -> record.kind() == QualityRecord.Kind.CONFIRMATION)).allMatch(record -> record.expiresAt() == null);
        var changed = registry.observe(new QualityRecord.Group("test", "careers.example.test", "shape2", "GENERIC", "test-build"));
        assertThat(changed.status()).isEqualTo(QualityRegistry.Status.WAITING);
        assertThat(changed.recheck()).isTrue();
    }

    @Test
    @DisplayName("민감한 URL과 다른 호스트 및 잘못된 필드 수를 저장하지 않는다")
    void rejectsUnsafeLinksAndCounts() {
        var candidate = registry.observe(group);
        for (var link : List.of("https://careers.example.test/form?token=synthetic", "https://careers.example.test/form#session",
            "https://user:password@careers.example.test/form", "https://foreign.test/form", "http://careers.example.test/form")) {
            assertThatThrownBy(() -> registry.confirm(candidate.id(), "session", 1, link)).isInstanceOf(IllegalArgumentException.class);
        }
        assertThatThrownBy(() -> registry.confirm(candidate.id(), "session", -1, null)).isInstanceOf(IllegalArgumentException.class);
        assertThat(records.values()).noneMatch(record -> record.kind() == QualityRecord.Kind.CONFIRMATION);
    }

    @Test
    @DisplayName("미루기 상태와 날짜를 보존하고 새 사용량으로 대기를 초기화하지 않는다")
    void defersWithoutResettingAge() {
        var candidate = registry.observe(group);
        var deferred = registry.defer(candidate.id(), "session", QualityRegistry.DeferReason.LOGIN_REQUIRED, null);
        assertThat(deferred.deferredUntil()).isEqualTo(now.plusSeconds(7 * 86400));
        assertThat(registry.observe(group).firstSeen()).isEqualTo(now);
        assertThat(registry.observe(group).status()).isEqualTo(QualityRegistry.Status.DEFERRED);
    }

    @Test
    void reusesGenericHostScopeOnlyAfterManualConfirmation() {
        var candidate = registry.observe(group);
        assertThat(registry.dedicated(group.host(), group.structure())).isFalse();
        registry.confirm(candidate.id(), "session", 10, null, true);
        assertThat(registry.dedicated(group.host(), group.structure())).isTrue();
        var verified = new QualityRecord.Group("test", group.host(), group.structure(), "GENERIC", "next-version", group.host(), QualitySite.Status.MANUAL);
        assertThat(registry.reference(verified, now.plusSeconds(1))).contains(10L);
    }

    @Test
    void expiredClaimPreservesUnfinishedAssignment() {
        var candidate = registry.observe(group);
        registry.request(candidate.id());
        registry.claim(candidate.id(), "session");
        assertThat(registry.candidate(candidate.id()).statusAt(now.plusSeconds(86400))).isEqualTo(QualityRegistry.Status.REQUESTED);
        registry.release(candidate.id(), "session");
        assertThat(registry.candidate(candidate.id()).statusAt(now)).isEqualTo(QualityRegistry.Status.REQUESTED);
    }

    @Test
    void lateReportKeepsEarlierManualReferenceAfterCountCorrection() {
        var candidate = registry.observe(group);
        registry.confirm(candidate.id(), "session", 10, null, true);
        var later = new QualityRegistry(store, Clock.fixed(now.plusSeconds(100), ZoneOffset.UTC), "test");
        later.reopen(candidate.id(), "session");
        later.confirm(candidate.id(), "session", 20, null, true);
        var verified = new QualityRecord.Group("test", group.host(), group.structure(), "GENERIC", "build", group.host(), QualitySite.Status.MANUAL);
        assertThat(later.reference(verified, now.plusSeconds(50))).contains(10L);
        assertThat(later.reference(verified, now.plusSeconds(150))).contains(20L);
    }

    @Test
    void latestCorrectionWinsWhenConfirmationTimesAreEqual() {
        var candidate = registry.observe(group);
        registry.confirm(candidate.id(), "session", 10, null, true);
        registry.reopen(candidate.id(), "session");
        registry.confirm(candidate.id(), "session", 20, null, true);
        assertThat(registry.reference(group, now)).contains(20L);
        var verified = new QualityRecord.Group("test", group.host(), group.structure(), "GENERIC", "build", group.host(), QualitySite.Status.MANUAL);
        assertThat(registry.reference(verified, now)).contains(20L);
    }
}
