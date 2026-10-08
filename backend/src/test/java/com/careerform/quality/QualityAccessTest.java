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
        assertThat(empty.configured()).isFalse();
        assertThat(empty.canQuery("synthetic-readonly")).isFalse();
    }

    @Test
    void verifiesEachPasswordWithoutSavingAuthenticationSessions() {
        var store = new MemorySessions();
        var access = new QualityAccess(Clock.fixed(NOW, ZoneOffset.UTC), PASSWORD_HASH, READ_HASH, store);
        assertThat(access.login("synthetic-only", "client").status()).isEqualTo(QualityAccess.LoginStatus.OK);
        assertThat(store.values).isEmpty();
        assertThat(access.login("wrong", "client").status()).isEqualTo(QualityAccess.LoginStatus.INVALID);
        assertThat(access.login("synthetic-only", "client").status()).isEqualTo(QualityAccess.LoginStatus.OK);
        assertThat(store.values).isEmpty();
        assertThat(access.canQuery("synthetic-readonly")).isTrue();
        assertThat(access.canQuery("unknown")).isFalse();
    }

    @Test
    void claimantExpiresIndependentlyAndNeverAuthenticates() {
        var clock = new MutableClock(NOW);
        var access = new QualityAccess(clock, PASSWORD_HASH, READ_HASH, new MemorySessions());
        var claimant = access.claimant(null);
        assertThat(access.validClaimant(claimant)).isTrue();
        assertThat(access.login(claimant, "client").status()).isEqualTo(QualityAccess.LoginStatus.INVALID);
        assertThat(access.validClaimant("0".repeat(64))).isFalse();
        clock.current = NOW.plusSeconds(86400);
        assertThat(access.validClaimant(claimant)).isFalse();
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
