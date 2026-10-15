package com.careerform.quality;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class QualityStatsHttpTest {
    @Test
    void serializesSiteOptionsAndObservedTrendWithQueryCredentials() throws Exception {
        var now = Instant.parse("2030-01-01T00:00:00Z");
        var clock = Clock.fixed(now, ZoneOffset.UTC);
        var store = mock(QualityStore.class);
        var counts = new QualityMetrics.Counts(10, 8, 8, 8, 8, 8);
        var source = new QualityDailyAggregate.Contribution(0, 0, 1, counts, counts, 10, now,
            QualityExecution.Status.COMPLETED, Map.of(), QualityHistogram.empty(), QualityHistogram.empty(), 0, 0, 0, null, false);
        var group = new QualityRecord.Group("test", "site.test|company=company-a", "shape", "STATIC", "v1", "site.test", QualitySite.Status.POLICY);
        var record = new QualityRecord("record", QualityRecord.Kind.AGGREGATE, group, 0,
            Instant.parse("2029-12-31T15:00:00Z"), now.plusSeconds(86400), new QualityDailyAggregate(Map.of("run", source)));
        when(store.list(any(), any())).thenReturn(List.of(record));
        var access = new QualityAccess(clock, "", QualityProjection.digest("synthetic-query-token"), mock(QualityAccess.SessionStore.class));
        var mvc = MockMvcBuilders.standaloneSetup(new QualityStatsController(new QualityStats(store, clock, "test")))
            .addFilters(new QualityApiFilter(access)).build();
        mvc.perform(get("/api/v1/quality/stats/sites").header("Authorization", "Bearer synthetic-query-token"))
            .andExpect(status().isOk()).andExpect(jsonPath("$[0].value").value("site.test|company=company-a"))
            .andExpect(jsonPath("$[0].text").value("site.test (company-a)"));
        mvc.perform(get("/api/v1/quality/stats").param("groupBy", "SITE_VERSION_TREND")
            .param("from", "2029-12-31T15:00:00Z").param("to", "2030-01-02T15:00:00Z")
            .header("Authorization", "Bearer synthetic-query-token"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.rows.length()").value(2))
            .andExpect(jsonPath("$.rows[0].time").value("2029-12-31T15:00:00Z"))
            .andExpect(jsonPath("$.rows[0].siteLabel").value("site.test (company-a)"))
            .andExpect(jsonPath("$.rows[0].observed.inputSuccess.rate").value(1.0))
            .andExpect(jsonPath("$.rows[0].observed.inputSuccess.denominator").value(8))
            .andExpect(jsonPath("$.rows[1].observed.inputSuccess.rate").isEmpty());
        mvc.perform(get("/api/v1/quality/stats/sites")).andExpect(status().isServiceUnavailable());
        mvc.perform(get("/api/v1/quality/stats/sites").param("from", "not-a-date")
            .header("Authorization", "Bearer synthetic-query-token")).andExpect(status().isBadRequest());
    }
}
