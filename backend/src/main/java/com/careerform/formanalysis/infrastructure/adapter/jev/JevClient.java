package com.careerform.formanalysis.infrastructure.adapter.jev;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Conditional;
import org.springframework.stereotype.Component;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.core.json.JsonFactory;
import tools.jackson.databind.MapperFeature;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.careerform.formanalysis.infrastructure.InteractionProviderConditions;
import com.careerform.formanalysis.exception.ResolverException;
import com.careerform.formanalysis.exception.TokenLimitExceeded;
import com.careerform.monitoring.ExternalCallMetrics;
import com.careerform.monitoring.tracing.LangSmithTraceRecorder;

@Component
@Conditional(InteractionProviderConditions.JevClient.class)
public final class JevClient {
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.careerform.formanalysis.infrastructure.LocalLlmDiagnostics localDiagnostics;

    public static final String ABSTAIN = "ABSTAIN";
    private static final int DEFAULT_RATE_LIMIT_RETRIES = 2;
    private static final int MAX_RATE_LIMIT_RETRIES = 5;
    private static final Duration RATE_LIMIT_BACKOFF = Duration.ofMillis(500);
    private static final double ANSWER_PROBABILITY_SUM_TOLERANCE = 0.05;
    /** 0.95·1.05 같은 허용 경계가 이진 부동소수점 오차(약 4e-17)로 거부되지 않게 하는 여유다. */
    private static final double ANSWER_PROBABILITY_SUM_EPSILON = 1e-9;
    private static final Pattern ERROR_TYPE = Pattern.compile("\"error_type\"\\s*:\\s*\"([a-z_]{1,64})\"");
    private static final Logger log = LoggerFactory.getLogger(JevClient.class);
    private final HttpClient http;
    private final JsonMapper mapper;
    private final String apiKey;
    private final String model;
    private final int timeoutMs;
    private final double minConfidence;
    private final boolean dataPolicyReviewed;
    private final ExternalCallMetrics metrics;
    private final LangSmithTraceRecorder traces;
    private final boolean tracingEnabled;
    private final int rateLimitRetries;
    private final Sleeper sleeper;

    public JevClient(
        String apiKey, String model, int timeoutMs, double minConfidence, boolean dataPolicyReviewed
    ) {
        this(apiKey, model, timeoutMs, minConfidence, dataPolicyReviewed, (ExternalCallMetrics) null, null, false);
    }

    public JevClient(
        @Value("${career-form.analysis.jev.api-key:}") String apiKey,
        @Value("${career-form.analysis.jev.model:jev-latest}") String model,
        @Value("${career-form.analysis.jev.timeout-ms:8000}") int timeoutMs,
        @Value("${career-form.analysis.jev.min-confidence:0.8}") double minConfidence,
        @Value("${career-form.analysis.jev.data-policy-reviewed:false}") boolean dataPolicyReviewed,
        ObjectProvider<ExternalCallMetrics> metrics
    ) {
        this(apiKey, model, timeoutMs, minConfidence, dataPolicyReviewed, metrics.getIfAvailable(), null, false);
    }

    @Autowired
    public JevClient(
        @Value("${career-form.analysis.jev.api-key:}") String apiKey,
        @Value("${career-form.analysis.jev.model:jev-latest}") String model,
        @Value("${career-form.analysis.jev.timeout-ms:8000}") int timeoutMs,
        @Value("${career-form.analysis.jev.min-confidence:0.8}") double minConfidence,
        @Value("${career-form.analysis.jev.data-policy-reviewed:false}") boolean dataPolicyReviewed,
        ObjectProvider<ExternalCallMetrics> metrics,
        ObjectProvider<LangSmithTraceRecorder> traces,
        @Value("${career-form.tracing.langsmith.enabled:false}") boolean tracingEnabled,
        @Value("${career-form.analysis.jev.rate-limit-retries:2}") int rateLimitRetries
    ) {
        this(apiKey, model, timeoutMs, minConfidence, dataPolicyReviewed,
            metrics.getIfAvailable(), traces.getIfAvailable(), tracingEnabled, rateLimitRetries);
    }

    JevClient(
        String apiKey, String model, int timeoutMs, double minConfidence, boolean dataPolicyReviewed,
        ExternalCallMetrics metrics, LangSmithTraceRecorder traces, boolean tracingEnabled
    ) {
        this(apiKey, model, timeoutMs, minConfidence, dataPolicyReviewed, metrics, traces, tracingEnabled,
            DEFAULT_RATE_LIMIT_RETRIES);
    }

