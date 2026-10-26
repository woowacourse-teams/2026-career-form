package com.careerform.notification;

import java.io.IOException;
import java.time.Duration;

/** Web Push 요청 한 건을 보내는 포트. 전송 실패(시간 초과 포함)는 IOException으로 알린다. */
public interface WebPushClient {
    /** retryAfter는 Retry-After 헤더를 응답 시각 기준 지연으로 바꾼 값이며 없으면 null이다. */
    record Response(int statusCode, Duration retryAfter) { }

    Response send(PushSubscription subscription, byte[] payload, Duration ttl) throws IOException, InterruptedException;
}
