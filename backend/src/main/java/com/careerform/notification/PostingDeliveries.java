package com.careerform.notification;

import java.util.List;

/**
 * 공고의 대기 발송 문서 만들기와 빠진 발송 채우기. 단일 노드 MongoDB라 공고 저장과 발송 문서 저장을 한 트랜잭션으로 묶지 못하므로,
 * 발송 문서를 모두 저장한 뒤에만 공고의 완료 표시를 바꿔 "완료된 공고는 대상 구독의 발송 문서를 모두 갖는다"를 지킨다.
 */
final class PostingDeliveries {
    private PostingDeliveries() { }

    static List<PushDelivery> pending(JobPosting posting, List<String> subscriptionIds) {
        return subscriptionIds.stream()
            .map(subscriptionId -> PushDelivery.pending(Identifiers.random(), posting.id(), subscriptionId, posting.scheduledAt())).toList();
    }

    /**
     * 공고 직무로 정한 대상 구독(레거시 공고는 전원) 가운데 공고 등록 시각까지 가입한 구독의 빠진 대기 발송을 공고 예정 시각으로 채우고 완료로 표시한다.
     * 이미 있는 공고 × 구독 쌍은 저장소가 건너뛰므로 여러 번 불려도 쌍마다 발송 문서는 하나다. 반환값은 다시 확인한 대상 구독 수다.
     */
    static int refill(NotificationStore store, JobPosting posting) {
        List<String> targets = store.subscriptionIdsForRolesRegisteredBy(posting.roles(), posting.registeredAt());
        store.insertDeliveries(pending(posting, targets));
        store.markDeliveriesReady(posting.id());
        return targets.size();
    }
}
