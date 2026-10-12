package com.careerform.quality;

import java.net.URI;
import java.time.Clock;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.UnaryOperator;
import java.util.stream.Stream;

public final class QualityRegistry {
    private final QualityStore store;
    private final Clock clock;
    private final String environment;
    private final QualityPostings postings;

    public QualityRegistry(QualityStore store, Clock clock, String environment) {
        this.store = store;
        this.clock = clock;
        this.environment = environment;
        this.postings = new QualityPostings(store, clock, environment);
    }

    public enum Status { WAITING, REQUESTED, CLAIMED, DEFERRED, COMPLETED }
    public enum DeferReason { LOGIN_REQUIRED, LINK_UNAVAILABLE, SITE_UNAVAILABLE, TIME_REQUIRED, OTHER }
    public static final class Conflict extends RuntimeException {
        public Conflict() { super("Quality candidate changed"); }
    }

    public record Confirmation(long fieldCount, Instant confirmedAt, String publicLink, String confirmedBy) {
        public Confirmation(long fieldCount, Instant confirmedAt, String publicLink) { this(fieldCount, confirmedAt, publicLink, null); }
    }

    public record HostReference(String host, String structure, List<Confirmation> history) {
        public HostReference { history = List.copyOf(history); }
        public Confirmation confirmation() { return history.getLast(); }
    }

    public record Candidate(String id, String homepage, String publicLink, Instant firstSeen, Instant lastSeen,
                            Status status, boolean requested, boolean recheck, String claimOwner, String claimant, Instant claimExpiresAt,
                            DeferReason deferReason, Instant deferredUntil, List<Confirmation> history, List<QualityPublicLinks.Link> links, Boolean linksOverflow) {
        public Candidate {
            history = List.copyOf(history);
            links = links == null ? List.of() : List.copyOf(links);
            linksOverflow = Boolean.TRUE.equals(linksOverflow);
        }
        public Candidate(String id, String homepage, String publicLink, Instant firstSeen, Instant lastSeen,
                         Status status, boolean requested, boolean recheck, String claimOwner, String claimant, Instant claimExpiresAt,
                         DeferReason deferReason, Instant deferredUntil, List<Confirmation> history) {
            this(id, homepage, publicLink, firstSeen, lastSeen, status, requested, recheck, claimOwner, claimant,
                claimExpiresAt, deferReason, deferredUntil, history, List.of(), false);
        }

        public boolean claimedAt(Instant now) { return claimOwner != null && claimExpiresAt != null && now.isBefore(claimExpiresAt); }

        public Status statusAt(Instant now) {
            if (status == Status.CLAIMED && !claimedAt(now)) { return requested ? Status.REQUESTED : Status.WAITING; }
            if (status == Status.DEFERRED && !now.isBefore(deferredUntil)) { return Status.WAITING; }
            if (status == Status.WAITING && requested) { return Status.REQUESTED; }
            return status;
        }
    }

    public Candidate observe(QualityRecord.Group group) {
        return observe(group, clock.instant());
    }

    public Candidate observe(QualityRecord.Group group, Instant observedAt) {
        var id = id(group);
        var now = clock.instant();
        var found = store.find(id, now);
        if (found.isEmpty()) {
            var recheck = listRecords(group.host(), 0, 10001).stream().anyMatch(record -> ((Candidate) record.payload()).status() == Status.COMPLETED);
            var known = group.identity() == QualitySite.Status.MANUAL ? hostReference(group.host(), group.structure()) : Optional.<HostReference>empty();
            var candidate = new Candidate(id, "https://" + group.host() + "/", known.map(value -> value.confirmation().publicLink()).orElse(null), observedAt, observedAt,
                known.isPresent() ? Status.COMPLETED : Status.WAITING,
                false, recheck, null, null, null, null, null, known.map(HostReference::history).orElse(List.of()));
            if (store.insert(new QualityRecord(id, QualityRecord.Kind.CANDIDATE, group, 0, now, null, candidate))) {
                return candidate;
            }
        }
        return update(id, candidate -> new Candidate(candidate.id(), candidate.homepage(), candidate.publicLink(),
            candidate.firstSeen().isBefore(observedAt) ? candidate.firstSeen() : observedAt, candidate.lastSeen().isAfter(observedAt) ? candidate.lastSeen() : observedAt,
            candidate.status(), candidate.requested(), candidate.recheck(), candidate.claimOwner(), candidate.claimant(), candidate.claimExpiresAt(), candidate.deferReason(),
            candidate.deferredUntil(), candidate.history(), candidate.links(), candidate.linksOverflow()));
    }

