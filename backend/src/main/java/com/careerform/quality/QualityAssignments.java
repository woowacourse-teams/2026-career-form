package com.careerform.quality;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

final class QualityAssignments {
    private QualityAssignments() { }

    private record Assignment(Set<String> postings, boolean legacy) { }

    static int count(List<QualityRecord> work, List<QualityRecord> observations, Instant now) {
        var byId = work.stream().collect(Collectors.toUnmodifiableMap(QualityRecord::id, record -> record));
        var old = observations.stream().filter(record -> active(record, now)).filter(record -> !fulfilled(record, byId))
            .map(record -> new Assignment(scope(record), true)).toList();
        var current = work.stream().filter(record -> record.kind() == QualityRecord.Kind.POSTING && active(record, now))
            .map(record -> new Assignment(Set.of(record.id()), false)).toList();
        var components = List.<List<Assignment>>of();
        for (var assignment : Stream.concat(old.stream(), current.stream()).toList()) {
            var related = components.stream().filter(component -> component.stream()
                .anyMatch(value -> value.postings().stream().anyMatch(assignment.postings()::contains))).toList();
            var merged = Stream.concat(Stream.of(assignment), related.stream().flatMap(List::stream)).toList();
            components = Stream.concat(components.stream().filter(component -> !related.contains(component)), Stream.of(merged)).toList();
        }
        return Math.toIntExact(components.stream().mapToLong(component -> {
            var legacy = component.stream().filter(Assignment::legacy).count();
            return Math.max(legacy, component.size() - legacy);
        }).sum());
    }

    private static Set<String> scope(QualityRecord record) {
        var urls = QualityPostings.urls(record);
        return urls.isEmpty() ? Set.of("legacy:" + record.id())
            : urls.stream().map(url -> QualityPostings.id(record, url)).collect(Collectors.toUnmodifiableSet());
    }

    private static boolean active(QualityRecord record, Instant now) {
        var candidate = (QualityRegistry.Candidate) record.payload();
        return !candidate.firstSeen().isAfter(now) && (candidate.claimedAt(now) || candidate.statusAt(now) == QualityRegistry.Status.REQUESTED);
    }

    private static boolean fulfilled(QualityRecord record, Map<String, QualityRecord> work) {
        var urls = QualityPostings.urls(record);
        return !urls.isEmpty() && urls.stream().allMatch(url -> {
            var posting = work.get(QualityPostings.id(record, url));
            return posting != null && !((QualityRegistry.Candidate) posting.payload()).history().isEmpty();
        });
    }
}
