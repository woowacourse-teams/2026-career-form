package com.careerform.quality;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;

public final class QualityRetention {

    private static final Duration DETAILS = Duration.ofDays(30);
    private static final Duration AGGREGATES = Duration.ofDays(90);
    private static final Duration REPORT = Duration.ofDays(1);
    private static final Duration IDLE = Duration.ofMinutes(30);
    private static final ZoneId ZONE = ZoneId.of("Asia/Seoul");

    private QualityRetention() {
    }

    public static boolean detailsVisible(Instant startedAt, Instant now) {
        return within(startedAt, now, DETAILS);
    }

    public static boolean aggregateVisible(Instant startedAt, Instant now) {
        var dayStarted = startedAt.atZone(ZONE).toLocalDate().atStartOfDay(ZONE).toInstant();
        return within(dayStarted, now, AGGREGATES);
    }

    public static boolean reportAllowed(Instant startedAt, Instant now) {
        return within(startedAt, now, REPORT);
    }

    public static boolean provisionallyUnobserved(Instant lastObservedAt, Instant now) {
        return !now.isBefore(lastObservedAt.plus(IDLE));
    }

    public static void checkRange(Instant from, Instant to, boolean aggregated) {
        if (from == null || to == null || to.isBefore(from)
            || Duration.between(from, to).compareTo(aggregated ? AGGREGATES : DETAILS) > 0) {
            throw new IllegalArgumentException("품질 조회 기간을 확인할 수 없습니다");
        }
    }

    private static boolean within(Instant startedAt, Instant now, Duration retention) {
        return !now.isBefore(startedAt) && now.isBefore(startedAt.plus(retention));
    }
}
