package com.careerform.notification;

import java.io.IOException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

/** 가짜 Web Push 클라이언트. 호출을 기록하고 지정한 응답이나 예외를 돌려준다. */
final class FakeWebPushClient implements WebPushClient {
    @FunctionalInterface
    interface Behavior { Response respond(PushSubscription subscription, int call) throws IOException, InterruptedException; }

    record Call(String subscriptionId, byte[] payload, Duration ttl) { }

    private final List<Call> calls = Collections.synchronizedList(new ArrayList<>());
    private final AtomicInteger inFlight = new AtomicInteger();
    private final AtomicInteger maxInFlight = new AtomicInteger();
    private volatile Behavior behavior = (subscription, call) -> new Response(201, null);
    volatile Duration latency = Duration.ZERO;

    void respond(Behavior next) { behavior = next; }

    void always(int statusCode) { behavior = (subscription, call) -> new Response(statusCode, null); }

    void always(int statusCode, Duration retryAfter) { behavior = (subscription, call) -> new Response(statusCode, retryAfter); }

    void fail(IOException failure) { behavior = (subscription, call) -> { throw failure; }; }

    @Override
    public Response send(PushSubscription subscription, byte[] payload, Duration ttl) throws IOException, InterruptedException {
        var current = inFlight.incrementAndGet();
        maxInFlight.accumulateAndGet(current, Math::max);
        try {
            if (!latency.isZero()) { Thread.sleep(latency); }
            calls.add(new Call(subscription.id(), payload, ttl));
            return behavior.respond(subscription, calls.size());
        } finally {
            inFlight.decrementAndGet();
        }
    }

    List<Call> calls() { return List.copyOf(calls); }

    int maxInFlight() { return maxInFlight.get(); }
}