    public Candidate observe(QualityRecord.Group group, Instant observedAt, String publicLink) {
        var observed = observe(group, observedAt);
        if (QualityPublicLinks.validate(group.host(), publicLink) == null) { return observed; }
        var result = update(observed.id(), candidate -> {
            var links = QualityPublicLinks.observe(candidate.links(), candidate.linksOverflow(), group.host(), publicLink, observedAt);
            return new Candidate(candidate.id(), candidate.homepage(), candidate.publicLink(), candidate.firstSeen(), candidate.lastSeen(),
                candidate.status(), candidate.requested(), candidate.recheck(), candidate.claimOwner(), candidate.claimant(), candidate.claimExpiresAt(),
                candidate.deferReason(), candidate.deferredUntil(), candidate.history(), links.links(), links.overflow());
        });
        postings.observe(record(observed.id()), publicLink, observedAt);
        return result;
    }

    public Candidate claim(String id, String owner) {
        return claim(id, owner, "팀원");
    }

    public Candidate claim(String id, String owner, String name) {
        var claimant = claimantLabel(name);
        return update(id, candidate -> {
            owned(candidate, owner);
            if (candidate.status() == Status.COMPLETED) { throw new Conflict(); }
            var next = copy(candidate, Status.CLAIMED, ownerHash(owner), clock.instant().plusSeconds(86400), null, null, candidate.history(), candidate.publicLink());
            return new Candidate(next.id(), next.homepage(), next.publicLink(), next.firstSeen(), next.lastSeen(), next.status(), next.requested(), next.recheck(),
                next.claimOwner(), claimant, next.claimExpiresAt(), next.deferReason(), next.deferredUntil(), next.history(), next.links(), next.linksOverflow());
        });
    }

    public Candidate release(String id, String owner) {
        var claims = legacyClaims(candidate(id));
        var released = update(id, candidate -> {
            owned(candidate, owner);
            if (candidate.status() == Status.COMPLETED) { throw new Conflict(); }
            return copy(candidate, Status.WAITING, null, null, null, null, candidate.history(), candidate.publicLink());
        });
        for (var claim : claims) { release(claim.id(), owner); }
        return released;
    }

    public Candidate request(String id) {
        return update(id, candidate -> candidate.statusAt(clock.instant()) == Status.WAITING
            ? copy(candidate, Status.REQUESTED, null, null, null, null, candidate.history(), candidate.publicLink()) : candidate);
    }

    public Candidate confirm(String id, String owner, long count, String publicLink) {
        return confirm(id, owner, count, publicLink, false);
    }

    public Candidate confirm(String id, String owner, long count, String publicLink, boolean dedicatedHost) {
        return confirm(id, owner, count, publicLink, dedicatedHost, null);
    }

    public Candidate confirm(String id, String owner, long count, String publicLink, boolean dedicatedHost, String name) {
        if (count < 0 || count > 10000) { throw new IllegalArgumentException("Invalid reference count"); }
        var previous = record(id);
        var link = safeLink(previous.group().host(), publicLink);
        if (previous.kind() == QualityRecord.Kind.POSTING && !((Candidate) previous.payload()).publicLink().equals(link)) {
            throw new IllegalArgumentException("Posting link must match confirmation");
        }
        var confirmation = new Confirmation(count, clock.instant(), link, claimantLabel(name == null ? ((Candidate) previous.payload()).claimant() : name));
        var completed = update(id, candidate -> {
            owned(candidate, owner);
            if (candidate.status() == Status.COMPLETED) { throw new Conflict(); }
            return copy(candidate, Status.COMPLETED, null, null, null, null,
                Stream.concat(candidate.history().stream(), Stream.of(confirmation)).toList(), link == null ? candidate.publicLink() : link);
        });
        store.insert(new QualityRecord("confirmation_" + UUID.randomUUID(), QualityRecord.Kind.CONFIRMATION, previous.group(),
            0, confirmation.confirmedAt(), null, confirmation));
        if (dedicatedHost && previous.kind() == QualityRecord.Kind.CANDIDATE) { saveHostReference(previous.group(), confirmation); }
        return completed;
    }

    public Candidate reopen(String id, String owner) {
        return update(id, candidate -> {
            owned(candidate, owner);
            return copy(candidate, Status.WAITING, null, null, null, null, candidate.history(), candidate.publicLink());
        });
    }

