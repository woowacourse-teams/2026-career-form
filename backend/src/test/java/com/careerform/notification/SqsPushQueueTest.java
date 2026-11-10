package com.careerform.notification;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Function;
import java.util.stream.IntStream;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.sun.net.httpserver.HttpServer;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.sqs.SqsClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@DisplayName("SQS 발송 큐 어댑터")
class SqsPushQueueTest {
    private static final String QUEUE_URL = "https://sqs.ap-northeast-2.amazonaws.com/000000000000/synthetic-push";
    private final ObjectMapper json = new ObjectMapper();
    private final List<Call> calls = new CopyOnWriteArrayList<>();
    private volatile Function<Call, Reply> behavior = call -> new Reply(200, "{}");
    private HttpServer server;
    private SqsClient client;
    private SqsPushQueue queue;

    record Call(String target, JsonNode body) { }

    record Reply(int status, String body) { }

    @BeforeEach
    void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            var call = new Call(exchange.getRequestHeaders().getFirst("X-Amz-Target"), json.readTree(exchange.getRequestBody().readAllBytes()));
            calls.add(call);
            var reply = behavior.apply(call);
            var bytes = reply.body().getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/x-amz-json-1.0");
            exchange.sendResponseHeaders(reply.status(), bytes.length);
            try (var out = exchange.getResponseBody()) { out.write(bytes); }
        });
        server.start();
        client = SqsClient.builder().region(Region.AP_NORTHEAST_2)
            .endpointOverride(URI.create("http://127.0.0.1:" + server.getAddress().getPort()))
            .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("synthetic", "synthetic")))
            .overrideConfiguration(configuration -> configuration.retryStrategy(retry -> retry.maxAttempts(1)))
            .build();
        queue = new SqsPushQueue(client, QUEUE_URL);
    }

    @AfterEach
    void stop() {
        queue.close();
        server.stop(0);
    }

    @Test
    @DisplayName("발송 ID만 본문에 담아 10건씩 나눠 넣고 큐가 거절한 ID를 돌려준다")
    void sendsIdsInBatchesOfTenAndReturnsRejected() {
        behavior = call -> {
            var successful = new ArrayList<String>();
            var failed = new ArrayList<String>();
            for (var entry : call.body().get("Entries")) {
                var body = entry.get("MessageBody").asString();
                if (body.equals("id-13")) {
                    failed.add("{\"Id\":\"" + entry.get("Id").asString() + "\",\"SenderFault\":false,\"Code\":\"InternalError\"}");
                } else {
                    successful.add("{\"Id\":\"" + entry.get("Id").asString() + "\",\"MessageId\":\"m-" + body + "\",\"MD5OfMessageBody\":\"" + md5(body) + "\"}");
                }
            }
            return new Reply(200, "{\"Successful\":[" + String.join(",", successful) + "],\"Failed\":[" + String.join(",", failed) + "]}");
        };
        var ids = IntStream.range(0, 25).mapToObj(index -> "id-" + index).toList();
        assertThat(queue.send(ids)).containsExactly("id-13");
        assertThat(calls).hasSize(3).allSatisfy(call -> {
            assertThat(call.target()).isEqualTo("AmazonSQS.SendMessageBatch");
            assertThat(call.body().get("QueueUrl").asString()).isEqualTo(QUEUE_URL);
        });
        assertThat(calls).extracting(call -> call.body().get("Entries").size()).containsExactly(10, 10, 5);
        var bodies = calls.stream().flatMap(call -> call.body().get("Entries").valueStream()).map(entry -> entry.get("MessageBody").asString()).toList();
        assertThat(bodies).containsExactlyElementsOf(ids);
        assertThat(calls.getFirst().body().get("Entries").get(0).propertyNames()).containsExactlyInAnyOrder("Id", "MessageBody");
    }

    @Test
    @DisplayName("넣기 호출이 실패한 묶음은 모두 넣지 못한 것으로 돌려주고 다음 묶음은 계속 넣는다")
    void returnsWholeChunkWhenCallFails() {
        behavior = call -> {
            if (call.body().get("Entries").get(0).get("MessageBody").asString().equals("id-0")) {
                return new Reply(500, "{\"__type\":\"com.amazonaws.sqs#InternalError\",\"message\":\"synthetic\"}");
            }
            var successful = new ArrayList<String>();
            for (var entry : call.body().get("Entries")) {
                var body = entry.get("MessageBody").asString();
                successful.add("{\"Id\":\"" + entry.get("Id").asString() + "\",\"MessageId\":\"m\",\"MD5OfMessageBody\":\"" + md5(body) + "\"}");
            }
            return new Reply(200, "{\"Successful\":[" + String.join(",", successful) + "],\"Failed\":[]}");
        };
        var ids = IntStream.range(0, 12).mapToObj(index -> "id-" + index).toList();
        assertThat(queue.send(ids)).containsExactlyElementsOf(ids.subList(0, 10));
        assertThat(calls).hasSize(2);
    }

    @Test
    @DisplayName("빈 목록은 호출 없이 끝난다")
    void skipsEmptySend() {
        assertThat(queue.send(List.of())).isEmpty();
        assertThat(calls).isEmpty();
    }

    @Test
    @DisplayName("long polling으로 받고 본문, 지울 때 쓸 손잡이, 큐에 들어간 시각을 돌려준다")
    void receivesWithLongPollingAndSentTimestamp() {
        behavior = call -> new Reply(200, "{\"Messages\":[{\"MessageId\":\"m1\",\"ReceiptHandle\":\"receipt-1\",\"MD5OfBody\":\"" + md5("id-1")
            + "\",\"Body\":\"id-1\",\"Attributes\":{\"SentTimestamp\":\"1893456000123\"}},{\"MessageId\":\"m2\",\"ReceiptHandle\":\"receipt-2\",\"MD5OfBody\":\""
            + md5("id-2") + "\",\"Body\":\"id-2\"}]}");
        var messages = queue.receive(7, Duration.ofSeconds(20));
        assertThat(messages).containsExactly(new PushQueue.Message("id-1", "receipt-1", Instant.ofEpochMilli(1893456000123L)),
            new PushQueue.Message("id-2", "receipt-2", null));
        var request = calls.getFirst();
        assertThat(request.target()).isEqualTo("AmazonSQS.ReceiveMessage");
        assertThat(request.body().get("QueueUrl").asString()).isEqualTo(QUEUE_URL);
        assertThat(request.body().get("MaxNumberOfMessages").asInt()).isEqualTo(7);
        assertThat(request.body().get("WaitTimeSeconds").asInt()).isEqualTo(20);
        assertThat(request.body().toString()).contains("SentTimestamp");
    }

    @Test
    @DisplayName("받는 건수는 1~10, 대기는 0~20초로 맞추고 메시지가 없으면 빈 목록을 돌려준다")
    void clampsReceiveArguments() {
        assertThat(queue.receive(50, Duration.ofMinutes(5))).isEmpty();
        assertThat(queue.receive(0, Duration.ofMillis(-1))).isEmpty();
        assertThat(calls.get(0).body().get("MaxNumberOfMessages").asInt()).isEqualTo(10);
        assertThat(calls.get(0).body().get("WaitTimeSeconds").asInt()).isEqualTo(20);
        assertThat(calls.get(1).body().get("MaxNumberOfMessages").asInt()).isEqualTo(1);
        assertThat(calls.get(1).body().get("WaitTimeSeconds").asInt()).isZero();
    }

    @Test
    @DisplayName("받은 손잡이로 메시지를 지운다")
    void deletesByReceipt() {
        queue.delete(new PushQueue.Message("id-1", "receipt-1", null));
        var request = calls.getFirst();
        assertThat(request.target()).isEqualTo("AmazonSQS.DeleteMessage");
        assertThat(request.body().get("QueueUrl").asString()).isEqualTo(QUEUE_URL);
        assertThat(request.body().get("ReceiptHandle").asString()).isEqualTo("receipt-1");
    }

    private static String md5(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("MD5").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }
}
