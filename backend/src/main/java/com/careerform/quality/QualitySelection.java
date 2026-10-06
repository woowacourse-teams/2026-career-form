package com.careerform.quality;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.stream.Stream;

public final class QualitySelection {

    private static final ZoneId ZONE = ZoneId.of("Asia/Seoul");
    private static final LocalTime NOTIFICATION_TIME = LocalTime.of(9, 20);
    private static final int DAILY_LIMIT = 5;
    private static final int AGING_LIMIT = 2;
    private static final long MIN_SAMPLE = 20;
    private static final Comparator<Candidate> OLDEST = Comparator
        .comparing(Candidate::firstSeen).thenComparing(Candidate::id);

    private QualitySelection() {
    }

    public enum Route {
        STATIC,
        GREETING,
        GENERIC;

        public Route next() {
            return values()[(ordinal() + 1) % values().length];
        }
    }

    public record Candidate(
        String id,
        Route route,
        Instant firstSeen,
        boolean active,
        boolean claimed,
        Instant deferredUntil,
        long executions,
        QualityMetrics.Counts counts
    ) {
        public Candidate {
            if (id == null || id.isBlank() || route == null || firstSeen == null
                || counts == null || executions < 0) {
                throw new IllegalArgumentException("확인 후보를 검증할 수 없습니다");
            }
        }

        public boolean pending() {
            return active || claimed;
        }

        public boolean eligibleAt(Instant now) {
            return !firstSeen.isAfter(now)
                && (deferredUntil == null || !deferredUntil.isAfter(now));
        }
    }

    public record Batch(List<Candidate> active, List<Candidate> newRequests, Route nextRoute) {
        public Batch {
            active = List.copyOf(active);
            newRequests = List.copyOf(newRequests);
        }
    }

    public static boolean isNotificationTime(Instant now) {
        var local = now.atZone(ZONE);
        return local.getDayOfWeek() != DayOfWeek.SATURDAY
            && local.getDayOfWeek() != DayOfWeek.SUNDAY
            && !local.toLocalTime().isBefore(NOTIFICATION_TIME);
    }

    public static Batch select(Instant now, List<Candidate> candidates, Route nextRoute) {
        Objects.requireNonNull(now);
        Objects.requireNonNull(nextRoute);
        var checked = List.copyOf(candidates);
        if (checked.stream().map(Candidate::id).distinct().count() != checked.size()) {
            throw new IllegalArgumentException("확인 후보 식별자가 중복되었습니다");
        }
        if (!isNotificationTime(now)) {
            return new Batch(List.of(), List.of(), nextRoute);
        }
        var eligible = checked.stream().filter(candidate -> candidate.eligibleAt(now)).toList();
        var pending = eligible.stream().filter(Candidate::pending).sorted(OLDEST).toList();
        var available = eligible.stream().filter(candidate -> !candidate.pending()).toList();
        var capacity = Math.max(0, DAILY_LIMIT - pending.size());
        var aging = pickAging(available, nextRoute, Math.min(capacity, AGING_LIMIT));
        var prioritized = available.stream()
            .filter(candidate -> !contains(aging.newRequests(), candidate.id()))
            .sorted(priorityOrder()).limit(capacity - aging.newRequests().size()).toList();
        return new Batch(pending.stream().limit(DAILY_LIMIT).toList(),
            Stream.concat(aging.newRequests().stream(), prioritized.stream()).toList(), aging.nextRoute());
    }

    private static Batch pickAging(List<Candidate> available, Route nextRoute, int limit) {
        var selected = new Batch(List.of(), List.of(), nextRoute);
        for (var slot = 0; slot < limit; slot++) {
            var previous = selected;
            var candidate = Stream.iterate(previous.nextRoute(), Route::next).limit(Route.values().length)
                .flatMap(route -> available.stream()
                    .filter(value -> value.route() == route && !contains(previous.newRequests(), value.id()))
                    .sorted(OLDEST).limit(1))
                .findFirst();
            if (candidate.isEmpty()) {
                break;
            }
            var picked = candidate.orElseThrow();
            selected = new Batch(List.of(),
                Stream.concat(previous.newRequests().stream(), Stream.of(picked)).toList(), picked.route().next());
        }
        return selected;
    }

    private static boolean contains(List<Candidate> candidates, String id) {
        return candidates.stream().anyMatch(candidate -> candidate.id().equals(id));
    }

    private static Comparator<Candidate> priorityOrder() {
        return Comparator.comparingInt(QualitySelection::priority)
            .thenComparingDouble(QualitySelection::rate)
            .thenComparing(Comparator.comparingLong(QualitySelection::sample).reversed())
            .thenComparing(OLDEST);
    }

    private static int priority(Candidate candidate) {
        var counts = candidate.counts();
        if (counts.attempted() >= MIN_SAMPLE && counts.written() < counts.attempted()) {
            return 0;
        }
        if (counts.discovered() >= MIN_SAMPLE && counts.mapped() < counts.discovered()) {
            return 1;
        }
        return 2;
    }

    private static double rate(Candidate candidate) {
        return switch (priority(candidate)) {
            case 0 -> (double) candidate.counts().written() / candidate.counts().attempted();
            case 1 -> (double) candidate.counts().mapped() / candidate.counts().discovered();
            default -> 0;
        };
    }

    private static long sample(Candidate candidate) {
        return switch (priority(candidate)) {
            case 0 -> candidate.counts().attempted();
            case 1 -> candidate.counts().discovered();
            default -> candidate.executions();
        };
    }
}
