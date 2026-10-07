package com.careerform.quality;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;

class QualityDailyBatchTest {
    private final Instant now = Instant.parse("2030-01-01T00:20:00Z");
    private final java.util.Map<String, QualityRecord> records = new HashMap<>();
    private final QualityStore store = new QualityStore() {
        public boolean insert(QualityRecord record) { return records.putIfAbsent(record.id(), record) == null; }
        public Optional<QualityRecord> find(String id, Instant time) { return Optional.ofNullable(records.get(id)); }
        public boolean replace(QualityRecord previous, QualityRecord next) { return records.replace(previous.id(), previous, next); }
        public List<QualityRecord> list(Query query, Instant time) {
            return records.values().stream().filter(record -> record.kind() == query.kind())
                .filter(record -> query.completed() == null || (((QualityRegistry.Candidate) record.payload()).status() == QualityRegistry.Status.COMPLETED) == query.completed())
                .sorted(java.util.Comparator.comparing(QualityRecord::id)).skip(query.offset()).limit(query.limit()).toList();
        }
    };
    private final Clock clock = Clock.fixed(now, ZoneOffset.UTC);
    private final QualityRegistry registry = new QualityRegistry(store, clock, "test");

    @Test
    void keepsAssignmentsAndDoesNotSendTwiceAfterRestart() {
        for (var index = 0; index < 9; index++) {
            registry.observe(new QualityRecord.Group("test", "site" + index + ".test", "shape", index % 2 == 0 ? "STATIC" : "GENERIC", "v1"));
        }
        var sends = new AtomicInteger();
        QualityDiscord.Sender sender = message -> { sends.incrementAndGet(); return new QualityDiscord.Result(QualityDiscord.Status.SENT, "123456789"); };
        var first = batch(sender, true).dispatch();
        assertThat(first.entries()).hasSize(5);
        assertThat(first.status()).isEqualTo(QualityDiscord.Status.SENT);
        assertThat(registry.listRecords(null, 0, 100).stream().filter(record -> ((QualityRegistry.Candidate) record.payload()).requested())).hasSize(5);
        assertThat(batch(sender, true).dispatch()).isEqualTo(first);
        assertThat(sends.get()).isEqualTo(1);
    }

    @Test
    void missingWebhookAndAmbiguousSendNeverBecomeSuccess() {
        var sends = new AtomicInteger();
        QualityDiscord.Sender sender = message -> { sends.incrementAndGet(); return new QualityDiscord.Result(QualityDiscord.Status.UNKNOWN, null); };
        assertThat(batch(sender, false).dispatch().status()).isEqualTo(QualityDiscord.Status.NOT_CONFIGURED);
        assertThat(sends.get()).isZero();
        assertThat(batch(sender, true).dispatch().status()).isEqualTo(QualityDiscord.Status.UNKNOWN);
        assertThat(batch(sender, true).dispatch().status()).isEqualTo(QualityDiscord.Status.UNKNOWN);
        assertThat(sends.get()).isEqualTo(1);
    }

    @Test
    void sendsEmptyMessageAndDistinguishesDeferredCandidates() {
        var candidate = registry.observe(new QualityRecord.Group("test", "site.test", "shape", "GENERIC", "v1"));
        registry.defer(candidate.id(), "fixture", QualityRegistry.DeferReason.LOGIN_REQUIRED, null);
        var messages = new java.util.ArrayList<String>();
        var result = batch(message -> { messages.add(message); return new QualityDiscord.Result(QualityDiscord.Status.SENT, "123"); }, true).dispatch();
        assertThat(result.entries()).isEmpty();
        assertThat(messages).singleElement().asString().contains("오늘 확인할 사이트가 없습니다.", "보류 1개", "https://quality.synthetic.test/quality/");
    }

    @Test
    void doesNotCatchUpWeekendOrBeforeNotificationTime() {
        var early = new QualityDailyBatch(store, registry, Clock.fixed(now.minusSeconds(1), ZoneOffset.UTC), "test",
            "https://quality.synthetic.test/quality/", false, message -> new QualityDiscord.Result(QualityDiscord.Status.SENT, "123"), 7, 20);
        assertThat(early.dispatch()).isNull();
        var weekend = new QualityDailyBatch(store, registry, Clock.fixed(Instant.parse("2030-01-05T00:20:00Z"), ZoneOffset.UTC), "test",
            "https://quality.synthetic.test/quality/", false, message -> new QualityDiscord.Result(QualityDiscord.Status.SENT, "123"), 7, 20);
        assertThat(weekend.dispatch()).isNull();
        assertThat(records).isEmpty();
    }

    private QualityDailyBatch batch(QualityDiscord.Sender sender, boolean configured) {
        return new QualityDailyBatch(store, registry, clock, "test", "https://quality.synthetic.test/quality/", configured, sender, 7, 20);
    }
}
