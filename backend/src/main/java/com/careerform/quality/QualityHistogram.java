package com.careerform.quality;

import java.util.Collections;
import java.util.List;
import java.util.stream.IntStream;

public record QualityHistogram(List<Long> bins) {
    public static final List<Long> BOUNDS = List.of(50L, 100L, 250L, 500L, 1000L, 2500L, 5000L,
        10000L, 20000L, 30000L, 60000L, 120000L);

    public QualityHistogram {
        bins = List.copyOf(bins);
        if (bins.size() != BOUNDS.size() + 1 || bins.stream().anyMatch(value -> value < 0)) {
            throw new IllegalArgumentException("Invalid quality histogram");
        }
    }

    public static QualityHistogram empty() { return new QualityHistogram(Collections.nCopies(BOUNDS.size() + 1, 0L)); }

    public static QualityHistogram sample(long milliseconds) {
        if (milliseconds < 0) { throw new IllegalArgumentException("Invalid duration"); }
        var index = IntStream.range(0, BOUNDS.size()).filter(value -> milliseconds <= BOUNDS.get(value)).findFirst().orElse(BOUNDS.size());
        return new QualityHistogram(IntStream.range(0, BOUNDS.size() + 1).mapToObj(value -> value == index ? 1L : 0L).toList());
    }

    public QualityHistogram plus(QualityHistogram other) {
        return new QualityHistogram(IntStream.range(0, bins.size()).mapToObj(index -> Math.addExact(bins.get(index), other.bins.get(index))).toList());
    }

    public long samples() { return bins.stream().reduce(0L, Math::addExact); }

    public long overflow() { return bins.getLast(); }

    public Long p95() {
        var total = samples();
        if (total == 0) { return null; }
        var rank = Math.ceil(total * 0.95);
        long accumulated = 0;
        for (var index = 0; index < BOUNDS.size(); index++) {
            accumulated = Math.addExact(accumulated, bins.get(index));
            if (accumulated >= rank) { return BOUNDS.get(index); }
        }
        return null;
    }
}
