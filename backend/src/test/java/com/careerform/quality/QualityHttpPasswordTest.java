package com.careerform.quality;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Clock;
import java.util.Base64;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

class QualityHttpPasswordTest {
    private static final String HASH = "pbkdf2-sha256$600000$cXVhbGl0eS10ZXN0LXNhbHQ=$/lpJNQ22MGBxyHPYyp6YAZCUPj5Wxy6qAUnA421bHCk=";

    @RestController
    static class Fixture {
        @GetMapping("/api/v1/quality/sites") String sites() { return "[]"; }
        @PostMapping("/api/v1/quality/sites/fixture/claim") String claim() { return "ok"; }
        @GetMapping("/quality/") String page() { return "login shell"; }
    }

    @Test
    void loginOverHttpCreatesNoAuthenticationSessionOrCookie() throws Exception {
        var saves = new AtomicInteger();
        var store = new QualityAccess.SessionStore() {
            public Optional<QualityAccess.Session> find(String id) { return Optional.empty(); }
            public void save(QualityAccess.Session session) {
                assertThat(session.configurationKey()).isEqualTo("CLAIMANT");
                saves.incrementAndGet();
            }
            public void delete(String id) { }
        };
        var access = new QualityAccess(Clock.systemUTC(), HASH, "", store);
        var mvc = MockMvcBuilders.standaloneSetup(new QualityLoginController(access), new Fixture())
            .addFilters(new QualityApiFilter(access)).build();
        var response = mvc.perform(post("/api/v1/quality/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"password\":\"synthetic-only\"}")).andExpect(status().isOk()).andReturn().getResponse();
        assertThat(response.getHeaders("Set-Cookie")).isEmpty();
        assertThat(saves.get()).isEqualTo(1);
        assertThat(response.getContentAsString()).doesNotContain("csrf", "session", "synthetic-only");
        mvc.perform(get("/api/v1/quality/sites")).andExpect(status().isUnauthorized());
        mvc.perform(get("/quality/")).andExpect(status().isOk());
    }

    @Test
    void everyManagementRequestRequiresPasswordAndRejectsForeignOrigin() throws Exception {
        var store = new QualityAccess.SessionStore() {
            public Optional<QualityAccess.Session> find(String id) { return Optional.empty(); }
            public void save(QualityAccess.Session session) { }
            public void delete(String id) { }
        };
        var access = new QualityAccess(Clock.systemUTC(), HASH, "", store);
        var mvc = MockMvcBuilders.standaloneSetup(new Fixture()).addFilters(new QualityApiFilter(access)).build();
        var auth = "Basic " + Base64.getEncoder().encodeToString("quality:synthetic-only".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        mvc.perform(get("/api/v1/quality/sites").header("Authorization", auth)).andExpect(status().isOk());
        mvc.perform(post("/api/v1/quality/sites/fixture/claim").header("Authorization", auth)
            .header("Origin", "http://localhost")).andExpect(status().isOk());
        mvc.perform(post("/api/v1/quality/sites/fixture/claim").header("Authorization", auth)
            .header("Origin", "http://foreign.test")).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/quality/sites").header("Authorization", "Basic invalid"))
            .andExpect(status().isUnauthorized());
    }
    @Test
    void passwordProtectedClaimantHeaderPreservesOwnershipAndConfirmationHistory() throws Exception {
        var records = new java.util.HashMap<String, QualityRecord>();
        var store = new QualityStore() {
            public boolean insert(QualityRecord record) { return records.putIfAbsent(record.id(), record) == null; }
            public Optional<QualityRecord> find(String id, java.time.Instant now) { return Optional.ofNullable(records.get(id)); }
            public boolean replace(QualityRecord previous, QualityRecord next) { return records.replace(previous.id(), previous, next); }
            public java.util.List<QualityRecord> list(Query query, java.time.Instant now) {
                return records.values().stream().filter(record -> record.kind() == query.kind()).toList();
            }
        };
        var owners = new java.util.HashMap<String, QualityAccess.Session>();
        var claims = new QualityAccess.SessionStore() {
            public Optional<QualityAccess.Session> find(String id) { return Optional.ofNullable(owners.get(id)); }
            public void save(QualityAccess.Session claim) { owners.put(claim.id(), claim); }
            public void delete(String id) { owners.remove(id); }
        };
        var access = new QualityAccess(Clock.systemUTC(), HASH, "", claims);
        var registry = new QualityRegistry(store, Clock.systemUTC(), "test");
        var candidate = registry.observe(new QualityRecord.Group("test", "careers.example.test", "shape", "GENERIC", "build"));
        var mvc = MockMvcBuilders.standaloneSetup(new QualityRegistryController(registry, access))
            .addFilters(new QualityApiFilter(access)).build();
        var auth = "Basic " + Base64.getEncoder().encodeToString("quality:synthetic-only".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        var first = access.claimant(null);
        var second = access.claimant(null);
        var endpoint = "/api/v1/quality/sites/" + candidate.id();
        mvc.perform(post(endpoint + "/claim").header("Authorization", auth).header("X-Quality-Claimant", first)
            .contentType(MediaType.APPLICATION_JSON).content("{\"claimant\":\"fixture\"}"))
            .andExpect(status().isNoContent());
        mvc.perform(post(endpoint + "/confirm").header("Authorization", auth).header("X-Quality-Claimant", second)
            .contentType(MediaType.APPLICATION_JSON).content("{\"fieldCount\":3}"))
            .andExpect(status().isConflict());
        var details = mvc.perform(get(endpoint + "/details").header("Authorization", auth).header("X-Quality-Claimant", first))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(tools.jackson.databind.json.JsonMapper.builder().build().readTree(details).get("mine").asBoolean()).isTrue();
        var result = mvc.perform(post(endpoint + "/confirm").header("Authorization", auth).header("X-Quality-Claimant", first)
            .contentType(MediaType.APPLICATION_JSON).content("{\"fieldCount\":3}"))
            .andExpect(status().isNoContent()).andReturn().getResponse();
        assertThat(result.getHeaders("Set-Cookie")).isEmpty();
        var history = mvc.perform(get(endpoint).header("Authorization", auth))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(tools.jackson.databind.json.JsonMapper.builder().build().readTree(history).get(0).get("fieldCount").asLong()).isEqualTo(3);
        mvc.perform(post(endpoint + "/claim").header("X-Quality-Claimant", first)).andExpect(status().isUnauthorized());
    }

}
