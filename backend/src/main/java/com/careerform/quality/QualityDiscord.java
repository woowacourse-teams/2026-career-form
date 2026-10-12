package com.careerform.quality;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;

import tools.jackson.databind.json.JsonMapper;

public final class QualityDiscord {
    public enum Status { READY, SENDING, SENT, REJECTED, UNKNOWN, NOT_CONFIGURED }
    public record Result(Status status, String messageId) {
        public Result {
            if (status == Status.SENT && (messageId == null || !messageId.matches("[0-9]{1,30}"))) {
                throw new IllegalArgumentException("Missing Discord message identity");
            }
        }
    }
    @FunctionalInterface public interface Sender { Result send(String message); }
    record Response(int status, String body) { }
    @FunctionalInterface interface Transport { Response send(String body) throws Exception; }
    @FunctionalInterface interface Pause { void waitFor(long milliseconds) throws InterruptedException; }
    private final Transport transport;
    private final Pause pause;
    private final JsonMapper mapper = JsonMapper.builder().build();

    public QualityDiscord(String webhook) {
        var uri = configuredUri(webhook);
        if (!"https".equals(uri.getScheme()) || !"discord.com".equals(uri.getHost()) || uri.getPort() != -1
            || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null
            || !uri.getPath().matches("/api/webhooks/[0-9]+/[A-Za-z0-9_-]+")) { throw new IllegalArgumentException("Invalid dedicated Discord configuration"); }
        var endpoint = URI.create(uri.toASCIIString() + "?wait=true");
        var client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build();
        this.transport = body -> {
            var request = HttpRequest.newBuilder(endpoint).timeout(Duration.ofSeconds(10)).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body)).build();
            var response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
            try (var input = response.body()) {
                var bytes = input.readNBytes(4097);
                return new Response(response.statusCode(), bytes.length > 4096 ? "" : new String(bytes, java.nio.charset.StandardCharsets.UTF_8));
            }
        };
        this.pause = Thread::sleep;
    }

    QualityDiscord(Transport transport, Pause pause) { this.transport = transport; this.pause = pause; }

    private static URI configuredUri(String webhook) {
        try {
            return URI.create(webhook);
        } catch (RuntimeException exception) {
            throw new IllegalArgumentException("Invalid dedicated Discord configuration");
        }
    }

    public Result send(String message) {
        if (message.length() > 4096) { return new Result(Status.REJECTED, null); }
        var mentions = Map.of("parse", java.util.List.of());
        var body = mapper.writeValueAsString(message.length() <= 2000
            ? Map.of("content", message, "allowed_mentions", mentions)
            : Map.of("embeds", java.util.List.of(Map.of("description", message)), "allowed_mentions", mentions));
        try {
            for (var attempt = 0; attempt <= 3; attempt++) {
                var response = transport.send(body);
                if (response.status() == 429) {
                    var retry = mapper.readTree(response.body()).path("retry_after").asDouble(-1);
                    if (attempt == 3 || retry < 0 || retry > 10) { return new Result(Status.REJECTED, null); }
                    pause.waitFor((long) Math.ceil(retry * 1000));
                    continue;
                }
                if (response.status() >= 200 && response.status() < 300) {
                    var id = mapper.readTree(response.body()).path("id").asString("");
                    return id.matches("[0-9]{1,30}") ? new Result(Status.SENT, id) : new Result(Status.UNKNOWN, null);
                }
                return new Result(response.status() >= 400 && response.status() < 500 && response.status() != 408
                    ? Status.REJECTED : Status.UNKNOWN, null);
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
        } catch (Exception exception) {
            return new Result(Status.UNKNOWN, null);
        }
        return new Result(Status.UNKNOWN, null);
    }
}
