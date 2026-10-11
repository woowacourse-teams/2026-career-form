package com.careerform.quality;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class QualityReportingHttpTest {
    @Test
    void acceptsOwnedReportOnlyOnceAndRejectsForeignScope() throws Exception {
        Map<String, QualityRecord> records = new HashMap<>();
        var store = new QualityStore() {
            public boolean insert(QualityRecord record) { return records.putIfAbsent(record.id(), record) == null; }
            public Optional<QualityRecord> find(String id, Instant now) { return Optional.ofNullable(records.get(id)); }
            public boolean replace(QualityRecord previous, QualityRecord next) { return records.replace(previous.id(), previous, next); }
            public List<QualityRecord> list(Query query, Instant now) { return List.copyOf(records.values()); }
        };
        var now = Instant.parse("2030-01-01T00:00:00Z");
        var collector = new QualityCollectionService(store, Clock.fixed(now, ZoneOffset.UTC), "test", "build");
        var snapshot = new QualityProjection.Snapshot(QualityProjection.digest("snapshot"), "example.test", "shape",
            List.of(new QualityProjection.Field(QualityProjection.digest("snapshot|field"), "0", "TEXT", true, true)));
        var receipt = collector.observe(new QualityRecord.Group("test", "example.test", "shape", "GENERIC", "build"),
            new QualityCollectionService.RequestEvent("FIELDS", 200, 5, snapshot.counts(), List.of()), snapshot, null, null, true);
        var access = new QualityAccess(Clock.fixed(now, ZoneOffset.UTC), "", "", org.mockito.Mockito.mock(QualityAccess.SessionStore.class));
        var mvc = MockMvcBuilders.standaloneSetup(new QualityReportingController(collector)).addFilters(new QualityApiFilter(access)).build();
        var body = """
            {"eventId":"event1","snapshotId":"snapshot","fields":{"field":{"bound":true,"attempted":true,"written":true,"retained":true,"reason":null}},"finished":"COMPLETED"}
            """;
        var endpoint = "/api/v1/quality/executions/" + receipt.runId() + "/report";
        mvc.perform(post(endpoint).contentType(MediaType.APPLICATION_JSON).header("Authorization", "Bearer " + receipt.token()).content(body))
            .andExpect(status().isNoContent());
        var revision = records.get(receipt.runId()).revision();
        mvc.perform(post(endpoint).contentType(MediaType.APPLICATION_JSON).header("Authorization", "Bearer " + receipt.token()).content(body))
            .andExpect(status().isNoContent());
        assertThat(records.get(receipt.runId()).revision()).isEqualTo(revision);
        mvc.perform(post(endpoint).contentType(MediaType.APPLICATION_JSON).header("Authorization", "Bearer " + receipt.token())
            .content("{\"eventId\":\"foreign\",\"snapshotId\":\"unknown\",\"fields\":{},\"finished\":\"COMPLETED\"}"))
            .andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/quality/sites").header("Authorization", "Bearer " + receipt.token())).andExpect(status().isServiceUnavailable());
    }
}