    public Candidate defer(String id, String owner, DeferReason reason, Instant until) {
        var now = clock.instant();
        var target = until == null ? now.plusSeconds(7 * 86400) : until;
        if (reason == null || !target.isAfter(now) || target.isAfter(now.plusSeconds(30 * 86400))) {
            throw new IllegalArgumentException("Invalid deferral");
        }
        var claims = legacyClaims(candidate(id));
        var deferred = update(id, candidate -> {
            owned(candidate, owner);
            if (candidate.status() == Status.COMPLETED) { throw new Conflict(); }
            return copy(candidate, Status.DEFERRED, null, null, reason, target, candidate.history(), candidate.publicLink());
        });
        for (var claim : claims) { defer(claim.id(), owner, reason, target); }
        return deferred;
    }

    public record Reference(Long count, boolean compatible) { }

    public Reference executionReference(QualityRecord.Group group, Instant at, List<QualityCollectionService.SnapshotLink> links) {
        var identities = links.stream().map(QualityCollectionService.SnapshotLink::postingId).filter(java.util.Objects::nonNull).distinct().toList();
        if (identities.isEmpty()) {
            var count = legacyReference(group, at).orElse(null);
            var source = store.find(id(group), clock.instant());
            return new Reference(count, source.map(record -> QualityPostings.urls(record).isEmpty()).orElse(true));
        }
        if (identities.size() != 1) { return new Reference(null, false); }
        var posting = store.find(identities.getFirst(), clock.instant())
            .filter(record -> record.kind() == QualityRecord.Kind.POSTING && record.group().environment().equals(environment));
        var count = posting.map(record -> (Candidate) record.payload()).filter(candidate -> candidate.status() == Status.COMPLETED)
            .flatMap(candidate -> candidate.history().stream().filter(item -> !item.confirmedAt().isAfter(at))
                .max(Comparator.comparing(Confirmation::confirmedAt))).map(Confirmation::fieldCount).orElse(null);
        var compatible = count != null && links.stream().allMatch(link -> identities.getFirst().equals(link.postingId())
            && link.baseline() != null && link.baseline().compatible() && link.baseline().fieldCount() == count);
        return new Reference(count, compatible);
    }

    public Optional<Long> reference(QualityRecord.Group group, Instant at) {
        var source = store.find(id(group), clock.instant());
        var postingState = source.flatMap(postings::state);
        if (postingState.isPresent() && !((Candidate) postingState.orElseThrow().payload()).history().isEmpty()
            && ((Candidate) postingState.orElseThrow().payload()).status() != Status.COMPLETED) { return Optional.empty(); }
        var posting = source.flatMap(record -> postings.confirmation(record, at));
        if (posting.isPresent()) {
            return ((Candidate) posting.orElseThrow().payload()).history().stream().filter(item -> !item.confirmedAt().isAfter(at))
                .max(Comparator.comparing(Confirmation::confirmedAt)).map(Confirmation::fieldCount);
        }
        return legacyReference(group, at);
    }

    private Optional<Long> legacyReference(QualityRecord.Group group, Instant at) {
        if (group.identity() == QualitySite.Status.MANUAL) {
            return hostReference(group.host(), group.structure()).flatMap(reference -> reference.history().stream()
                .filter(item -> !item.confirmedAt().isAfter(at)).reduce((first, next) -> first.confirmedAt().isAfter(next.confirmedAt()) ? first : next).map(Confirmation::fieldCount));
        }
        return store.find(id(group), clock.instant()).map(record -> (Candidate) record.payload())
            .filter(candidate -> !candidate.linksOverflow() && candidate.links().stream().filter(link -> !link.firstSeen().isAfter(at)).count() <= 1)
            .flatMap(candidate -> candidate.history().stream().filter(item -> !item.confirmedAt().isAfter(at) && matchesObservedLink(candidate, item, at))
                .reduce((first, next) -> first.confirmedAt().isAfter(next.confirmedAt()) ? first : next).map(Confirmation::fieldCount));
    }

    private boolean matchesObservedLink(Candidate candidate, Confirmation confirmation, Instant at) {
        var observed = candidate.links().stream().filter(link -> !link.firstSeen().isAfter(at)).findFirst();
        return observed.map(link -> confirmation.publicLink() != null ? confirmation.publicLink().equals(link.url())
            : !link.firstSeen().isAfter(confirmation.confirmedAt())).orElse(true);
    }

