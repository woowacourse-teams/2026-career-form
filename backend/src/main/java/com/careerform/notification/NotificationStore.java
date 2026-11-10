package com.careerform.notification;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

/** 공고·구독·발송 저장소 포트. 선점과 완료는 비교 후 교체 의미를 가진다. */
public interface NotificationStore {
    boolean insertPosting(JobPosting posting);

    Optional<JobPosting> findPosting(String id);

    Optional<JobPosting> findPostingByLink(String link);

    List<JobPosting> listPostings();

    List<JobPosting> listOpenPostings(Instant now);

    boolean deletePosting(String id);

    boolean insertSubscription(PushSubscription subscription);

    Optional<PushSubscription> findSubscription(String id);

    Optional<PushSubscription> findSubscriptionByEndpoint(String endpoint);

    List<String> subscriptionIds();

    /** 구독의 받을 직무와 갱신 시각을 바꾼다. roles가 null이면 미선택으로 저장하고, 없는 구독이면 false다. */
    boolean updateSubscriptionRoles(String id, List<String> roles, Instant updatedAt);

    /** roles가 하나라도 겹치는 선택 구독과 roles가 없거나 빈 미선택 구독의 id. 겹치지 않는 선택 구독은 뺀다. */
    List<String> subscriptionIdsForRoles(Collection<String> roles);

    /** subscriptionIdsForRoles 조건에 가입 시각(registeredAt)이 registeredBy와 같거나 앞선 조건을 더한 id. roles가 null이면 직무와 상관없이 그 시각까지 가입한 모든 구독이다. */
    List<String> subscriptionIdsForRolesRegisteredBy(Collection<String> roles, Instant registeredBy);

    /** roles가 1개 이상인 구독 수. */
    long countSubscriptionsWithRoles();

    boolean deleteSubscription(String id);

    boolean deleteSubscriptionByEndpoint(String endpoint);

    /** 공고 × 구독 쌍이 이미 있는 문서는 건너뛴다. */
    void insertDeliveries(List<PushDelivery> deliveries);

    Optional<PushDelivery> findDelivery(String id);

    /** 예정 시각이 지난 대기 건, 리스가 만료된 발송 중 건, 큐 리스가 만료된 큐 대기 건. */
    List<PushDelivery> findDueDeliveries(Instant now, int limit);

    /** 관측한 상태와 기한 조건이 그대로일 때만 발송 중으로 바꾼다. 실패하면 비어 있다. */
    Optional<PushDelivery> claimDelivery(PushDelivery observed, Instant now, Instant leaseUntil);

    /**
     * 큐에 넣은 건을 큐 대기로 표시한다. 관측한 상태가 그대로일 때만 바꾸며(대기는 다음 시도 시각과 시도 횟수, 큐 대기와 발송 중은 리스가 같아야 한다)
     * 시도 횟수는 올리지 않는다.
     */
    boolean markQueued(PushDelivery observed, Instant leaseUntil);

    /** 워커 선점: 큐 대기 건, 예정 시각이 지난 대기 건, 리스가 만료된 발송 중 건이면 발송 중으로 바꾼다. 실패하면 비어 있다. */
    Optional<PushDelivery> claimQueuedDelivery(String id, Instant now, Instant leaseUntil);

    /** 선점한 리스와 시도 횟수가 그대로일 때만 다음 상태로 바꾼다. */
    boolean completeDelivery(PushDelivery claimed, PushDelivery next);

    /** 공고의 대기 건과 큐 대기 건을 지운다. */
    long deletePendingDeliveries(String postingId);

    DeliveryProgress deliveryProgress(String postingId);

    /** 예정 시각이 [from, to)인 발송의 요약. 수락 지연은 lastAttemptAt - scheduledAt이다. */
    DeliverySummary summarizeDeliveries(Instant from, Instant to);

    long countPostingsRegisteredBetween(Instant from, Instant to);

    long countSubscriptions();

    long countDeliveries(PushDelivery.Status status);
}
