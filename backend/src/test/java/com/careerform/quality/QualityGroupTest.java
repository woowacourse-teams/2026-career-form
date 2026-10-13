package com.careerform.quality;

import static org.assertj.core.api.Assertions.assertThat;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

class QualityGroupTest {
    private final Instant now = Instant.parse("2030-01-01T00:20:00Z");
    private final java.util.Map<String, QualityRecord> records = new HashMap<>();
    private final QualityStore store = new QualityStore() {
        public boolean insert(QualityRecord value) { return records.putIfAbsent(value.id(), value) == null; }
        public Optional<QualityRecord> find(String id, Instant at) { return Optional.ofNullable(records.get(id)); }
        public boolean replace(QualityRecord old, QualityRecord next) { return records.replace(old.id(), old, next); }
        public List<QualityRecord> list(Query query, Instant at) {
            return records.values().stream().filter(value -> value.kind() == query.kind() && value.group().environment().equals(query.environment()))
                .sorted(java.util.Comparator.comparing(QualityRecord::id)).skip(query.offset()).limit(query.limit()).toList();
        }
    };
    private final Clock clock = Clock.fixed(now, ZoneOffset.UTC);
    private final QualityRegistry registry = new QualityRegistry(store, clock, "test");

    private QualityRegistry.Candidate observe(String host, String site, String shape, QualitySite.Status identity) {
        return registry.observe(new QualityRecord.Group("test", site, shape, "GENERIC", "v1", host, identity));
    }

    @Test
    void groupsRunsAndStructuresBeforePaginationWithoutMergingHistory() {
        var a = observe("shared.test", "shared.test|unverified=run-a", "shape-a", QualitySite.Status.UNVERIFIED);
        var b = observe("shared.test", "shared.test|unverified=run-b", "shape-b", QualitySite.Status.UNVERIFIED);
        var c = observe("shared.test", "shared.test|unverified=run-c", "shape-a", QualitySite.Status.UNVERIFIED);
        registry.confirm(a.id(), "owner", 3, null);
        registry.claim(b.id(), "owner");
        registry.defer(c.id(), "owner", QualityRegistry.DeferReason.LINK_UNAVAILABLE, null);
        observe("other.test", "other.test", "shape", QualitySite.Status.TENANT);
        var controller = new QualityRegistryController(registry, null);
        var first = controller.groups("ALL", 0, 1, new MockHttpServletRequest());
        var second = controller.groups("ALL", 1, 1, new MockHttpServletRequest());
        assertThat(first.items()).hasSize(1);
        assertThat(first.hasMore()).isTrue();
        assertThat(second.items()).hasSize(1);
        assertThat(second.items().getFirst().id()).isNotEqualTo(first.items().getFirst().id());
        var shared = controller.groupDetails(a.id(), new MockHttpServletRequest());
        assertThat(shared.candidates()).extracting(QualityRegistryController.Row::status)
            .containsExactlyInAnyOrder(QualityRegistry.Status.COMPLETED, QualityRegistry.Status.CLAIMED, QualityRegistry.Status.DEFERRED);
        assertThat(registry.reference(records.get(b.id()).group(), now)).isEmpty();
        assertThat(registry.reference(records.get(c.id()).group(), now)).isEmpty();
        assertThat(controller.groups("PENDING", 0, 10, new MockHttpServletRequest()).items()).hasSize(2);
        assertThat(controller.groups("COMPLETED", 0, 10, new MockHttpServletRequest()).items()).isEmpty();
    }

    @Test
    void keepsKnownCompaniesAndEnvironmentsSeparate() {
        observe("shared.test", "shared.test|company=A", "shape", QualitySite.Status.POLICY);
        observe("shared.test", "shared.test|company=B", "shape", QualitySite.Status.POLICY);
        observe("shared.test", "shared.test|unverified=a", "shape", QualitySite.Status.UNVERIFIED);
        observe("shared.test", "shared.test|unverified=b", "shape", QualitySite.Status.UNVERIFIED);
        new QualityRegistry(store, clock, "other").observe(new QualityRecord.Group("other", "shared.test", "shape", "GENERIC", "v1"));
        var grouped = new QualityRegistryController(registry, null).groups("ALL", 0, 10, new MockHttpServletRequest()).items();
        assertThat(grouped).hasSize(3);
        assertThat(grouped).extracting(QualityRegistryController.SiteRow::company).containsExactlyInAnyOrder("A", "B", null);
    }

