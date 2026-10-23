package com.careerform.quality;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.RegisterExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import tools.jackson.databind.ObjectMapper;

class QualityReportingHttpTest {
    @RegisterExtension final QualityTestRuntime runtime = new QualityTestRuntime();
    private final Map<String, QualityRecord> records = new ConcurrentHashMap<>();
    private final QualityStore store = new QualityStore() {
        public boolean insert(QualityRecord record) { return records.putIfAbsent(record.id(), record) == null; }
        public Optional<QualityRecord> find(String id, Instant now) { return Optional.ofNullable(records.get(id)); }
        public boolean replace(QualityRecord previous, QualityRecord next) { return records.replace(previous.id(), previous, next); }
        public List<QualityRecord> list(Query query, Instant now) { return List.copyOf(records.values()); }
    };

    @Test
    void acceptsBatchOnceValidatesAllMembersAndKeepsLegacyReports() throws Exception {
        var collector = new QualityCollectionService(store, Clock.systemUTC(), "test", "build");
        var access = new QualityAccess(Clock.systemUTC(), "", "", org.mockito.Mockito.mock(QualityAccess.SessionStore.class));
        var service = runtime.service(collector, null);
        var mvc = MockMvcBuilders.standaloneSetup(new QualityReportingController(service)).addFilters(new QualityApiFilter(access)).build();
        var credentials = service.register(new QualityRegistration.Input("a".repeat(32), "b".repeat(64)));
        var endpoint = "/api/v1/quality/executions/" + credentials.runId() + "/report";
        var reports = java.util.stream.IntStream.range(0, 50).mapToObj(index ->
            new QualityCollectionService.Report("batch-" + index, null, Map.of(), index == 49 ? QualityExecution.Status.COMPLETED : null)).toList();
        var body = new ObjectMapper().writeValueAsString(Map.of("reports", reports));
        mvc.perform(post(endpoint).contentType(MediaType.APPLICATION_JSON).header("Authorization", "Bearer " + credentials.token()).content(body))
            .andExpect(status().isAccepted());
        mvc.perform(post(endpoint).contentType(MediaType.APPLICATION_JSON).header("Authorization", "Bearer " + credentials.token()).content(body))
            .andExpect(status().isAccepted());
        org.awaitility.Awaitility.await().atMost(java.time.Duration.ofSeconds(10)).untilAsserted(() ->
            assertThat(((QualityCollectionService.Run) records.get(credentials.runId()).payload()).execution().events()).hasSize(50));
        runtime.await();
        var run = (QualityCollectionService.Run) records.get(credentials.runId()).payload();
        assertThat(run.execution().events()).hasSize(50);
        assertThat(run.execution().terminal()).isEqualTo(QualityExecution.Status.COMPLETED);
        mvc.perform(post(endpoint).contentType(MediaType.APPLICATION_JSON).header("Authorization", "Bearer " + "f".repeat(64)).content(body))
            .andExpect(status().isUnauthorized());
        mvc.perform(post(endpoint).contentType(MediaType.APPLICATION_JSON).header("Authorization", "Bearer " + credentials.token()).content("{\"reports\":[null]}"))
            .andExpect(status().isBadRequest());
        var invalid = "{\"reports\":[{\"eventId\":\"valid\",\"fields\":{}},{\"eventId\":\"\",\"fields\":{}}]}";
        mvc.perform(post(endpoint).contentType(MediaType.APPLICATION_JSON).header("Authorization", "Bearer " + credentials.token()).content(invalid))
            .andExpect(status().isBadRequest());
        mvc.perform(post(endpoint).contentType(MediaType.APPLICATION_JSON).header("Authorization", "Bearer " + credentials.token()).content("{\"reports\":[]}"))
            .andExpect(status().isBadRequest());
        mvc.perform(post(endpoint).contentType(MediaType.APPLICATION_JSON).header("Authorization", "Bearer " + credentials.token()).content(" ".repeat(131073)))
            .andExpect(status().isPayloadTooLarge());
        runtime.await();
        assertThat(((QualityCollectionService.Run) records.get(credentials.runId()).payload()).execution().events()).hasSize(50);
    }

    @Test
    void acceptsOwnedReportsAndPreservesManagementAccessControl() throws Exception {
        var collector = new QualityCollectionService(store, Clock.systemUTC(), "test", "build");
        var access = new QualityAccess(Clock.systemUTC(), "", "", org.mockito.Mockito.mock(QualityAccess.SessionStore.class));
        var mvc = MockMvcBuilders.standaloneSetup(new QualityReportingController(runtime.service(collector, null)))
            .addFilters(new QualityApiFilter(access)).build();
        var registration = "{\"clientRun\":\"" + "a".repeat(32) + "\",\"key\":\"" + "b".repeat(64) + "\"}";
        var response = mvc.perform(post("/api/v1/quality/executions").header("Origin", "chrome-extension://synthetic")
            .contentType(MediaType.APPLICATION_JSON).content(registration)).andExpect(status().isCreated()).andReturn().getResponse();
        var credentials = new ObjectMapper().readValue(response.getContentAsString(), QualityRegistration.Credentials.class);
        assertThat(new ObjectMapper().readTree(response.getContentAsString()).get("expiresAt").isString()).isTrue();
        assertThat(response.getHeader("Cache-Control")).isEqualTo("no-store");
        var endpoint = "/api/v1/quality/executions/" + credentials.runId() + "/report";
        var body = "{\"eventId\":\"event\",\"snapshotId\":null,\"fields\":{},\"finished\":\"COMPLETED\"}";
        mvc.perform(post(endpoint).contentType(MediaType.APPLICATION_JSON).header("Authorization", "Bearer " + credentials.token()).content(body))
            .andExpect(status().isAccepted());
        mvc.perform(post(endpoint).contentType(MediaType.APPLICATION_JSON).header("Authorization", "Bearer " + credentials.token()).content(body))
            .andExpect(status().isAccepted());
        runtime.await();
        assertThat(((QualityCollectionService.Run) records.get(credentials.runId()).payload()).execution().events()).hasSize(1);
        mvc.perform(post(endpoint).contentType(MediaType.APPLICATION_JSON).header("Authorization", "Bearer " + "f".repeat(64)).content(body))
            .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/quality/executions").contentType(MediaType.APPLICATION_JSON).content(registration)).andExpect(status().isConflict());
        mvc.perform(post("/api/v1/quality/executions").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/v1/quality/executions").contentType(MediaType.APPLICATION_JSON).content("a".repeat(4097))).andExpect(status().isPayloadTooLarge());
        mvc.perform(get("/api/v1/quality/sites").header("Origin", "https://foreign.test")).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/quality/sites").header("Authorization", "Bearer " + credentials.token())).andExpect(status().isServiceUnavailable());
    }
}