    JevClient(
        String apiKey, String model, int timeoutMs, double minConfidence, boolean dataPolicyReviewed,
        ExternalCallMetrics metrics, LangSmithTraceRecorder traces, boolean tracingEnabled, int rateLimitRetries
    ) {
        if (apiKey.isBlank() || model.isBlank() || timeoutMs < 1 || timeoutMs > 8000 ||
            !Double.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 1 ||
            rateLimitRetries < 0 || rateLimitRetries > MAX_RATE_LIMIT_RETRIES)
            throw new IllegalStateException("Invalid Jev configuration");
        this.rateLimitRetries = rateLimitRetries;
        this.sleeper = Thread::sleep;
        this.apiKey = apiKey;
        this.model = model;
        this.timeoutMs = timeoutMs;
        this.minConfidence = minConfidence;
        this.dataPolicyReviewed = dataPolicyReviewed;
        this.metrics = metrics;
        this.traces = traces;
        this.tracingEnabled = tracingEnabled;
        this.http = HttpClient.newBuilder().connectTimeout(Duration.ofMillis(Math.min(timeoutMs, 4000)))
            .followRedirects(HttpClient.Redirect.NEVER).build();
        this.mapper = JsonMapper.builder(JsonFactory.builder()
                .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION).build())
            .disable(MapperFeature.ALLOW_COERCION_OF_SCALARS)
            .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES,
                DeserializationFeature.FAIL_ON_TRAILING_TOKENS).build();
    }

    public Map<String, String> choose(Object state, Map<String, Choice> questions) {
        if (questions.isEmpty()) return Map.of();
        if (!dataPolicyReviewed || questions.size() > 128 ||
            questions.values().stream().anyMatch(q -> q.criteria().size() > 255 || !q.criteria().containsKey(ABSTAIN)))
            throw unavailable();
        long startedAt = System.nanoTime();
        JevTraceProjection projection = null;
        LangSmithTraceRecorder.Trace trace = null;
        if (tracingEnabled && traces != null) {
            try {
                projection = JevTraceProjection.create(state, questions);
                trace = traces.begin("jev", projection.stage(), traceModel(), projection.inputs());
            } catch (RuntimeException exception) {
                log.warn("JEV_TRACE_DROPPED reason=input_projection");
            }
        }
        Integer httpStatus = null;
        var called = false;
        String observedModel = null;
        try {
            String json = mapper.writeValueAsString(new Request(state, model, questions));
            if (json.getBytes(StandardCharsets.UTF_8).length > 2_000_000) throw unavailable();
            HttpRequest request = HttpRequest.newBuilder(URI.create("https://api.typesafe.ai/v1/systemone"))
                .timeout(Duration.ofMillis(timeoutMs))
                .header("Authorization", "Bearer " + apiKey).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json, StandardCharsets.UTF_8)).build();
            if (localDiagnostics != null) localDiagnostics.start("jev", state.getClass().getSimpleName());
            called = true;
            var pending = http.sendAsync(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            HttpResponse<String> response;
            try {
                response = pending.copy().orTimeout(timeoutMs, TimeUnit.MILLISECONDS).join();
            } finally {
                if (!pending.isDone()) pending.cancel(true);
            }
            httpStatus = response.statusCode();
            if (response.statusCode() != 200 || response.body().length() > 2_000_000) throw unavailable();
            Response output = mapper.readValue(response.body(), Response.class);
            observedModel = output.model();
            if (output.model() == null || output.model().isBlank() || output.answers() == null ||
                !output.answers().keySet().equals(questions.keySet()) || output.usage() == null ||
                output.usage().inputTokens() == null || output.usage().outputTokens() == null ||
                output.usage().inputTokens() < 0 || output.usage().outputTokens() < 0) throw unavailable();
            Map<String, String> selected = new LinkedHashMap<>();
            for (var entry : questions.entrySet()) {
                Answer answer = output.answers().get(entry.getKey());
                if (answer == null || !"choice".equals(answer.type()) || answer.choice() == null ||
                    !entry.getValue().criteria().containsKey(answer.choice()) || answer.probabilities() == null ||
                    !answer.probabilities().keySet().equals(entry.getValue().criteria().keySet()) ||
                    answer.confidence() == null || !validProbability(answer.confidence()) ||
                    answer.probabilities().values().stream().anyMatch(p -> p == null || !validProbability(p)))
                    throw unavailable();
                double sum = answer.probabilities().values().stream().mapToDouble(Double::doubleValue).sum();
                if (Math.abs(sum - 1) > 0.01) throw unavailable();
                double probability = answer.probabilities().get(answer.choice());
                boolean uniqueWinner = answer.probabilities().entrySet().stream()
                    .filter(option -> !option.getKey().equals(answer.choice()))
                    .allMatch(option -> option.getValue() < probability);
                selected.put(entry.getKey(), uniqueWinner && answer.confidence() >= minConfidence
                    ? answer.choice() : ABSTAIN);
                log.info("[JEV] 분류 결과 question={} choice={} confidence={} selected={} probabilities={}", entry.getKey(),
                    answer.choice(), answer.confidence(), selected.get(entry.getKey()), answer.probabilities());
            }
            completeTrace(trace, projection, output, selected, httpStatus, null);
            recordMetrics(startedAt, null, called, observedModel);
            return Map.copyOf(selected);
        } catch (RuntimeException exception) {
            completeTrace(trace, projection, null, Map.of(), httpStatus, exception);
            recordMetrics(startedAt, exception, called, observedModel);
            throw unavailable();
        }
    }

    /**
     * 범용 분석 전용 호출. 공급자의 choice·confidence·probabilities를 min-confidence 컷 없이 그대로 반환한다.
     * 확률 합 허용 오차 0.05, 429 지수 백오프 재시도, 토큰 한도 예외는 이 경로에만 적용한다.
     */
    public Map<String, Judgement> answer(Object state, Map<String, Choice> questions) {
        if (questions.isEmpty()) return Map.of();
        if (!dataPolicyReviewed || questions.size() > 128 ||
            questions.values().stream().anyMatch(q -> q.criteria().size() > 255 || !q.criteria().containsKey(ABSTAIN)))
            throw unavailable();
        long startedAt = System.nanoTime();
        var called = false;
        String observedModel = null;
        try {
            String json = mapper.writeValueAsString(new Request(state, model, questions));
            if (json.getBytes(StandardCharsets.UTF_8).length > 2_000_000) throw unavailable();
            HttpRequest request = HttpRequest.newBuilder(URI.create("https://api.typesafe.ai/v1/systemone"))
                .timeout(Duration.ofMillis(timeoutMs))
                .header("Authorization", "Bearer " + apiKey).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json, StandardCharsets.UTF_8)).build();
            if (localDiagnostics != null) localDiagnostics.start("jev", state.getClass().getSimpleName());
            called = true;
            HttpResponse<String> response = sendWithRateLimitRetries(request);
            if (response.body().length() > 2_000_000) throw unavailable();
            Response output = mapper.readValue(response.body(), Response.class);
            observedModel = output.model();
            if (output.model() == null || output.model().isBlank() || output.answers() == null ||
                !output.answers().keySet().equals(questions.keySet()) || output.usage() == null ||
                output.usage().inputTokens() == null || output.usage().outputTokens() == null ||
                output.usage().inputTokens() < 0 || output.usage().outputTokens() < 0) throw invalid("ENVELOPE");
            Map<String, Judgement> judgements = new LinkedHashMap<>();
            for (var entry : questions.entrySet()) {
                Answer answer = output.answers().get(entry.getKey());
                if (answer == null || !"choice".equals(answer.type()) || answer.choice() == null ||
                    !entry.getValue().criteria().containsKey(answer.choice()) || answer.probabilities() == null ||
                    !answer.probabilities().keySet().equals(entry.getValue().criteria().keySet()) ||
                    answer.confidence() == null || !validProbability(answer.confidence()) ||
                    answer.probabilities().values().stream().anyMatch(p -> p == null || !validProbability(p)))
                    throw invalid("ANSWER");
                double sum = answer.probabilities().values().stream().mapToDouble(Double::doubleValue).sum();
                if (Math.abs(sum - 1) > ANSWER_PROBABILITY_SUM_TOLERANCE + ANSWER_PROBABILITY_SUM_EPSILON)
                    throw invalid(String.format(Locale.ROOT, "PROBABILITY_SUM sum=%.4f options=%d",
                        sum, answer.probabilities().size()));
                judgements.put(entry.getKey(),
                    new Judgement(answer.choice(), answer.confidence(), answer.probabilities()));
            }
            recordMetrics(startedAt, null, called, observedModel);
            return Map.copyOf(judgements);
        } catch (RuntimeException exception) {
            recordMetrics(startedAt, exception, called, observedModel);
            if (exception instanceof TokenLimitExceeded tokenLimit) throw tokenLimit;
            throw unavailable();
        }
    }

    private HttpResponse<String> sendWithRateLimitRetries(HttpRequest request) {
        for (int attempt = 0; ; attempt++) {
            var pending = http.sendAsync(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            HttpResponse<String> response;
            try {
                response = pending.copy().orTimeout(timeoutMs, TimeUnit.MILLISECONDS).join();
            } finally {
                if (!pending.isDone()) pending.cancel(true);
            }
            if (response.statusCode() == 200) return response;
            String errorType = errorType(response.body());
            log.warn("JEV_UNAVAILABLE status={} errorType={} attempt={}", response.statusCode(), errorType, attempt + 1);
            if (response.statusCode() == 400 && "max_tokens_exceeded".equals(errorType)) throw new TokenLimitExceeded();
            if (response.statusCode() != 429 || attempt >= rateLimitRetries) throw unavailable();
            try {
                sleeper.sleep(RATE_LIMIT_BACKOFF.multipliedBy(1L << attempt));
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw unavailable();
            }
        }
    }

    /** 응답 본문은 기록하지 않고 닫힌 문자 집합의 error_type만 진단에 사용한다. */
    private static String errorType(String body) {
        if (body == null) return "NONE";
        Matcher matcher = ERROR_TYPE.matcher(body.length() > 4096 ? body.substring(0, 4096) : body);
        return matcher.find() ? matcher.group(1) : "UNRECOGNIZED";
    }

    private static ResolverException invalid(String reason) {
        log.warn("JEV_INVALID_RESPONSE reason={}", reason);
        return unavailable();
    }

    private String traceModel() {
        return model;
    }

    private void completeTrace(LangSmithTraceRecorder.Trace trace, JevTraceProjection projection,
                               Response output, Map<String, String> selected, Integer httpStatus,
                               RuntimeException failure) {
        if (trace == null) return;
        try {
            if (output == null) {
                String diagnostic = ExternalCallMetrics.isTimeout(failure) ? "TIMEOUT"
                    : httpStatus == null ? "CONNECTION_NETWORK"
                    : httpStatus != 200 ? "HTTP_ERROR" : "INVALID_RESPONSE_DATA";
                traces.complete(trace, Map.of("outcome", "UNAVAILABLE"), Map.of(), diagnostic, httpStatus);
                return;
            }
            var answers = new java.util.ArrayList<Map<String, Object>>();
            output.answers().forEach((id, answer) -> answers.add(projection.answer(id, answer.choice(),
                answer.confidence(), answer.probabilities(), selected.get(id),
                projection.conflicts(id, selected.get(id)), minConfidence)));
            traces.complete(trace, Map.of("answers", java.util.List.copyOf(answers),
                    "model", model.equals(output.model()) ? traceModel() : "UNRECOGNIZED_MODEL"),
                Map.of("input_tokens", output.usage().inputTokens(), "output_tokens", output.usage().outputTokens()),
                null, httpStatus);
        } catch (RuntimeException exception) {
            traces.complete(trace, Map.of("projection", "OUTPUT_UNAVAILABLE"), Map.of(), null, httpStatus);
            log.warn("JEV_TRACE_DROPPED reason=output_projection");
        }
    }

    private void recordMetrics(long startedAt, RuntimeException failure, boolean called, String observedModel) {
        if (localDiagnostics != null) localDiagnostics.end("jev", called, startedAt, failure);
        if (metrics != null) {
            metrics.record("jev", "analysis", System.nanoTime() - startedAt,
                failure != null, ExternalCallMetrics.isTimeout(failure),
                new com.careerform.monitoring.ExternalCallObserver.Context(called, ExternalCallMetrics.modelVersion(observedModel)));
        }
    }

    private static boolean validProbability(double value) {
        return Double.isFinite(value) && value >= 0 && value <= 1;
    }
    private static ResolverException unavailable() {
        return new ResolverException("Jev 분석 응답을 사용할 수 없습니다");
    }
    public record Judgement(String choice, double confidence, Map<String, Double> probabilities) {
        public Judgement {
            probabilities = Map.copyOf(probabilities);
        }
    }
    @FunctionalInterface
    interface Sleeper {
        void sleep(Duration delay) throws InterruptedException;
    }
    public record Choice(String type, String instructions, Map<String, String> criteria) {
        public Choice(String instructions, Map<String, String> criteria) {
            this("choice", instructions, Map.copyOf(criteria));
        }
    }
    private record Request(Object state, String model, Map<String, Choice> questions) {}
    private record Response(String model, Map<String, Answer> answers, Usage usage) {}
    private record Answer(String type, String choice, Double confidence, Map<String, Double> probabilities) {}
    private record Usage(@JsonProperty("input_tokens") Long inputTokens, @JsonProperty("output_tokens") Long outputTokens) {}
}
