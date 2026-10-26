package com.careerform.notification;

import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

/** 테스트용 메모리 저장소. 조건부 갱신(선점·완료)은 MongoDB findAndModify와 같은 비교 후 교체 의미를 synchronized로 재현한다. */
public final class MemoryNotificationStore implements NotificationStore {
    private final Map<String, JobPosting> postings = new LinkedHashMap<>();
    private final Map<String, PushSubscription> subscriptions = new LinkedHashMap<>();
    private final Map<String, PushDelivery> deliveries = new LinkedHashMap<>();

    @Override public synchronized boolean insertPosting(JobPosting posting) {
        if (postings.containsKey(posting.id()) || postings.values().stream().anyMatch(existing -> existing.link().equals(posting.link()))) { return false; }
        postings.put(posting.id(), posting);
        return true;
    }

    @Override public synchronized Optional<JobPosting> findPosting(String id) { return Optional.ofNullable(postings.get(id)); }

    @Override public synchronized Optional<JobPosting> findPostingByLink(String link) {
        return postings.values().stream().filter(posting -> posting.link().equals(link)).findFirst();
    }

    @Override public synchronized List<JobPosting> listPostings() {
        return postings.values().stream().sorted(Comparator.comparing(JobPosting::registeredAt).reversed().thenComparing(JobPosting::id)).toList();
    }

    @Override public synchronized List<JobPosting> listOpenPostings(Instant now) {
        return postings.values().stream().filter(posting -> posting.openAt(now))
            .sorted(Comparator.comparing(JobPosting::closesAt).thenComparing(JobPosting::id)).toList();
    }

    @Override public synchronized boolean deletePosting(String id) { return postings.remove(id) != null; }

    @Override public synchronized boolean insertSubscription(PushSubscription subscription) {
        if (subscriptions.containsKey(subscription.id())
            || subscriptions.values().stream().anyMatch(existing -> existing.endpoint().equals(subscription.endpoint()))) { return false; }
        subscriptions.put(subscription.id(), subscription);
        return true;
    }

    @Override public synchronized Optional<PushSubscription> findSubscription(String id) { return Optional.ofNullable(subscriptions.get(id)); }

    @Override public synchronized Optional<PushSubscription> findSubscriptionByEndpoint(String endpoint) {
        return subscriptions.values().stream().filter(subscription -> subscription.endpoint().equals(endpoint)).findFirst();
    }

    @Override public synchronized List<String> subscriptionIds() { return List.copyOf(subscriptions.keySet()); }

    @Override public synchronized boolean deleteSubscription(String id) { return subscriptions.remove(id) != null; }

    @Override public synchronized boolean deleteSubscriptionByEndpoint(String endpoint) {
        return subscriptions.values().removeIf(subscription -> subscription.endpoint().equals(endpoint));
    }

    @Override public synchronized void insertDeliveries(List<PushDelivery> inserted) {
        for (var delivery : inserted) {
            var duplicate = deliveries.values().stream().anyMatch(existing -> existing.postingId().equals(delivery.postingId())
                && existing.subscriptionId().equals(delivery.subscriptionId()));
            if (!duplicate && !deliveries.containsKey(delivery.id())) { deliveries.put(delivery.id(), delivery); }
        }
    }

    @Override public synchronized Optional<PushDelivery> findDelivery(String id) { return Optional.ofNullable(deliveries.get(id)); }

    @Override public synchronized List<PushDelivery> findDueDeliveries(Instant now, int limit) {
        return deliveries.values().stream().filter(delivery -> due(delivery, now))
            .sorted(Comparator.comparing(PushDelivery::nextAttemptAt).thenComparing(PushDelivery::id)).limit(limit).toList();
    }

    @Override public synchronized Optional<PushDelivery> claimDelivery(PushDelivery observed, Instant now, Instant leaseUntil) {
        var current = deliveries.get(observed.id());
        if (current == null || current.status() != observed.status() || !due(current, now)) { return Optional.empty(); }
        var claimed = current.claimed(now, leaseUntil);
        deliveries.put(claimed.id(), claimed);
        return Optional.of(claimed);
    }