    public List<QualityRecord> listRecords(String site, long offset, int limit) {
        return store.list(new QualityStore.Query(QualityRecord.Kind.CANDIDATE, environment, site, null, null, null, null, offset, limit), clock.instant());
    }

    public List<QualityRecord> page(Boolean completed, long offset, int limit) {
        if (limit < 1 || limit > 100 || offset < 0) { throw new IllegalArgumentException("Invalid page"); }
        return store.list(new QualityStore.Query(QualityRecord.Kind.CANDIDATE, environment, null, null, null, null, null, offset, limit + 1, completed), clock.instant());
    }

    public Candidate candidate(String id) { return (Candidate) record(id).payload(); }

    public Instant time() { return clock.instant(); }

    public boolean dedicated(String host, String structure) { return hostReference(host, structure).isPresent(); }

    private Optional<HostReference> hostReference(String host, String structure) {
        return store.find(hostReferenceId(host, structure), clock.instant()).filter(record -> record.payload() instanceof HostReference)
            .map(record -> (HostReference) record.payload());
    }

    private String hostReferenceId(String host, String structure) { return "host_reference_" + QualityProjection.digest(environment + "|" + host + "|" + structure); }

    private void saveHostReference(QualityRecord.Group group, Confirmation confirmation) {
        var id = hostReferenceId(group.host(), group.structure());
        for (var attempt = 0; attempt < 5; attempt++) {
            var previous = store.find(id, clock.instant());
            var history = previous.map(record -> ((HostReference) record.payload()).history()).orElse(List.of());
            var reference = new HostReference(group.host(), group.structure(), Stream.concat(history.stream(), Stream.of(confirmation))
                .distinct().sorted(Comparator.comparing(Confirmation::confirmedAt)).toList());
            if (previous.isEmpty()) {
                if (store.insert(new QualityRecord(id, QualityRecord.Kind.CONFIRMATION, group, 0, clock.instant(), null, reference))) { return; }
            } else if (store.replace(previous.orElseThrow(), previous.orElseThrow().withPayload(reference))) { return; }
        }
        throw new Conflict();
    }

    private Candidate update(String id, UnaryOperator<Candidate> change) {
        for (var attempt = 0; attempt < 5; attempt++) {
            var previous = record(id);
            var next = change.apply((Candidate) previous.payload());
            if (store.replace(previous, previous.withPayload(next))) { return next; }
        }
        throw new Conflict();
    }

    public List<QualityRecord> workRecords() {
        var observations = listRecords(null, 0, 10001);
        var claims = observations.stream().filter(record -> ((Candidate) record.payload()).claimedAt(clock.instant()) || ((Candidate) record.payload()).statusAt(clock.instant()) == Status.REQUESTED)
            .flatMap(record -> QualityPostings.urls(record).stream().map(url -> java.util.Map.entry(QualityPostings.id(record, url), (Candidate) record.payload())))
            .collect(java.util.stream.Collectors.groupingBy(java.util.Map.Entry::getKey,
                java.util.stream.Collectors.mapping(java.util.Map.Entry::getValue, java.util.stream.Collectors.toList())));
        return postings.workRecords(observations).stream().map(record -> display(record, claims.getOrDefault(record.id(), List.of()))).toList();
    }

    public int assignedCount() {
        var work = workRecords();
        return QualityAssignments.count(work, listRecords(null, 0, 10001), clock.instant());
    }

    private List<Candidate> legacyClaims(Candidate candidate) {
        if (!candidate.history().isEmpty() || record(candidate.id()).kind() != QualityRecord.Kind.POSTING) { return List.of(); }
        return listRecords(null, 0, 10001).stream()
            .filter(record -> QualityPostings.urls(record).stream().anyMatch(url -> QualityPostings.id(record, url).equals(candidate.id())))
            .map(record -> (Candidate) record.payload()).filter(value -> value.claimedAt(clock.instant()) || value.statusAt(clock.instant()) == Status.REQUESTED).toList();
    }

