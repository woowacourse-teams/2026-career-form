package com.careerform.quality;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

public final class QualityCandidateGroups {
    private QualityCandidateGroups() { }

    public record Site(String id, List<QualityRecord> candidates) {
        public Site { candidates = List.copyOf(candidates); }
        public boolean completed(Instant now) {
            return candidates.stream().allMatch(record -> candidate(record).statusAt(now) == QualityRegistry.Status.COMPLETED);
        }
        public Instant firstSeen() { return candidates.stream().map(record -> candidate(record).firstSeen()).min(Instant::compareTo).orElseThrow(); }
    }

    public static String groupKey(QualityRecord record) {
        var group = record.group();
        return group.environment() + "|" + (group.identity() == QualitySite.Status.POLICY ? group.site() : group.host());
    }

    public static List<Site> group(List<QualityRecord> records) {
        return records.stream().collect(Collectors.groupingBy(QualityCandidateGroups::groupKey)).entrySet().stream()
            .map(entry -> new Site("site_" + QualityProjection.digest(entry.getKey()), entry.getValue().stream()
                .sorted(Comparator.comparing((QualityRecord record) -> candidate(record).firstSeen()).thenComparing(QualityRecord::id)).toList()))
            .sorted(Comparator.comparing(Site::firstSeen).thenComparing(Site::id)).toList();
    }

    public static List<Site> all(QualityRegistry registry) {
        var records = registry.listRecords(null, 0, 10001);
        if (records.size() > 10000) { throw new IllegalArgumentException("Candidate grouping capacity exceeded"); }
        return group(records);
    }

    public static List<QualityRecord> selection(List<QualityRecord> records, Instant now) {
        return group(records).stream().flatMap(site -> site.candidates().stream()
            .filter(record -> candidate(record).statusAt(now) != QualityRegistry.Status.COMPLETED)
            .sorted(Comparator.comparingInt((QualityRecord record) -> priority(candidate(record), now))
                .thenComparing(record -> candidate(record).firstSeen()).thenComparing(QualityRecord::id)).limit(1)).toList();
    }

    private static int priority(QualityRegistry.Candidate candidate, Instant now) {
        if (candidate.claimedAt(now)) { return 0; }
        if (candidate.statusAt(now) == QualityRegistry.Status.REQUESTED) { return 1; }
        return candidate.statusAt(now) == QualityRegistry.Status.DEFERRED ? 3 : 2;
    }

    private static QualityRegistry.Candidate candidate(QualityRecord record) { return (QualityRegistry.Candidate) record.payload(); }
}