    @Override public synchronized boolean completeDelivery(PushDelivery claimed, PushDelivery next) {
        var current = deliveries.get(claimed.id());
        if (current == null || !next.id().equals(claimed.id()) || current.status() != PushDelivery.Status.SENDING
            || !Objects.equals(current.leaseUntil(), claimed.leaseUntil()) || current.attempts() != claimed.attempts()) { return false; }
        deliveries.put(next.id(), next);
        return true;
    }

    @Override public synchronized long deletePendingDeliveries(String postingId) {
        var before = deliveries.size();
        deliveries.values().removeIf(delivery -> delivery.postingId().equals(postingId) && delivery.status() == PushDelivery.Status.PENDING);
        return before - deliveries.size();
    }

    @Override public synchronized DeliveryProgress deliveryProgress(String postingId) {
        var rows = deliveries.values().stream().filter(delivery -> delivery.postingId().equals(postingId)).toList();
        return new DeliveryProgress(
            rows.stream().filter(delivery -> delivery.status() == PushDelivery.Status.PENDING).count(),
            rows.stream().filter(delivery -> delivery.status() == PushDelivery.Status.SENDING).count(),
            rows.stream().filter(delivery -> delivery.status() == PushDelivery.Status.ACCEPTED).count(),
            rows.stream().filter(delivery -> delivery.status() == PushDelivery.Status.ABANDONED).count(),
            rows.stream().map(PushDelivery::lastAttemptAt).filter(Objects::nonNull).max(Comparator.naturalOrder()).orElse(null));
    }

    @Override public synchronized DeliverySummary summarizeDeliveries(Instant from, Instant to) {
        var rows = deliveries.values().stream().filter(d -> !d.scheduledAt().isBefore(from) && d.scheduledAt().isBefore(to)).toList();
        var latencies = rows.stream().filter(d -> d.status() == PushDelivery.Status.ACCEPTED && d.lastAttemptAt() != null)
            .map(d -> Math.max(0, d.lastAttemptAt().toEpochMilli() - d.scheduledAt().toEpochMilli())).sorted().toList();
        return new DeliverySummary(
            rows.stream().filter(d -> d.status() == PushDelivery.Status.PENDING).count(),
            rows.stream().filter(d -> d.status() == PushDelivery.Status.SENDING).count(),
            rows.stream().filter(d -> d.status() == PushDelivery.Status.ACCEPTED).count(),
            rows.stream().filter(d -> d.status() == PushDelivery.Status.ABANDONED).count(),
            rows.stream().mapToLong(PushDelivery::attempts).sum(),
            percentile(latencies, 0.5), percentile(latencies, 0.95));
    }

    /** 최근접 순위 백분위: 정렬한 값에서 ceil(p × n)번째. */
    private static Long percentile(List<Long> sorted, double p) {
        if (sorted.isEmpty()) { return null; }
        var rank = (int) Math.ceil(p * sorted.size());
        return sorted.get(Math.min(sorted.size(), Math.max(rank, 1)) - 1);
    }

    @Override public synchronized long countPostingsRegisteredBetween(Instant from, Instant to) {
        return postings.values().stream().filter(p -> !p.registeredAt().isBefore(from) && p.registeredAt().isBefore(to)).count();
    }

    @Override public synchronized long countSubscriptions() { return subscriptions.size(); }

    @Override public synchronized long countDeliveries(PushDelivery.Status status) {
        return deliveries.values().stream().filter(d -> d.status() == status).count();
    }

    public synchronized List<PushDelivery> deliveries() { return List.copyOf(deliveries.values()); }

    private static boolean due(PushDelivery delivery, Instant now) {
        return (delivery.status() == PushDelivery.Status.PENDING && !delivery.nextAttemptAt().isAfter(now))
            || (delivery.status() == PushDelivery.Status.SENDING && delivery.leaseUntil() != null && !delivery.leaseUntil().isAfter(now));
    }
}
