package com.careerform.monitoring.tracing;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.Semaphore;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import com.langchain.smith.client.LangsmithClient;
import com.langchain.smith.client.LangsmithClientImpl;
import com.langchain.smith.client.okhttp.OkHttpClient;
import com.langchain.smith.core.ClientOptions;
import com.langchain.smith.core.JsonValue;
import com.langchain.smith.core.http.HttpClient;
import com.langchain.smith.models.runs.RunIngest;

/**
 * Best-effort completed-run transport. Callers must project provider data before admission;
 * this class never accepts raw requests, responses or Throwable objects.
 */
@Component
public final class LangSmithTraceRecorder implements AutoCloseable {
    private static final Logger log = LoggerFactory.getLogger(LangSmithTraceRecorder.class);
    private static final int MAX_BYTES = 128 * 1024;
    private static final int MAX_NODES = 8192;
    private static final DateTimeFormatter ORDER_TIME =
        DateTimeFormatter.ofPattern("uuuuMMdd'T'HHmmssSSSSSS'Z'").withZone(ZoneOffset.UTC);
    private final LangsmithClient client;
    private final HttpClient transport;
    private final ThreadPoolExecutor worker;
    private final Semaphore capacity;
    private final String project;
    private final Map<String, Trace> active = new ConcurrentHashMap<>();
    private final AtomicBoolean closed = new AtomicBoolean();

    public LangSmithTraceRecorder(
        @Value("${career-form.tracing.langsmith.enabled:false}") boolean enabled,
        @Value("${career-form.tracing.langsmith.api-key:}") String apiKey,
        @Value("${career-form.tracing.langsmith.endpoint:https://api.smith.langchain.com}") String endpoint,
        @Value("${career-form.tracing.langsmith.project:career-form}") String project,
        @Value("${career-form.tracing.langsmith.timeout-ms:1000}") int timeoutMs,
        @Value("${career-form.tracing.langsmith.capacity:64}") int maxInFlight
    ) {
        this.project = project;
        this.capacity = new Semaphore(Math.max(1, maxInFlight));
        LangsmithClient configured = null;
        HttpClient configuredTransport = null;
        if (enabled && !apiKey.isBlank() && !project.isBlank()) {
            try {
                Duration timeout = Duration.ofMillis(Math.clamp(timeoutMs, 1, 2000));
                configuredTransport = OkHttpClient.builder().timeout(timeout).build();
                configured = new LangsmithClientImpl(ClientOptions.builder()
                    .httpClient(configuredTransport).apiKey(apiKey).baseUrl(endpoint)
                    .autoBatchTracing(false).maxRetries(0).timeout(timeout).build());
            } catch (RuntimeException exception) {
                if (configuredTransport != null) configuredTransport.close();
                configuredTransport = null;
                log.warn("LANGSMITH_DISABLED reason=configuration");
            }
        }
        client = configured;
        transport = configuredTransport;
        worker = client == null ? null : new ThreadPoolExecutor(
            1, 1, 0, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(Math.max(1, maxInFlight)),
            runnable -> {
                Thread thread = new Thread(runnable, "langsmith-trace");
                thread.setDaemon(true);
                return thread;
            }, new ThreadPoolExecutor.AbortPolicy());
    }

    public Trace begin(String provider, String stage, String requestedModel, Map<String, Object> inputs) {
        if (client == null || closed.get() || !capacity.tryAcquire()) {
            return null;
        }
        try {
            String requestId = MDC.get("requestId");
            if (requestId != null && !requestId.matches(
                "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")) {
                requestId = null;
            }
            Trace trace = new Trace(UUID.randomUUID().toString(), provider, stage, requestedModel,
                requestId, Instant.now(), System.nanoTime(), snapshot(inputs));
            active.put(trace.id(), trace);
            if (closed.get()) {
                active.remove(trace.id());
                capacity.release();
                return null;
            }
            return trace;
        } catch (RuntimeException exception) {
            capacity.release();
            log.warn("LANGSMITH_DROPPED reason=input_budget");
            return null;
        }
    }

