package com.careerform.quality;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;

import org.junit.jupiter.api.Test;

class QualityStatsTrendTest {
    private final Instant from = Instant.parse("2029-12-31T15:00:00Z");
    private final Instant to = Instant.parse("2030-01-03T15:00:00Z");
    private final QualityStore store = mock(QualityStore.class);
    private final QualityStats stats = new QualityStats(store, Clock.fixed(from, ZoneOffset.UTC), "test");

    @Test
    void separatesSitesVersionsAndRoutesAndFillsAbsentDaysWithNullRates() {
        when(store.list(any(), any())).thenReturn(List.of(record("a", "GENERIC", "v1", 0),
            record("a", "GENERIC", "v1", 2), record("b", "GREETING", "v2", 0)));
        var rows = stats.query(from, to, null, null, null, null, "SITE_VERSION_TREND").rows();
        assertThat(rows).hasSize(6);
        var absent = rows.stream().filter(row -> row.dimension().site().equals("a.test")
            && row.dimension().dateKst().equals("2030-01-02")).findFirst().orElseThrow();
        assertThat(absent.time()).isEqualTo("2030-01-01T15:00:00Z");
        assertThat(absent.observed().inputSuccess().rate()).isNull();
        assertThat(absent.executionCount()).isZero();
        assertThat(absent.series()).contains("a.test", "범용", "v1");
        assertThat(rows.stream().filter(row -> row.dimension().site().equals("b.test")))
            .allSatisfy(row -> assertThat(row.dimension().version()).isEqualTo("v2"));
    }

    @Test
    void retainsSiteIdentityInOptionsAndRejectsOversizedExpandedTrends() {
        var policy = record("a", "STATIC", "v1", 0);
        var group = new QualityRecord.Group("test", "a.test|company=company-a", "shape", "STATIC", "v1", "a.test", QualitySite.Status.POLICY);
        var other = new QualityRecord("other", policy.kind(), group, 0, policy.createdAt(), policy.expiresAt(), policy.payload());
        when(store.list(any(), any())).thenReturn(List.of(policy, other));
        var options = stats.sites(from, to, null, null, null);
        assertThat(options).extracting(QualityStatsResponse.SiteOption::value)
            .containsExactlyInAnyOrder("a.test", "a.test|company=company-a");
        assertThat(options).anySatisfy(option -> assertThat(option.text()).contains("company-a"));
        when(store.list(any(), any())).thenReturn(IntStream.range(0, 167).mapToObj(index -> record("site" + index, "GENERIC", "v1", 0)).toList());
        assertThatThrownBy(() -> stats.query(from, to, null, null, null, null, "SITE_VERSION_TREND"))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void appliesFiltersToSiteOptionsAndTrendRows() {
        when(store.list(any(), any())).thenAnswer(invocation -> {
            QualityStore.Query query = invocation.getArgument(0);
            return List.of(record("a", "GENERIC", "v1", 0), record("b", "GREETING", "v2", 0)).stream()
                .filter(record -> record.group().environment().equals(query.environment()))
                .filter(record -> query.site() == null || record.group().site().equals(query.site()))
                .filter(record -> query.route() == null || record.group().route().equals(query.route()))
                .filter(record -> query.version() == null || record.group().version().equals(query.version())).toList();
        });
        assertThat(stats.sites(from, to, "shape", "GREETING", "v2"))
            .extracting(QualityStatsResponse.SiteOption::value).containsExactly("b.test");
        assertThat(stats.sites(from, to, "other-shape", null, null)).isEmpty();
        assertThat(stats.query(from, to, "a.test", "shape", "GENERIC", "v1", "SITE_VERSION_TREND").rows())
            .hasSize(3).allSatisfy(row -> assertThat(row.dimension().site()).isEqualTo("a.test"));
    }

    private QualityRecord record(String site, String route, String version, long day) {
        var counts = new QualityMetrics.Counts(10, 8, 8, 8, 8, 8);
        var source = new QualityDailyAggregate.Contribution(0, 1, 1, counts, counts, 10, to,
            QualityExecution.Status.COMPLETED, Map.of(), QualityHistogram.empty(), QualityHistogram.empty(), 0, 0, 0, 10L, true);
        return new QualityRecord(site + day, QualityRecord.Kind.AGGREGATE,
            new QualityRecord.Group("test", site + ".test", "shape", route, version), 0,
            from.plusSeconds(day * 86400), to.plusSeconds(86400), new QualityDailyAggregate(Map.of(site + day, source)));
    }
}
