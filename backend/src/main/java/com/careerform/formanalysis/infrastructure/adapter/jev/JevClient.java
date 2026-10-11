package com.careerform.formanalysis.infrastructure.adapter.jev;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;
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
import com.careerform.monitoring.ExternalCallMetrics;
import com.careerform.monitoring.tracing.LangSmithTraceRecorder;

@Component
@Conditional(InteractionProviderConditions.JevClient.class)
public final class JevClient {
    public static final String ABSTAIN = "ABSTAIN";
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
        @Value("${career-form.tracing.langsmith.enabled:false}") boolean tracingEnabled
    ) {
        this(apiKey, model, timeoutMs, minConfidence, dataPolicyReviewed,
            metrics.getIfAvailable(), traces.getIfAvailable(), tracingEnabled);
    }

    JevClient(
        String apiKey, String model, int timeoutMs, double minConfidence, boolean dataPolicyReviewed,
        ExternalCallMetrics metrics, LangSmithTraceRecorder traces, boolean tracingEnabled
    ) {
        if (apiKey.isBlank() || model.isBlank() || timeoutMs < 1 || timeoutMs > 8000 ||
            !Double.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 1)
            throw new IllegalStateException("Invalid Jev configuration");
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
