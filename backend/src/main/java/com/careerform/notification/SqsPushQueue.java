package com.careerform.notification;

import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.MessageSystemAttributeName;
import software.amazon.awssdk.services.sqs.model.SendMessageBatchRequestEntry;

/**
 * Amazon SQS 표준 큐 어댑터. 자격 증명은 SDK 기본 공급자(EC2 인스턴스 역할 등)를 쓰고 액세스 키 설정은 받지 않는다.
 * 본문에는 발송 문서 ID만 담는다. 표준 큐라 같은 메시지가 두 번 올 수 있고 순서도 보장되지 않는다.
 */
public final class SqsPushQueue implements PushQueue, AutoCloseable {
    static final int BATCH = 10;
    static final int MAX_WAIT_SECONDS = 20;
    private static final Duration SHORT_CALL = Duration.ofSeconds(10);
    private static final Duration SHORT_ATTEMPT = Duration.ofSeconds(5);
    private static final Duration RECEIVE_CALL = Duration.ofSeconds(60);
    private static final Duration RECEIVE_ATTEMPT = Duration.ofSeconds(25);
    private static final Logger log = LoggerFactory.getLogger(SqsPushQueue.class);
    private final SqsClient client;
    private final String queueUrl;

    public SqsPushQueue(SqsClient client, String queueUrl) {
        this.client = client;
        this.queueUrl = queueUrl;
    }

    /** 리전과 (로컬 대체물용) endpoint만 설정한 클라이언트를 만든다. 만드는 것만으로는 AWS를 부르지 않는다. */
    public static SqsPushQueue create(PushTransport transport) {
        var builder = SqsClient.builder().region(Region.of(transport.region()));
        if (transport.endpoint() != null) { builder.endpointOverride(URI.create(transport.endpoint())); }
        return new SqsPushQueue(builder.build(), transport.queueUrl());
    }

    @Override public List<String> send(List<String> deliveryIds) {
        var failed = new ArrayList<String>();
        for (var from = 0; from < deliveryIds.size(); from += BATCH) {
            var chunk = deliveryIds.subList(from, Math.min(from + BATCH, deliveryIds.size()));
            var entries = new ArrayList<SendMessageBatchRequestEntry>();
            for (var index = 0; index < chunk.size(); index++) {
                entries.add(SendMessageBatchRequestEntry.builder().id(Integer.toString(index)).messageBody(chunk.get(index)).build());
            }
            try {
                var response = client.sendMessageBatch(request -> request.queueUrl(queueUrl).entries(entries)
                    .overrideConfiguration(configuration -> configuration.apiCallTimeout(SHORT_CALL).apiCallAttemptTimeout(SHORT_ATTEMPT)));
                for (var entry : response.failed()) { failed.add(chunk.get(Integer.parseInt(entry.id()))); }
            } catch (SdkException exception) {
                log.warn("PUSH_QUEUE_SEND_FAILED failure={} count={}", exception.getClass().getSimpleName(), chunk.size());
                failed.addAll(chunk);
            }
        }
        return failed;
    }

    @Override public List<Message> receive(int max, Duration wait) {
        var count = Math.clamp(max, 1, BATCH);
        var seconds = (int) Math.clamp(wait.toSeconds(), 0, MAX_WAIT_SECONDS);
        var response = client.receiveMessage(request -> request.queueUrl(queueUrl).maxNumberOfMessages(count).waitTimeSeconds(seconds)
            .messageSystemAttributeNames(MessageSystemAttributeName.SENT_TIMESTAMP)
            .overrideConfiguration(configuration -> configuration.apiCallTimeout(RECEIVE_CALL).apiCallAttemptTimeout(RECEIVE_ATTEMPT)));
        return response.messages().stream().map(message -> new Message(message.body(), message.receiptHandle(),
            sentAt(message.attributes().get(MessageSystemAttributeName.SENT_TIMESTAMP)))).toList();
    }

    @Override public void delete(Message message) {
        client.deleteMessage(request -> request.queueUrl(queueUrl).receiptHandle(message.receipt())
            .overrideConfiguration(configuration -> configuration.apiCallTimeout(SHORT_CALL).apiCallAttemptTimeout(SHORT_ATTEMPT)));
    }

    @Override public void close() { client.close(); }

    private static Instant sentAt(String epochMillis) {
        if (epochMillis == null) { return null; }
        try {
            return Instant.ofEpochMilli(Long.parseLong(epochMillis));
        } catch (NumberFormatException exception) {
            return null;
        }
    }
}
