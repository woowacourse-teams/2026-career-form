package com.careerform.evaluation.api;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import com.careerform.evaluation.dataset.DatasetInspection;
import com.careerform.evaluation.dataset.DatasetLoader;
import com.careerform.evaluation.dataset.DatasetRejected;
import com.careerform.evaluation.dataset.EvaluationCase;
import com.careerform.evaluation.prompt.PromptSnapshot;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import com.careerform.evaluation.run.CallResultRecord;
import com.careerform.evaluation.run.EvaluationRun;
import com.careerform.evaluation.run.RescoringService;
import com.careerform.evaluation.run.ResultStore;
import com.careerform.evaluation.run.RunReport;
import com.careerform.evaluation.run.RunReporter;
import com.careerform.evaluation.run.EvaluationProviders;
import com.careerform.evaluation.run.RunRejected;
import com.careerform.evaluation.run.RunRequest;
import com.careerform.evaluation.run.RunService;
import com.careerform.evaluation.run.RunStore;
import com.careerform.evaluation.run.Scoring;

/**
 * 평가 실행 API. 품질 확인 비밀번호로 보호한다(QualityApiFilter). 등록은 실행 ID만 돌려주고 별도 작업자가 실행한다.
 * 조회는 저장한 원자료에서 보고를 다시 계산하므로 진행 중이면 부분 결과가 나온다.
 */
@RestController
@ConditionalOnProtectedEvaluation
@RequestMapping("/api/v1/evaluations")
public final class EvaluationRunController {

    private static final Pattern REQUESTER = Pattern.compile("[0-9A-Za-z가-힣._-]{1,32}");
    private static final String DEFAULT_REQUESTER = "quality-admin";

    private final RunService runs;
    private final RunStore store;
    private final ResultStore results;
    private final RescoringService scorings;
    private final DatasetLoader datasets;
    private final DatasetLoader.ResourceSource resources;
    private final EvaluationProviders providers;
    private final RunReporter reporter = new RunReporter();
    private final JsonMapper json = JsonMapper.builder().build();

    public EvaluationRunController(RunService runs, RunStore store, ResultStore results, RescoringService scorings,
        DatasetLoader datasets, DatasetLoader.ResourceSource resources, EvaluationProviders providers) {
        this.runs = runs;
        this.store = store;
        this.results = results;
        this.scorings = scorings;
        this.datasets = datasets;
        this.resources = resources;
        this.providers = providers;
    }

    public record RunView(EvaluationRun run, RunReport report) {
    }

    /** 고를 수 있는 공급자. 첫 항목이 기본 공급자, {@code defaultModel}은 그 공급자의 기본 모델이다. */
    public record ProviderView(String provider, String defaultModel, List<String> models) {
    }

    @GetMapping("/providers")
    public List<ProviderView> providers() {
        return providers.all().stream()
            .map(provider -> new ProviderView(provider.name(), provider.defaultModel(), provider.models())).toList();
    }

    @PostMapping("/runs")
    public ResponseEntity<Map<String, Object>> register(@RequestBody RunRequest request,
        @RequestHeader(value = "X-Evaluation-Requester", required = false) String requester) {
        RunService.Registered registered = runs.registerAll(request, requester(requester));
        EvaluationRun first = registered.runs().getFirst();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("runId", first.id());
        body.put("status", first.status());
        if (registered.comparisonId() != null) {
            body.put("comparisonId", registered.comparisonId());
            body.put("runIds", registered.runs().stream().map(EvaluationRun::id).toList());
        }
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(body);
    }

    /** 비교에 속한 모델별 실행과 원자료에서 다시 계산한 보고. 등록 순서다. */
    @GetMapping("/comparisons/{comparisonId}")
    public ResponseEntity<List<RunView>> comparison(@PathVariable String comparisonId) {
        List<RunView> views = store.comparison(comparisonId).stream().map(this::view).toList();
        return views.isEmpty() ? ResponseEntity.notFound().build() : ResponseEntity.ok(views);
    }

    @GetMapping("/runs")
    public List<RunView> recent(@RequestParam(defaultValue = "20") int limit) {
        return store.recent(Math.min(Math.max(limit, 1), 100)).stream().map(this::view).toList();
    }

    @GetMapping("/runs/{runId}")
    public RunView find(@PathVariable String runId) {
        return view(runs.find(runId));
    }