    private QualityRecord display(QualityRecord record, List<Candidate> claims) {
        var candidate = (Candidate) record.payload();
        if (record.kind() != QualityRecord.Kind.POSTING || !candidate.history().isEmpty()) { return record; }
        if (claims.isEmpty() || candidate.claimedAt(clock.instant()) || candidate.statusAt(clock.instant()) == Status.DEFERRED) { return record; }
        var owners = claims.stream().filter(value -> value.claimedAt(clock.instant())).map(Candidate::claimOwner).distinct().toList();
        var expiry = claims.stream().map(Candidate::claimExpiresAt).filter(java.util.Objects::nonNull).max(Instant::compareTo).orElse(null);
        var shown = new Candidate(candidate.id(), candidate.homepage(), candidate.publicLink(), candidate.firstSeen(), candidate.lastSeen(),
            owners.isEmpty() ? Status.REQUESTED : Status.CLAIMED, true, candidate.recheck(), owners.isEmpty() ? null : owners.size() == 1 ? owners.getFirst() : "LEGACY_CLAIM_CONFLICT",
            owners.isEmpty() ? null : owners.size() == 1 ? claims.stream().filter(value -> value.claimedAt(clock.instant())).findFirst().orElseThrow().claimant() : "기존 담당 충돌, 해제 후 재확인", expiry,
            candidate.deferReason(), candidate.deferredUntil(), candidate.history(), candidate.links(), candidate.linksOverflow());
        return new QualityRecord(record.id(), record.kind(), record.group(), record.revision(), record.createdAt(), record.expiresAt(), shown);
    }

    QualityRecord record(String id) {
        return store.find(id, clock.instant()).filter(record -> (record.kind() == QualityRecord.Kind.CANDIDATE || record.kind() == QualityRecord.Kind.POSTING)
            && record.group().environment().equals(environment)).orElseThrow(Conflict::new);
    }

    private void owned(Candidate candidate, String owner) {
        if (candidate.claimedAt(clock.instant()) && !candidate.claimOwner().equals(ownerHash(owner))) { throw new Conflict(); }
        if (legacyClaims(candidate).stream().filter(value -> value.claimedAt(clock.instant())).anyMatch(value -> !value.claimOwner().equals(ownerHash(owner)))) { throw new Conflict(); }
        var source = record(candidate.id());
        if (source.kind() == QualityRecord.Kind.CANDIDATE && QualityPostings.urls(source).stream()
            .map(url -> store.find(QualityPostings.id(source, url), clock.instant())).flatMap(Optional::stream)
            .map(record -> (Candidate) record.payload()).filter(value -> value.claimedAt(clock.instant()))
            .anyMatch(value -> !value.claimOwner().equals(ownerHash(owner)))) { throw new Conflict(); }
    }

    private String claimantLabel(String name) {
        var label = name == null || name.isBlank() ? "팀원" : name.trim();
        if (!label.matches("[\\p{L}\\p{N} _.-]{1,40}")) { throw new IllegalArgumentException("Invalid claimant label"); }
        return label;
    }

    private String ownerHash(String owner) {
        if (owner == null || owner.isBlank()) { throw new IllegalArgumentException("Missing claimant"); }
        return QualityProjection.digest(owner);
    }

    private String id(QualityRecord.Group group) {
        return "candidate_" + QualityProjection.digest(group.environment() + "|" + group.site() + "|" + group.structure());
    }

    private Candidate copy(Candidate source, Status status, String owner, Instant claimExpiresAt, DeferReason reason, Instant until,
                           List<Confirmation> history, String publicLink) {
        return new Candidate(source.id(), source.homepage(), publicLink, source.firstSeen(), source.lastSeen(), status,
            status == Status.REQUESTED || (status == Status.CLAIMED || status == Status.WAITING) && source.requested(),
            source.recheck(), owner, status == Status.CLAIMED ? source.claimant() : null, claimExpiresAt, reason, until, history, source.links(), source.linksOverflow());
    }

    private String safeLink(String host, String link) {
        if (link == null || link.isBlank()) { return null; }
        if (link.length() > 1024) { throw new IllegalArgumentException("Invalid public link"); }
        var uri = URI.create(link);
        if (!"https".equals(uri.getScheme()) || !host.equalsIgnoreCase(uri.getHost()) || uri.getUserInfo() != null
            || uri.getRawQuery() != null || uri.getRawFragment() != null || uri.getPort() != -1 && uri.getPort() != 443
            || uri.getRawPath() == null || !uri.getRawPath().matches("/[A-Za-z0-9/_.-]*")
            || Stream.of(uri.getRawPath().split("/")).anyMatch(part -> part.length() > 32 || part.matches("(?i)[0-9a-f]{32}|[0-9a-f-]{36}"))) {
            throw new IllegalArgumentException("Invalid public link");
        }
        return uri.normalize().toASCIIString();
    }
}
