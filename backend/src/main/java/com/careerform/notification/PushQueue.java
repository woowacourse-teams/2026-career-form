package com.careerform.notification;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

/** 발송 큐 포트. 메시지 본문은 발송 문서 ID만 담는다. 같은 ID가 두 번 들어가도 워커의 선점이 한 번만 보내게 막는다. */
public interface PushQueue {
    /** SQS가 한 번에 넣거나 받게 해 주는 메시지 수의 상한. */
    int MAX_BATCH = 10;

    /** 받은 메시지. receipt는 지울 때 쓰는 손잡이, sentAt은 큐에 들어간 시각이다(모르면 null). */
    record Message(String body, String receipt, Instant sentAt) { }

    /** 발송 문서 ID들을 큐에 넣고, 넣지 못한 ID를 돌려준다. */
    List<String> send(List<String> deliveryIds);

    /** 최대 max건을 받는다. 없으면 wait만큼 기다린 뒤 빈 목록을 돌려준다. */
    List<Message> receive(int max, Duration wait);

    void delete(Message message);
}