    @GetMapping("/runs/{runId}/results")
    public List<CallResultRecord> results(@PathVariable String runId) {
        runs.find(runId);
        return results.list(runId);
    }

    @PostMapping("/runs/{runId}/cancel")
    public RunView cancel(@PathVariable String runId) {
        return view(runs.cancel(runId));
    }

    @PostMapping("/runs/{runId}/scorings")
    public ResponseEntity<Scoring> rescore(@PathVariable String runId,
        @RequestHeader(value = "X-Evaluation-Requester", required = false) String requester) {
        return ResponseEntity.status(HttpStatus.CREATED).body(scorings.rescore(runId, requester(requester)));
    }

    @GetMapping("/runs/{runId}/scorings")
    public List<Scoring> scorings(@PathVariable String runId) {
        runs.find(runId);
        return scorings.history(runId);
    }

    @GetMapping("/datasets/{datasetId}/v{version}")
    public ResponseEntity<DatasetView> dataset(@PathVariable String datasetId, @PathVariable int version) {
        DatasetInspection inspection;
        try {
            inspection = datasets.inspect(datasetId, version);
        }
        catch (DatasetRejected rejected) {
            return rejected.code() == DatasetRejected.Code.NOT_FOUND ? ResponseEntity.notFound().build()
                : ResponseEntity.unprocessableContent().build();
        }
        Map<String, JsonNode> profiles = new LinkedHashMap<>();
        inspection.dataset().cases().stream().map(EvaluationCase::profileId).distinct().forEach(profileId ->
            resources.read("evaluation/profiles/v1/" + profileId + ".json")
                .ifPresent(bytes -> profiles.put(profileId, json.readTree(bytes).path("profile"))));
        return ResponseEntity.ok(DatasetView.of(inspection, profiles));
    }

    /** 실행이 쓴 프롬프트 버전 하나. {@code names}는 그 버전으로 등록한 실행 이름(프롬프트 이름), 처음 쓴 순서다. */
    public record PromptHistoryEntry(String digest, String provider, java.time.Instant firstUsedAt, List<String> names,
        int runs) {
    }

    /** 프롬프트 버전 이력. 최근 실행 500건에서 지문마다 처음 쓴 순서로 모은다. 같은 지문이면 같은 프롬프트다. */
    @GetMapping("/prompts")
    public List<PromptHistoryEntry> promptHistory() {
        Map<String, List<EvaluationRun>> byDigest = new LinkedHashMap<>();
        store.recent(500).stream()
            .sorted(java.util.Comparator.comparing(EvaluationRun::requestedAt))
            .forEach(run -> byDigest.computeIfAbsent(run.versions().promptDigest(), key -> new java.util.ArrayList<>()).add(run));
        return byDigest.entrySet().stream().map(entry -> {
            List<EvaluationRun> runs = entry.getValue();
            EvaluationRun first = runs.getFirst();
            List<String> names = runs.stream().map(run -> run.versions().promptVersion())
                .filter(java.util.Objects::nonNull).distinct().toList();
            return new PromptHistoryEntry(entry.getKey(), first.versions().provider(), first.requestedAt(), names,
                runs.size());
        }).toList();
    }

    @GetMapping("/prompts/{digest}")
    public ResponseEntity<PromptSnapshot> prompt(@PathVariable String digest) {
        return store.findPromptSnapshot(digest).map(ResponseEntity::ok)
            .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @ExceptionHandler(RunRejected.class)
    ResponseEntity<Map<String, Object>> rejected(RunRejected rejected) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("code", rejected.code());
        HttpStatus status = switch (rejected.code()) {
            case UNKNOWN_RUN -> HttpStatus.NOT_FOUND;
            case RUN_ACTIVE -> HttpStatus.CONFLICT;
            default -> HttpStatus.BAD_REQUEST;
        };
        if (rejected.code() == RunRejected.Code.RUN_ACTIVE) {
            body.put("activeRunId", rejected.activeRunId());
            body.put("sameFingerprint", rejected.sameFingerprint());
        }
        return ResponseEntity.status(status).body(body);
    }

    private RunView view(EvaluationRun run) {
        return new RunView(run, reporter.report(run, results.list(run.id())));
    }

    private static String requester(String header) {
        return header != null && REQUESTER.matcher(header).matches() ? header : DEFAULT_REQUESTER;
    }
}
