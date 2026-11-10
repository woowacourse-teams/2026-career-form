package com.careerform.notification;

import java.time.Clock;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** 테스트용 메모리 큐. 받은 메시지는 지우기 전까지 "받은 상태"로 남고 redeliver()가 다시 보이게 한다. */
final class MemoryPushQueue implements PushQueue {
    private final Clock clock;
    private final Deque<Message> visible = new ArrayDeque<>();
    private final List<Message> received = new ArrayList<>();
    private final Set<String> rejected = new HashSet<>();
    private final List<Integer> receiveSizes = new ArrayList<>();
    private RuntimeException sendFailure;
    private int sequence;

    MemoryPushQueue(Clock clock) { this.clock = clock; }

    @Override public synchronized List<String> send(List<String> deliveryIds) {
        if (sendFailure != null) { throw sendFailure; }
        var failed = new ArrayList<String>();
        for (var id : deliveryIds) {
            if (rejected.contains(id)) { failed.add(id); } else { put(id); }
        }
        return failed;
    }

    @Override public synchronized List<Message> receive(int max, Duration wait) {
        receiveSizes.add(max);
        var batch = new ArrayList<Message>();
        while (batch.size() < max && !visible.isEmpty()) { batch.add(visible.poll()); }
        received.addAll(batch);
        return batch;
    }

    @Override public synchronized void delete(Message message) { received.removeIf(current -> current.receipt().equals(message.receipt())); }

    /** 본문을 그대로 넣는다. 형식이 깨진 메시지를 만들 때도 쓴다. */
    synchronized void put(String body) { visible.add(new Message(body, "receipt-" + ++sequence, clock.instant())); }

    synchronized void reject(String... deliveryIds) { rejected.addAll(List.of(deliveryIds)); }

    synchronized void acceptAll() { rejected.clear(); sendFailure = null; }

    synchronized void failSends(RuntimeException failure) { sendFailure = failure; }

    /** 큐에서 메시지가 사라진 경우를 만든다. */
    synchronized void lose() { visible.clear(); received.clear(); }

    /** 받았지만 지우지 않은 메시지를 다시 보이게 한다(가시성 타임아웃 경과). */
    synchronized void redeliver() { visible.addAll(received); received.clear(); }

    synchronized List<String> visibleBodies() { return visible.stream().map(Message::body).toList(); }

    synchronized List<String> receivedBodies() { return received.stream().map(Message::body).toList(); }

    synchronized int size() { return visible.size() + received.size(); }

    synchronized List<Integer> receiveSizes() { return List.copyOf(receiveSizes); }
}
