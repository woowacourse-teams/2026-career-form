package com.careerform.evaluation.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.careerform.evaluation.provider.EndpointPolicy;
import com.careerform.evaluation.provider.InMemoryProviderRegistrationStore;
import com.careerform.evaluation.provider.ProviderKeys;
import com.careerform.evaluation.provider.ProviderRegistry;
import com.careerform.formanalysis.infrastructure.adapter.openai.OpenAiChoiceModel;
import com.careerform.quality.QualityAccess;
import com.careerform.quality.QualityApiFilter;

@DisplayName("평가 공급자 등록 API와 품질 비밀번호 경계")
class ProviderRegistrationApiTest {

    private static final Instant NOW = Instant.parse("2026-11-02T05:00:00Z");
    private static final String HASH = "pbkdf2-sha256$600000$cXVhbGl0eS10ZXN0LXNhbHQ=$/lpJNQ22MGBxyHPYyp6YAZCUPj5Wxy6qAUnA421bHCk=";
    private static final String PASSWORD = "Basic " + Base64.getEncoder()
        .encodeToString("quality:synthetic-only".getBytes(StandardCharsets.UTF_8));
    private static final ProviderKeys KEYS = ProviderKeys.parse(
        "{\"deepseek\":{\"key\":\"sk-secret\",\"hosts\":[\"api.deepseek.com\"]}}");
    private static final String DEEPSEEK = """
        {"name": "deepseek", "baseUrl": "https://api.deepseek.com/v1", "keyName": "deepseek",
         "models": ["deepseek-chat"], "format": "JSON_OBJECT", "reasoningEffort": null,
         "timeoutMs": 30000, "minConfidence": 0.8}""";

    private final Map<String, QualityAccess.Session> sessions = new HashMap<>();
    private final QualityAccess access = new QualityAccess(Clock.fixed(NOW, ZoneOffset.UTC), HASH, "",
        new QualityAccess.SessionStore() {
            public Optional<QualityAccess.Session> find(String id) { return Optional.ofNullable(sessions.get(id)); }
            public void save(QualityAccess.Session session) { sessions.put(session.id(), session); }
            public void delete(String id) { sessions.remove(id); }
        });
    private final ProviderRegistry registry = new ProviderRegistry(new InMemoryProviderRegistrationStore(),
        new EndpointPolicy(KEYS, false, host -> List.of(InetAddress.getByName(
            Map.of("api.deepseek.com", "8.8.8.8", "evil.example.com", "9.9.9.9").get(host)))),
        KEYS, Clock.fixed(NOW, ZoneOffset.UTC), (endpoint, key, timeout) -> body -> new OpenAiChoiceModel.Reply(500, "{}"));
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new ProviderRegistrationController(registry))
        .addFilters(new QualityApiFilter(access)).build();

    private ResultActions authorized(MockHttpServletRequestBuilder request) throws Exception {
        return mvc.perform(request.header("Authorization", PASSWORD));
    }

    @Test
    @DisplayName("비밀번호가 없으면 목록과 등록 모두 401이다")
    void requiresQualityPassword() throws Exception {
        mvc.perform(get("/api/v1/evaluations/provider-registrations")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/evaluations/provider-registrations").contentType(MediaType.APPLICATION_JSON)
            .content(DEEPSEEK)).andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("등록하면 201이고, 목록은 키 이름과 허용 호스트만 보이며 키 원문은 어디에도 없다")
    void registersAndListsWithoutSecrets() throws Exception {
        String created = authorized(post("/api/v1/evaluations/provider-registrations")
            .contentType(MediaType.APPLICATION_JSON).content(DEEPSEEK))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.name").value("deepseek"))
            .andExpect(jsonPath("$.enabled").value(true)).andReturn().getResponse().getContentAsString();
        String listed = authorized(get("/api/v1/evaluations/provider-registrations"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.keys[0].name").value("deepseek"))
            .andExpect(jsonPath("$.keys[0].hosts[0]").value("api.deepseek.com"))
            .andExpect(jsonPath("$.registrations[0].baseUrl").value("https://api.deepseek.com/v1"))
            .andReturn().getResponse().getContentAsString();

        assertThat(created + listed).doesNotContain("sk-secret");
    }

    @Test
    @DisplayName("키 호스트 밖 주소는 400과 거부 코드만 돌려준다")
    void rejectsHostOutsideKeyWithCode() throws Exception {
        String body = authorized(post("/api/v1/evaluations/provider-registrations")
            .contentType(MediaType.APPLICATION_JSON)
            .content(DEEPSEEK.replace("https://api.deepseek.com/v1", "https://evil.example.com/v1")))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("HOST_NOT_ALLOWED_FOR_KEY"))
            .andReturn().getResponse().getContentAsString();

        assertThat(body).doesNotContain("sk-secret");
    }

    @Test
    @DisplayName("비활성화하면 enabled=false이고 변경 기록에 남는다. 없는 공급자는 404다")
    void disablesAndRecordsChanges() throws Exception {
        authorized(post("/api/v1/evaluations/provider-registrations").contentType(MediaType.APPLICATION_JSON)
            .content(DEEPSEEK).header("X-Evaluation-Requester", "han"));

        authorized(post("/api/v1/evaluations/provider-registrations/deepseek/disable")
            .header("X-Evaluation-Requester", "han"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.enabled").value(false));
        authorized(get("/api/v1/evaluations/provider-registrations/deepseek/changes"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].action").value("CREATED")).andExpect(jsonPath("$[0].by").value("han"))
            .andExpect(jsonPath("$[1].action").value("DISABLED"));
        authorized(post("/api/v1/evaluations/provider-registrations/missing/disable"))
            .andExpect(status().isNotFound());
    }
}