    public void complete(Trace trace, Map<String, Object> outputs, Map<String, Number> usage,
                         String failure, Integer httpStatus) {
        if (trace == null || !active.remove(trace.id(), trace)) {
            return;
        }
        try {
            var safeOutputs = snapshot(outputs);
            var metadata = new LinkedHashMap<String, Object>();
            metadata.put("provider", trace.provider());
            metadata.put("stage", trace.stage());
            metadata.put("ls_provider", trace.provider());
            metadata.put("ls_model_name", trace.model());
            metadata.put("duration_ms", TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - trace.startedNanos()));
            if (trace.requestId() != null) metadata.put("request_id", trace.requestId());
            if (httpStatus != null) metadata.put("http_status", httpStatus);
            var inputBuilder = RunIngest.Inputs.builder();
            trace.inputs().forEach((key, value) -> inputBuilder.putAdditionalProperty(key, JsonValue.from(value)));
            var outputBuilder = RunIngest.Outputs.builder();
            safeOutputs.forEach((key, value) -> outputBuilder.putAdditionalProperty(key, JsonValue.from(value)));
            if (!usage.isEmpty()) outputBuilder.putAdditionalProperty("usage_metadata", JsonValue.from(Map.copyOf(usage)));
            var builder = RunIngest.builder()
                .id(trace.id()).traceId(trace.id())
                .dottedOrder(ORDER_TIME.format(trace.startedAt()) + trace.id())
                .name(trace.provider() + "." + trace.stage())
                .runType(RunIngest.RunType.of("llm"))
                .sessionName(project)
                .startTime(trace.startedAt().toString()).endTime(Instant.now().toString())
                .inputs(inputBuilder.build()).outputs(outputBuilder.build())
                .extra(RunIngest.Extra.builder()
                    .putAdditionalProperty("metadata", JsonValue.from(metadata)).build());
            if (failure != null) builder.error(failure);
            RunIngest run = builder.build();
            worker.execute(() -> {
                try {
                    client.runs().create(run);
                } catch (RuntimeException exception) {
                    // SDK errors can contain response bodies or credentials; only finite diagnostics leave here.
                    Integer status = exception instanceof com.langchain.smith.errors.LangChainServiceException service
                        ? service.statusCode() : null;
                    log.warn("LANGSMITH_DROPPED reason=transport type={} status={}",
                        exception.getClass().getSimpleName(), status);
                } finally {
                    capacity.release();
                }
            });
        } catch (RejectedExecutionException exception) {
            capacity.release();
            log.warn("LANGSMITH_DROPPED reason=closed_or_full");
        } catch (RuntimeException exception) {
            capacity.release();
            log.warn("LANGSMITH_DROPPED reason=output_budget");
        }
    }

    private static Map<String, Object> snapshot(Map<String, Object> source) {
        var budget = new int[]{MAX_NODES, MAX_BYTES};
        var copy = new LinkedHashMap<String, Object>();
        source.forEach((key, value) -> {
            freeze(key, budget, 0);
            copy.put(key, freeze(value, budget, 0));
        });
        return Collections.unmodifiableMap(copy);
    }

    private static Object freeze(Object value, int[] budget, int depth) {
        if (--budget[0] < 0 || depth > 32) throw new IllegalArgumentException("Trace budget");
        if (value == null || value instanceof Boolean || value instanceof Number) return value;
        if (value instanceof String string) {
            budget[1] -= string.length() * 3;
            if (budget[1] < 0) throw new IllegalArgumentException("Trace budget");
            return string;
        }
        if (value instanceof Map<?, ?> map) {
            var copy = new LinkedHashMap<String, Object>();
            for (var entry : map.entrySet()) {
                if (!(entry.getKey() instanceof String key)) throw new IllegalArgumentException("Trace key");
                freeze(key, budget, depth + 1);
                copy.put(key, freeze(entry.getValue(), budget, depth + 1));
            }
            return Collections.unmodifiableMap(copy);
        }
        if (value instanceof List<?> list) {
            var copy = new ArrayList<>();
            for (Object item : list) copy.add(freeze(item, budget, depth + 1));
            return Collections.unmodifiableList(copy);
        }
        throw new IllegalArgumentException("Trace value");
    }

    @PreDestroy
    @Override
    public void close() {
        if (!closed.compareAndSet(false, true) || client == null) return;
        active.clear();
        worker.shutdownNow();
        // beta.23 client.close() initializes its unused batch queue and fetches /info.
        // We own the SDK transport and never batch, so close its resources directly.
        transport.close();
        try {
            worker.awaitTermination(2, TimeUnit.SECONDS);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
        }
    }

    public record Trace(String id, String provider, String stage, String model, String requestId,
                        Instant startedAt, long startedNanos, Map<String, Object> inputs) {
    }
}
