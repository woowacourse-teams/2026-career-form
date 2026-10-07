package com.careerform.quality;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("계정 없는 품질 관리 접근 제한")
class QualityAccessTest {

    private static final String PASSWORD_HASH =
        "pbkdf2-sha256$600000$cXVhbGl0eS10ZXN0LXNhbHQ=$/lpJNQ22MGBxyHPYyp6YAZCUPj5Wxy6qAUnA421bHCk=";
    private static final String READ_HASH = "618def57c8f930dd7dc165c96665f0caceffdbb24b8e114265d00ba2000a3957";
    private static final Instant NOW = Instant.parse("2026-10-06T00:20:00Z");

    @Test
    @DisplayName("비밀번호 설정이 없거나 잘못되면 로그인과 조회를 허용하지 않는다")
    void failsClosedWithoutValidConfiguration() {
        var store = new MemorySessions();
        var clock = Clock.fixed(NOW, ZoneOffset.UTC);
        var empty = new QualityAccess(clock, "", "", store);
        var malformed = new QualityAccess(clock, "malformed", "", store);

        assertThat(empty.login("synthetic-only", "client").status())
            .isEqualTo(QualityAccess.LoginStatus.NOT_CONFIGURED);
        assertThat(malformed.login("synthetic-only", "client").status())
            .isEqualTo(QualityAccess.LoginStatus.NOT_CONFIGURED);
        assertThat(empty.authorize(null, null, false)).isFalse();
        assertThat(empty.canQuery("synthetic-readonly")).isFalse();
    }

    @Test
    @DisplayName("쓰기에는 로그인 세션과 올바른 CSRF 값을 함께 요구한다")
    void requiresSessionAndCsrfForMutations() {
        var store = new MemorySessions();
        var access = new QualityAccess(Clock.fixed(NOW, ZoneOffset.UTC), PASSWORD_HASH, READ_HASH, store);
        var login = access.login("synthetic-only", "client");

        assertThat(login.status()).isEqualTo(QualityAccess.LoginStatus.OK);
        assertThat(access.authorize(login.sessionToken(), null, false)).isTrue();
        assertThat(access.authorize(login.sessionToken(), null, true)).isFalse();
        assertThat(access.authorize(login.sessionToken(), "wrong", true)).isFalse();
        assertThat(access.authorize(login.sessionToken(), login.csrfToken(), true)).isTrue();
        assertThat(access.authorize("unknown", login.csrfToken(), false)).isFalse();
        assertThat(store.values.toString()).doesNotContain(login.sessionToken(), login.csrfToken(), "synthetic-only");
    }

    @Test
    void resumesClaimOwnershipAfterEightHourReauthentication() {
        var clock = new MutableClock(NOW);
        var access = new QualityAccess(clock, PASSWORD_HASH, READ_HASH, new MemorySessions());
        var login = access.login("synthetic-only", "client");
        var claimant = access.claimant(null);
        clock.current = NOW.plusSeconds(8 * 3600);
        assertThat(access.authorize(login.sessionToken(), null, false)).isFalse();
        assertThat(access.validClaimant(claimant)).isTrue();
        access.login("synthetic-only", "client");
        assertThat(access.claimant(claimant)).isEqualTo(claimant);
        assertThat(access.validClaimant("0".repeat(64))).isFalse();
    }

    @Test
    @DisplayName("세션은 8시간 경계에서 만료되고 로그아웃한 세션은 재사용할 수 없다")
    void expiresAndRevokesSessionsIndependently() {
        var store = new MemorySessions();
        var clock = new MutableClock(NOW);
        var access = new QualityAccess(clock, PASSWORD_HASH, READ_HASH, store);
        var first = access.login("synthetic-only", "client");
        var second = access.login("synthetic-only", "client");
        access.logout(first.sessionToken());

        assertThat(access.authorize(first.sessionToken(), null, false)).isFalse();
        assertThat(access.authorize(second.sessionToken(), null, false)).isTrue();
        clock.current = Instant.parse("2026-10-06T08:19:59Z");
        assertThat(access.authorize(second.sessionToken(), null, false)).isTrue();
        clock.current = Instant.parse("2026-10-06T08:20:00Z");
        assertThat(access.authorize(second.sessionToken(), null, false)).isFalse();
    }

    @Test
    @DisplayName("비밀번호 검증 설정이 바뀌면 기존 세션을 무효화한다")
    void invalidatesSessionsAfterConfigurationChange() {
        var store = new MemorySessions();
        var clock = Clock.fixed(NOW, ZoneOffset.UTC);
        var access = new QualityAccess(clock, PASSWORD_HASH, READ_HASH, store);
        var login = access.login("synthetic-only", "client");

        var changed = new QualityAccess(clock, "", READ_HASH, store);

        assertThat(changed.authorize(login.sessionToken(), login.csrfToken(), false)).isFalse();
        assertThat(access.canQuery("synthetic-readonly")).isTrue();
        assertThat(access.canQuery("unknown")).isFalse();
    }

    @Test
    @DisplayName("같은 출처의 잘못된 비밀번호 시도를 제한하고 대기 후 다시 허용한다")
    void throttlesFailedPasswordAttempts() {
        var clock = new MutableClock(NOW);
        var access = new QualityAccess(clock, PASSWORD_HASH, READ_HASH, new MemorySessions());
        for (var index = 0; index < 5; index++) {
            assertThat(access.login("wrong", "client").status()).isEqualTo(QualityAccess.LoginStatus.INVALID);
        }
        assertThat(access.login("synthetic-only", "client").status())
            .isEqualTo(QualityAccess.LoginStatus.THROTTLED);
        clock.current = Instant.parse("2026-10-06T00:30:00Z");
        assertThat(access.login("synthetic-only", "client").status()).isEqualTo(QualityAccess.LoginStatus.OK);
    }

    private static final class MemorySessions implements QualityAccess.SessionStore {
        private final Map<String, QualityAccess.Session> values = new HashMap<>();

        @Override
        public Optional<QualityAccess.Session> find(String id) {
            return Optional.ofNullable(values.get(id));
        }

        @Override
        public void save(QualityAccess.Session session) {
            values.put(session.id(), session);
        }

        @Override
        public void delete(String id) {
            values.remove(id);
        }
    }

    private static final class MutableClock extends Clock {
        private Instant current;

        private MutableClock(Instant current) {
            this.current = current;
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return Clock.fixed(current, zone);
        }

        @Override
        public Instant instant() {
            return current;
        }
    }
}