    @Test
    void discordSelectsOneSiteAndPreservesExistingAssignmentCapacity() {
        var active = observe("shared.test", "shared.test|unverified=active", "shape", QualitySite.Status.UNVERIFIED);
        registry.claim(active.id(), "owner");
        for (var index = 0; index < 8; index++) {
            observe("shared.test", "shared.test|unverified=" + index, "shape" + index, QualitySite.Status.UNVERIFIED);
            observe("site" + index + ".test", "site" + index + ".test", "shape", QualitySite.Status.TENANT);
        }
        var batch = new QualityDailyBatch(store, registry, clock, "test", "http://synthetic.test/quality/", false,
            message -> new QualityDiscord.Result(QualityDiscord.Status.SENT, "fixture"), 7, 20).dispatch();
        assertThat(batch.entries()).hasSize(5).extracting(QualityDailyBatch.Entry::host).doesNotHaveDuplicates();
        assertThat(batch.entries()).anyMatch(entry -> entry.candidateId().equals(active.id()) && entry.existing());
        assertThat(batch.entries().stream().filter(entry -> !entry.existing())).hasSize(4);
    }

    @Test
    void deduplicatesPostingLinksAcrossPreservedScreenScopes() {
        var host = "fixture.career.greetinghr.com";
        var first = new QualityRecord.Group("test", host, "shape-a", "GREETING", "v1", host, QualitySite.Status.TENANT);
        var second = new QualityRecord.Group("test", host, "shape-b", "GREETING", "v1", host, QualitySite.Status.TENANT);
        var url = "https://" + host + "/ko/o/238112/apply";
        registry.observe(first, now, url);
        registry.observe(second, now.plusSeconds(1), url);
        registry.observe(second, now.plusSeconds(2), "https://" + host + "/ko/o/238113/apply");
        var grouped = new QualityRegistryController(registry, null).groups("ALL", 0, 10, new MockHttpServletRequest());
        assertThat(grouped.items()).hasSize(1);
        assertThat(grouped.items().getFirst().candidates()).hasSize(2);
        assertThat(grouped.items().getFirst().links()).extracting(QualityPublicLinks.Link::url)
            .containsExactly("https://fixture.career.greetinghr.com/ko/o/238113/apply", url);
        assertThat(grouped.items().getFirst().links().getLast().lastSeen()).isEqualTo(now.plusSeconds(1));
    }

    @Test
    void groupedRemindersDoNotFreeCapacityOfOtherAssignedScreens() {
        for (var index = 0; index < 3; index++) {
            var candidate = observe("shared.test", "shared.test|unverified=" + index, "shape" + index, QualitySite.Status.UNVERIFIED);
            registry.request(candidate.id());
        }
        for (var index = 0; index < 6; index++) {
            observe("site" + index + ".test", "site" + index + ".test", "shape", QualitySite.Status.TENANT);
        }
        var batch = new QualityDailyBatch(store, registry, clock, "test", "http://synthetic.test/quality/", false,
            message -> new QualityDiscord.Result(QualityDiscord.Status.SENT, "fixture"), 7, 20).dispatch();
        assertThat(batch.entries()).hasSize(3).extracting(QualityDailyBatch.Entry::host).doesNotHaveDuplicates();
        assertThat(batch.entries().stream().filter(entry -> !entry.existing())).hasSize(2);
        assertThat(registry.listRecords(null, 0, 100).stream().filter(record -> ((QualityRegistry.Candidate) record.payload()).requested())).hasSize(3);
    }
}
