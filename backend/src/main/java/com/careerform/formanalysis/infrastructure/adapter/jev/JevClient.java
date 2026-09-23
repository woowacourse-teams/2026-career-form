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
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Conditional;
import org.springframework.stereotype.Component;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.core.json.JsonFactory;
import tools.jackson.databind.MapperFeature;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.careerform.formanalysis.infrastructure.SelectedJev;
import com.careerform.formanalysis.exception.ResolverException;

@Component
@Conditional(SelectedJev.class)
public final class JevClient {
    public static final String ABSTAIN = "ABSTAIN";
    private final HttpClient http;
    private final JsonMapper mapper;
    private final String apiKey;
    private final String model;
    private final int timeoutMs;
    private final double minConfidence;
    private final boolean dataPolicyReviewed;

    public JevClient(
        @Value("${career-form.analysis.jev.api-key:}") String apiKey,
        @Value("${career-form.analysis.jev.model:jev-latest}") String model,
        @Value("${career-form.analysis.jev.timeout-ms:8000}") int timeoutMs,
        @Value("${career-form.analysis.jev.min-confidence:0.8}") double minConfidence,
        @Value("${career-form.analysis.jev.data-policy-reviewed:false}") boolean dataPolicyReviewed
    ) {
        if (apiKey.isBlank() || model.isBlank() || timeoutMs < 1 || timeoutMs > 8000 ||
            !Double.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 1)
            throw new IllegalStateException("Invalid Jev configuration");
        this.apiKey = apiKey;
        this.model = model;
        this.timeoutMs = timeoutMs;
        this.minConfidence = minConfidence;
        this.dataPolicyReviewed = dataPolicyReviewed;
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
        try {
            String json = mapper.writeValueAsString(new Request(state, model, questions));
            if (json.getBytes(StandardCharsets.UTF_8).length > 2_000_000) throw unavailable();
            HttpRequest request = HttpRequest.newBuilder(URI.create("https://api.typesafe.ai/v1/systemone"))
                .timeout(Duration.ofMillis(timeoutMs))
                .header("Authorization", "Bearer " + apiKey).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json, StandardCharsets.UTF_8)).build();
            var pending = http.sendAsync(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            HttpResponse<String> response;
            try {
                response = pending.copy().orTimeout(timeoutMs, TimeUnit.MILLISECONDS).join();
            } finally {
                if (!pending.isDone()) pending.cancel(true);
            }
            if (response.statusCode() != 200 || response.body().length() > 2_000_000) throw unavailable();
            Response output = mapper.readValue(response.body(), Response.class);
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
            }
            return Map.copyOf(selected);
        } catch (RuntimeException exception) {
            // Never include response bodies, transport messages or credentials in diagnostics.
            throw unavailable();
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
