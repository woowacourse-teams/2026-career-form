package com.careerform.quality;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;

public final class QualityPostings {
    private final QualityStore store;
    private final Clock clock;
    private final String environment;

    QualityPostings(QualityStore store, Clock clock, String environment) {
        this.store = store;
        this.clock = clock;
        this.environment = environment;
    }

    static List<String> urls(QualityRecord record) {
        var candidate = (QualityRegistry.Candidate) record.payload();
        return Stream.concat(candidate.links().stream().map(QualityPublicLinks.Link::url), Stream.of(candidate.publicLink()))
            .map(url -> QualityPublicLinks.validate(record.group().host(), url)).filter(java.util.Objects::nonNull).distinct().toList();
    }

    static String id(QualityRecord record, String url) {
        return id(record.group(), url);
    }

    static String id(QualityRecord.Group group, String url) {
        var site = group.identity() == QualitySite.Status.POLICY ? group.site() : group.host();
        return "candidate_" + QualityProjection.digest("posting-v1|" + group.environment() + "|" + site + "|" + url);
    }

    void observe(QualityRecord source, String url, Instant at) {
        var id = id(source, url);
        var group = source.group();
        for (var attempt = 0; attempt < 5; attempt++) {
            var previous = store.find(id, clock.instant());
            if (previous.isEmpty()) {
                var candidate = new QualityRegistry.Candidate(id, "https://" + group.host() + "/", url, at, at,
                    QualityRegistry.Status.WAITING, false, !((QualityRegistry.Candidate) source.payload()).history().isEmpty(),
                    null, null, null, null, null, List.of(), List.of(new QualityPublicLinks.Link(url, at, at)), false);
                var scope = new QualityRecord.Group(environment, group.site(), "POSTING", group.route(), group.version(), group.host(), group.identity());
                if (store.insert(new QualityRecord(id, QualityRecord.Kind.POSTING, scope, 0, clock.instant(), null, candidate))) { return; }
            } else {
                var record = previous.orElseThrow();
                var candidate = (QualityRegistry.Candidate) record.payload();
                var links = QualityPublicLinks.observe(candidate.links(), false, group.host(), url, at);
                var next = new QualityRegistry.Candidate(id, candidate.homepage(), url,
                    candidate.firstSeen().isBefore(at) ? candidate.firstSeen() : at, candidate.lastSeen().isAfter(at) ? candidate.lastSeen() : at,
                    candidate.status(), candidate.requested(), candidate.recheck(), candidate.claimOwner(), candidate.claimant(), candidate.claimExpiresAt(),
                    candidate.deferReason(), candidate.deferredUntil(), candidate.history(), links.links(), false);
                if (store.replace(record, record.withPayload(next))) { return; }
            }
        }
        throw new QualityRegistry.Conflict();
    }

    Optional<QualityRecord> state(QualityRecord source) {
        var urls = urls(source);
        return urls.size() == 1 ? store.find(id(source, urls.getFirst()), clock.instant()) : Optional.empty();
    }

    Optional<QualityRecord> confirmation(QualityRecord source, Instant at) {
        var candidate = (QualityRegistry.Candidate) source.payload();
        var urls = urls(source);
        if (candidate.linksOverflow() || urls.size() != 1) { return Optional.empty(); }
        return store.find(id(source, urls.getFirst()), clock.instant())
            .filter(record -> ((QualityRegistry.Candidate) record.payload()).status() == QualityRegistry.Status.COMPLETED)
            .filter(record -> ((QualityRegistry.Candidate) record.payload()).history().stream().anyMatch(value -> !value.confirmedAt().isAfter(at)));
    }

    List<QualityRecord> workRecords(List<QualityRecord> observations) {
        if (observations.size() > 10000) { throw new IllegalArgumentException("Posting observation capacity exceeded"); }
        var known = store.list(new QualityStore.Query(QualityRecord.Kind.POSTING, environment, null, null, null, null, null, 0, 10001), clock.instant());
        var expected = Stream.concat(known.stream().map(QualityRecord::id), observations.stream()
            .flatMap(record -> urls(record).stream().map(url -> id(record, url)))).distinct().limit(10001).count();
        if (expected > 10000) { throw new IllegalArgumentException("Posting confirmation capacity exceeded"); }
        for (var record : observations) {
            var candidate = (QualityRegistry.Candidate) record.payload();
            for (var url : urls(record)) {
                var observed = candidate.links().stream().filter(link -> link.url().equals(url)).findFirst();
                var at = observed.map(QualityPublicLinks.Link::lastSeen).orElse(candidate.lastSeen());
                var existing = store.find(id(record, url), clock.instant());
                if (existing.isEmpty() || ((QualityRegistry.Candidate) existing.orElseThrow().payload()).lastSeen().isBefore(at)) {
                    observe(record, url, at);
                }
            }
        }
        var postings = store.list(new QualityStore.Query(QualityRecord.Kind.POSTING, environment, null, null, null, null, null, 0, 10001), clock.instant());
        if (postings.size() > 10000) { throw new IllegalArgumentException("Posting confirmation capacity exceeded"); }
        return Stream.concat(postings.stream(), observations.stream().filter(record -> urls(record).isEmpty())).toList();
    }
}
