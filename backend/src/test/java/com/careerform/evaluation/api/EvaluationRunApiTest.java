package com.careerform.evaluation.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
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
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import com.careerform.evaluation.EvaluationTestData;
import com.careerform.evaluation.dataset.DatasetLoader;
import com.careerform.evaluation.prompt.PromptCatalog;
import com.careerform.evaluation.run.CallExecutor;
import com.careerform.evaluation.run.EvaluationSettings;
import com.careerform.evaluation.run.EvaluationWorker;
import com.careerform.evaluation.run.InMemoryResultStore;
import com.careerform.evaluation.run.InMemoryRunStore;
import com.careerform.evaluation.run.InMemoryScoringStore;
import com.careerform.evaluation.run.RescoringService;
import com.careerform.evaluation.run.RunService;
import com.careerform.quality.QualityAccess;
import com.careerform.quality.QualityApiFilter;
import tools.jackson.databind.json.JsonMapper;

@DisplayName("평가 실행 API와 품질 비밀번호 경계")
class EvaluationRunApiTest {

    private static final Instant NOW = Instant.parse("2026-10-30T03:00:00Z");
    private static final String HASH = "pbkdf2-sha256$600000$cXVhbGl0eS10ZXN0LXNhbHQ=$/lpJNQ22MGBxyHPYyp6YAZCUPj5Wxy6qAUnA421bHCk=";
    private static final String PASSWORD = "Basic " + Base64.getEncoder()
        .encodeToString("quality:synthetic-only".getBytes(StandardCharsets.UTF_8));
    private static final String REQUEST = """
        {"datasetId": "synthetic", "datasetVersion": 1, "split": "tuning", "repetitions": 1,
         "promptVersion": "v1", "overrides": {}}""";

    private final Map<String, QualityAccess.Session> sessions = new HashMap<>();
    private final QualityAccess access = new QualityAccess(Clock.fixed(NOW, ZoneOffset.UTC), HASH, "",
        new QualityAccess.SessionStore() {
            public Optional<QualityAccess.Session> find(String id) { return Optional.ofNullable(sessions.get(id)); }
            public void save(QualityAccess.Session session) { sessions.put(session.id(), session); }
            public void delete(String id) { sessions.remove(id); }
        });
    private final InMemoryRunStore runs = new InMemoryRunStore();
    private final InMemoryResultStore results = new InMemoryResultStore();
    private final DatasetLoader datasets = EvaluationTestData.syntheticLoader();
    private final Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);
    private final RunService service = new RunService(runs, datasets, new PromptCatalog(),
        List.of(EvaluationTestData.PROMPT), new EvaluationSettings(100, 20, "jev", "jev-latest", "test",
            Map.of("field-batch-size", 5)), clock);
    private final EvaluationWorker worker = new EvaluationWorker(runs, results, datasets,
        new CallExecutor((kind, request, settings) -> EvaluationTestData.correctResponse(kind)), new PromptCatalog(),
        List.of(EvaluationTestData.PROMPT), 100, clock, "worker", Duration.ofMinutes(5));
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new EvaluationRunController(service, runs, results,
            new RescoringService(runs, results, new InMemoryScoringStore(), datasets::load, clock)))
        .addFilters(new QualityApiFilter(access)).build();

    @Test
    @DisplayName("비밀번호가 없으면 실행 등록과 조회 모두 401이다")
    void requiresQualityPassword() throws Exception {
        mvc.perform(post("/api/v1/evaluations/runs").contentType(MediaType.APPLICATION_JSON).content(REQUEST))
            .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/evaluations/runs")).andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("등록하면 202와 실행 ID를 돌려주고, 진행 중 중복 등록은 409와 기존 실행 ID다")
    void registersAndRejectsDuplicate() throws Exception {
        String runId = runId(register().andExpect(status().isAccepted()).andExpect(jsonPath("$.status").value("QUEUED")));

        register().andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("RUN_ACTIVE"))
            .andExpect(jsonPath("$.activeRunId").value(runId))
            .andExpect(jsonPath("$.sameFingerprint").value(true));
        authorized(post("/api/v1/evaluations/runs").contentType(MediaType.APPLICATION_JSON)
                .content(REQUEST.replace("tuning", "holdout")))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("UNKNOWN_SPLIT"));
    }

    @Test
    @DisplayName("진행 조회는 실행 전 측정 불가, 실행 뒤 최종 정확도와 호출별 결과를 보여 준다")
    void reportsProgressAndFinalResults() throws Exception {
        String runId = runId(register());
        authorized(get("/api/v1/evaluations/runs/" + runId)).andExpect(status().isOk())
            .andExpect(jsonPath("$.run.status").value("QUEUED"))
            .andExpect(jsonPath("$.run.requestedBy").value("tester"))
            .andExpect(jsonPath("$.report.quality.accuracy").doesNotExist());

        worker.runOnce();

        authorized(get("/api/v1/evaluations/runs/" + runId)).andExpect(status().isOk())
            .andExpect(jsonPath("$.run.status").value("COMPLETED"))
            .andExpect(jsonPath("$.run.processedCalls").value(2))
            .andExpect(jsonPath("$.report.quality.accuracy").value(1.0))
            .andExpect(jsonPath("$.report.quality.mappingAccuracy").value(1.0));
        authorized(get("/api/v1/evaluations/runs/" + runId + "/results")).andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(2))
            .andExpect(jsonPath("$[0].kind").value("SECTION_CLASSIFY"));
        authorized(get("/api/v1/evaluations/runs")).andExpect(jsonPath("$[0].run.id").value(runId));
    }

    @Test
    @DisplayName("재채점은 호출할 때마다 새 기록을 추가하고 이전 기록을 남긴다")
    void rescoringKeepsHistory() throws Exception {
        String runId = runId(register());
        worker.runOnce();

        authorized(post("/api/v1/evaluations/runs/" + runId + "/scorings")).andExpect(status().isCreated())
            .andExpect(jsonPath("$.aggregate.accuracy").value(1.0));
        authorized(post("/api/v1/evaluations/runs/" + runId + "/scorings")).andExpect(status().isCreated());

        authorized(get("/api/v1/evaluations/runs/" + runId + "/scorings")).andExpect(jsonPath("$.length()").value(2));
    }

    @Test
    @DisplayName("대기 중 취소는 CANCELLED이고, 없는 실행과 없는 프롬프트는 404다")
    void cancelAndNotFound() throws Exception {
        String runId = runId(register());

        authorized(post("/api/v1/evaluations/runs/" + runId + "/cancel")).andExpect(status().isOk())
            .andExpect(jsonPath("$.run.status").value("CANCELLED"));
        authorized(get("/api/v1/evaluations/runs/missing")).andExpect(status().isNotFound());
        authorized(get("/api/v1/evaluations/prompts/missing")).andExpect(status().isNotFound());
        String digest = runs.find(runId).orElseThrow().versions().promptDigest();
        authorized(get("/api/v1/evaluations/prompts/" + digest)).andExpect(status().isOk())
            .andExpect(jsonPath("$.parts['p/instructions']").value("Map {questionId}."));
    }

    private ResultActions register() throws Exception {
        return authorized(post("/api/v1/evaluations/runs").contentType(MediaType.APPLICATION_JSON).content(REQUEST)
            .header("X-Evaluation-Requester", "tester"));
    }

    private ResultActions authorized(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request)
        throws Exception {
        return mvc.perform(request.header("Authorization", PASSWORD));
    }

    private static String runId(ResultActions result) throws Exception {
        return JsonMapper.builder().build().readTree(result.andReturn().getResponse().getContentAsString())
            .path("runId").asString();
    }
}
