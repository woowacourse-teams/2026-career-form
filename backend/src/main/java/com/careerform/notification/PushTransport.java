package com.careerform.notification;

import java.net.URI;
import java.time.Duration;
import java.util.Locale;
import java.util.Objects;

/**
 * 발송 방식 설정. DIRECT는 API 서버 안의 발송기가 직접 보내고, SQS는 릴레이가 큐에 넣고 워커가 꺼내 보낸다.
 * 큐 리스는 큐에 넣은 건이 처리되지 않은 채 남았을 때 다시 넣기까지 기다리는 시간이다.
 */
public record PushTransport(Mode mode, String queueUrl, String region, String endpoint, boolean relayEnabled, boolean workerEnabled, Duration queueLease) {
    public enum Mode { DIRECT, SQS }

    public PushTransport {
        Objects.requireNonNull(mode);
        Objects.requireNonNull(queueLease);
        queueUrl = blankToNull(queueUrl);
        region = blankToNull(region);
        endpoint = blankToNull(endpoint);
        if (queueLease.compareTo(Duration.ofMinutes(1)) < 0 || queueLease.compareTo(Duration.ofHours(12)) > 0) {
            throw new IllegalArgumentException("Invalid push queue lease");
        }
        if (mode == Mode.SQS) {
            if (queueUrl == null || !httpUrl(queueUrl)) { throw new IllegalArgumentException("Push SQS queue URL is required"); }
            if (region == null) { throw new IllegalArgumentException("Push SQS region is required"); }
            if (endpoint != null && !httpUrl(endpoint)) { throw new IllegalArgumentException("Invalid push SQS endpoint"); }
            if (!relayEnabled && !workerEnabled) { throw new IllegalArgumentException("Push relay or worker must be enabled"); }
        }
    }

    public static PushTransport direct() {
        return new PushTransport(Mode.DIRECT, null, null, null, true, true, Duration.ofMinutes(15));
    }

    /** 설정 값은 대소문자를 가리지 않는 direct 또는 sqs만 받는다. 그 밖의 값과 빈 값은 발송이 조용히 꺼지지 않도록 기동을 멈춘다. */
    public static Mode parseMode(String value) {
        return switch (value == null ? "" : value.toLowerCase(Locale.ROOT)) {
            case "direct" -> Mode.DIRECT;
            case "sqs" -> Mode.SQS;
            default -> throw new IllegalArgumentException("Invalid push transport");
        };
    }

    /** 조건부 조립(@ConditionalOnProperty)은 true만 켜짐으로 본다. 1·yes처럼 다르게 읽힐 수 있는 값은 릴레이나 워커가 조용히 빠지지 않도록 받지 않는다. */
    public static boolean parseFlag(String value, String name) {
        if ("true".equalsIgnoreCase(value)) { return true; }
        if ("false".equalsIgnoreCase(value)) { return false; }
        throw new IllegalArgumentException("Invalid push " + name);
    }

    private static String blankToNull(String value) { return value == null || value.isBlank() ? null : value.strip(); }

    private static boolean httpUrl(String value) {
        try {
            var uri = URI.create(value);
            return uri.getHost() != null && ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()));
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }
}
