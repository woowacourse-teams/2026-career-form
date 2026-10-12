package com.careerform.quality;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.FieldsAnalysisResponse;
import com.careerform.formanalysis.application.FormAnalysisRouter.RouteKind;
import com.careerform.formanalysis.application.port.AnalysisRouteObserver;

class QualityPublicLinkHttpTest {
    private final java.util.Map<String, QualityRecord> records = new HashMap<>();
    private final QualityStore store = new QualityStore() {
        public boolean insert(QualityRecord value) { return records.putIfAbsent(value.id(), value) == null; }
        public Optional<QualityRecord> find(String id, Instant at) { return Optional.ofNullable(records.get(id)); }
        public boolean replace(QualityRecord old, QualityRecord next) { return records.replace(old.id(), old, next); }
        public List<QualityRecord> list(Query query, Instant at) { return records.values().stream().filter(value -> value.kind() == query.kind()).toList(); }
    };
    @RestController
    static class Controller {
        @PostMapping("/api/v1/fields/analyze")
        FieldsAnalysisResponse analyze(@RequestBody FieldsAnalysisRequest request) {
            QualityScope.record(new AnalysisRouteObserver.Decision(AnalysisRouteObserver.Operation.FIELDS, RouteKind.ADAPTER, true, "greeting", 1L));
            return FieldsAnalysisResponse.complete(request.snapshotId(), List.of());
        }
    }
    @Test
    void observesPublicLinkBeforeAnyClientReportWithoutChangingTheAnalysisResponse() throws Exception {
        var clock = Clock.fixed(Instant.parse("2030-01-01T00:00:00Z"), ZoneOffset.UTC);
        var registry = new QualityRegistry(store, clock, "test");
        var collector = new QualityCollectionService(store, clock, "test", "build", null, registry);
        var mvc = MockMvcBuilders.standaloneSetup(new Controller()).setControllerAdvice(new QualityBodyAdvice(collector, registry))
            .addFilters(new QualityObservationFilter(collector)).build();
        var publicLink = "https://fixture.career.greetinghr.com/ko/o/238112/apply";
        var request = """
            {"schemaVersion":2,"snapshotId":"fixture","site":{"host":"fixture.career.greetinghr.com","pathPattern":"/ko/o/*/apply"},
             "sections":[{"sectionId":"root","fields":[]}]}
            """;
        var response = mvc.perform(post("/api/v1/fields/analyze").contentType(MediaType.APPLICATION_JSON).content(request)
            .header("X-Career-Form-Public-Application", publicLink)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(response).doesNotContain("238112", "publicLink");
        var candidates = registry.listRecords(null, 0, 100);
        assertThat(candidates).hasSize(1);
        assertThat(((QualityRegistry.Candidate) candidates.getFirst().payload()).links()).extracting(QualityPublicLinks.Link::url).containsExactly(publicLink);
        assertThat(records.values().stream().filter(value -> value.kind() == QualityRecord.Kind.REQUEST).map(QualityRecord::payload))
            .allSatisfy(value -> assertThat(value.toString()).doesNotContain("238112", "Public-Application"));
        mvc.perform(post("/api/v1/fields/analyze").contentType(MediaType.APPLICATION_JSON).content(request)
            .header("X-Career-Form-Public-Application", publicLink + "?token=synthetic")).andExpect(status().isOk());
        assertThat(((QualityRegistry.Candidate) registry.listRecords(null, 0, 100).getFirst().payload()).links()).hasSize(1);
        assertThat(records.toString()).doesNotContain("token=synthetic");
    }
}
