package com.careerform.notification;

import java.time.Instant;
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

    boolean deleteSubscription(String id);

    boolean deleteSubscriptionByEndpoint(String endpoint);

    /** 공고 × 구독 쌍이 이미 있는 문서는 건너뛴다. */
    void insertDeliveries(List<PushDelivery> deliveries);

    Optional<PushDelivery> findDelivery(String id);

    /** 예정 시각이 지난 대기 건과 리스가 만료된 발송 중 건. */
    List<PushDelivery> findDueDeliveries(Instant now, int limit);

    /** 관측한 상태와 기한 조건이 그대로일 때만 발송 중으로 바꾼다. 실패하면 비어 있다. */
    Optional<PushDelivery> claimDelivery(PushDelivery observed, Instant now, Instant leaseUntil);

    /** 선점한 리스와 시도 횟수가 그대로일 때만 다음 상태로 바꾼다. */
    boolean completeDelivery(PushDelivery claimed, PushDelivery next);

    long deletePendingDeliveries(String postingId);

    DeliveryProgress deliveryProgress(String postingId);

    /** 예정 시각이 [from, to)인 발송의 요약. 수락 지연은 lastAttemptAt - scheduledAt이다. */
    DeliverySummary summarizeDeliveries(Instant from, Instant to);

    long countPostingsRegisteredBetween(Instant from, Instant to);

    long countSubscriptions();

    long countDeliveries(PushDelivery.Status status);
}
