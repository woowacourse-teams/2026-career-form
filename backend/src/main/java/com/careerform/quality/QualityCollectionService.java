package com.careerform.quality;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public final class QualityCollectionService {
    private final QualityStore store;
    private final Clock clock;
    private final String environment;
    private final String buildVersion;
    private final QualityRollup rollup;
    private final QualityRegistry registry;
    private final SecureRandom random = new SecureRandom();

    public QualityCollectionService(QualityStore store, Clock clock, String environment, String buildVersion) {
        this(store, clock, environment, buildVersion, null, null);
    }

    public QualityCollectionService(QualityStore store, Clock clock, String environment, String buildVersion, QualityRollup rollup, QualityRegistry registry) {
        this.store = store;
        this.clock = clock;
        this.environment = environment;
        this.buildVersion = buildVersion;
        this.rollup = rollup;
        this.registry = registry;
    }

    public record AiCall(String provider, String operation, String outcome, long durationMs, String modelVersion) {
        public AiCall(String provider, String operation, String outcome, long durationMs) {
            this(provider, operation, outcome, durationMs, "UNKNOWN");
        }
    }

    public record RequestEvent(String operation, int status, long durationMs, QualityMetrics.Counts counts, List<AiCall> calls,
                               String routeState, String requestId, String resultState, Map<String, Long> reasons,
                               String runId, String snapshotKey, String linkage) {
        public RequestEvent(String operation, int status, long durationMs, QualityMetrics.Counts counts, List<AiCall> calls,
                            String routeState, String requestId, String resultState, Map<String, Long> reasons) {
            this(operation, status, durationMs, counts, calls, routeState, requestId, resultState, reasons, null, null, "UNKNOWN");
        }
        public RequestEvent(String operation, int status, long durationMs, QualityMetrics.Counts counts, List<AiCall> calls) {
            this(operation, status, durationMs, counts, calls, "UNKNOWN", null, "UNKNOWN", Map.of());
        }
        public RequestEvent(String operation, int status, long durationMs, QualityMetrics.Counts counts, List<AiCall> calls,
                            String routeState, String requestId) {
            this(operation, status, durationMs, counts, calls, routeState, requestId, "UNKNOWN", Map.of());
        }
        public RequestEvent {
            calls = List.copyOf(calls);
            reasons = Map.copyOf(reasons);
        }
        RequestEvent linked(String run, QualityProjection.Snapshot snapshot, String state) {
            return new RequestEvent(operation, status, durationMs, counts, calls, routeState, requestId, resultState, reasons,
                run, snapshot == null ? null : snapshot.snapshotKey(), state);
        }
    }

    public record Receipt(String runId, String token) {
        @Override
        public String toString() { return "Receipt[redacted]"; }
    }

    public record SnapshotLink(QualityRecord.Group group, Map<String, String> aliases, Map<String, String> controls, boolean identityVerified) {
        public SnapshotLink(QualityRecord.Group group, Map<String, String> aliases, Map<String, String> controls) { this(group, aliases, controls, false); }
        public SnapshotLink {
            aliases = Map.copyOf(aliases);
            controls = Map.copyOf(controls);
        }
    }

    public record Run(String tokenHash, QualityExecution execution, Map<String, SnapshotLink> snapshots, boolean scopeMismatch) {
        public Run {
            snapshots = Map.copyOf(snapshots);
        }
    }

    public record Report(String eventId, String snapshotId, Map<String, QualityExecution.ClientState> fields,
                         QualityExecution.Status finished, Map<String, String> identities) {
        public Report(String eventId, String snapshotId, Map<String, QualityExecution.ClientState> fields, QualityExecution.Status finished) {
            this(eventId, snapshotId, fields, finished, Map.of());
        }
        public Report {
            fields = Map.copyOf(fields);
            identities = identities == null ? Map.of() : Map.copyOf(identities);
        }
    }

    public QualityRecord.Group group(String site, String structure, String route, Long policyVersion, String extensionVersion) {
        var extension = extensionVersion != null && extensionVersion.matches("[0-9]{1,5}(?:\\.[0-9]{1,5}){0,3}") ? extensionVersion : "UNKNOWN";
        return new QualityRecord.Group(environment, site, structure, route,
            buildVersion + ":policy=" + (policyVersion == null ? "none" : policyVersion) + ":extension=" + extension);
    }

    public QualityRecord.Group group(QualitySite site, String structure, String route, Long policyVersion, String extensionVersion) {
        return group(site, structure, route, policyVersion, extensionVersion, QualityScope.current().map(QualityScope::calls).orElse(List.of()));
    }

    public QualityRecord.Group group(QualitySite site, String structure, String route, Long policyVersion, String extensionVersion, List<AiCall> calls) {
        var base = group(site.siteId(), structure, route, policyVersion, extensionVersion);
        var versions = calls.stream().map(call -> call.provider() + "." + call.operation() + "=" + call.modelVersion())
            .distinct().sorted().collect(Collectors.joining(","));
        var models = versions.isEmpty() ? "NOT_CALLED" : versions;
        return new QualityRecord.Group(base.environment(), base.site(), base.structure(), base.route(),
            "quality-v1:collector-v1:" + base.version() + ":models=" + models, site.host(), site.status());
    }

    public Receipt observe(QualityRecord.Group group, RequestEvent event, QualityProjection.Snapshot snapshot,
                           String runId, String token, boolean reportingCapable) {
        try {
            return observeLinked(group, event, snapshot, runId, token, reportingCapable);
        } catch (IllegalArgumentException exception) {
            var now = clock.instant();
            insert(new QualityRecord("request_" + UUID.randomUUID(), QualityRecord.Kind.REQUEST, group, 0, now,
                now.plusSeconds(30L * 86400), event.linked(null, snapshot, "REJECTED")));
            throw exception;
        }
    }

    private Receipt observeLinked(QualityRecord.Group group, RequestEvent event, QualityProjection.Snapshot snapshot,
                                  String runId, String token, boolean reportingCapable) {
        var now = clock.instant();
        if (reportingCapable && runId != null) {
            var previous = owned(runId, token);
            if (!previous.group().host().equals(group.host())) { throw unavailable(); }
            if (group.identity() == QualitySite.Status.UNVERIFIED && previous.group().identity() == QualitySite.Status.UNVERIFIED) {
                group = group.withSite(previous.group().site());
            } else if (!previous.group().site().equals(group.site()) && !((Run) previous.payload()).snapshots().isEmpty()
                && !((Run) previous.payload()).snapshots().values().stream().map(link -> link.group().site()).toList().contains(group.site())) { throw unavailable(); }
        }
        if (!reportingCapable) {
            insert(new QualityRecord("request_" + UUID.randomUUID(), QualityRecord.Kind.REQUEST, group, 0, now,
                now.plusSeconds(30L * 86400), event.linked(null, snapshot, "LEGACY")));
            return null;
        }
        if (runId == null && token == null) {
            var bytes = new byte[32];
            random.nextBytes(bytes);
            var receipt = new Receipt(UUID.randomUUID().toString().replace("-", ""), HexFormat.of().formatHex(bytes));
            var run = attach(new Run(QualityProjection.digest(receipt.token()), QualityExecution.start(now, Map.of()), Map.of(), false), snapshot, group);
            if (!insert(new QualityRecord(receipt.runId(), QualityRecord.Kind.EXECUTION, group, 0, now,
                now.plusSeconds(30L * 86400), run))) {
                throw unavailable();
            }
            insert(new QualityRecord("request_" + UUID.randomUUID(), QualityRecord.Kind.REQUEST, group, 0, now,
                now.plusSeconds(30L * 86400), event.linked(receipt.runId(), snapshot, "VALIDATED")));
            return receipt;
        }
        for (var attempt = 0; attempt < 5; attempt++) {
            var previous = owned(runId, token);
            if (!previous.group().host().equals(group.host())) {
                throw unavailable();
            }
            var next = attach((Run) previous.payload(), snapshot, group);
            var changed = previous.withPayload(next);
            if (store.replace(previous, changed)) {
                maintain(changed);
                insert(new QualityRecord("request_" + UUID.randomUUID(), QualityRecord.Kind.REQUEST, group, 0, now,
                    now.plusSeconds(30L * 86400), event.linked(runId, snapshot, "VALIDATED")));
                return new Receipt(runId, token);
            }
        }
        throw unavailable();
    }

    public void report(String runId, String token, Report report) {
        for (var attempt = 0; attempt < 5; attempt++) {
            var previous = owned(runId, token);
            var original = (Run) previous.payload();
            if (report.eventId() != null && original.execution().events().contains(QualityProjection.digest(report.eventId()))) {
                maintain(previous);
                return;
            }
            var run = QualityCorrespondence.apply(original, report.snapshotId(), report.identities(), clock.instant());
            var link = report.snapshotId() == null ? null : run.snapshots().get(QualityProjection.digest(report.snapshotId()));
            if (report.fields().size() > 2000 || (link == null && (report.snapshotId() != null || !report.fields().isEmpty()))) {
                throw unavailable();
            }
            var updates = report.fields().entrySet().stream().collect(Collectors.toUnmodifiableMap(entry -> {
                var alias = link.aliases().get(QualityProjection.digest(report.snapshotId() + "|" + entry.getKey()));
                if (alias == null) {
                    throw unavailable();
                }
                return alias;
            }, Map.Entry::getValue));
            var execution = run.execution().report(report.eventId(), updates, report.finished(), clock.instant());
            var changed = previous.withPayload(new Run(run.tokenHash(), execution, run.snapshots(), run.scopeMismatch()));
            if (execution == run.execution() && run == previous.payload() || store.replace(previous, changed)) {
                maintain(execution == run.execution() ? previous : changed);
                return;
            }
        }
        throw unavailable();
    }

    private QualityRecord owned(String runId, String token) {
        if (runId == null || !runId.matches("[0-9a-f]{32}") || token == null || !token.matches("[0-9a-f]{64}")) {
            throw unavailable();
        }
        var record = store.find(runId, clock.instant()).filter(item -> item.kind() == QualityRecord.Kind.EXECUTION).orElseThrow(this::unavailable);
        var run = (Run) record.payload();
        if (!QualityRetention.reportAllowed(record.createdAt(), clock.instant())
            || !MessageDigest.isEqual(run.tokenHash().getBytes(StandardCharsets.US_ASCII),
                QualityProjection.digest(token).getBytes(StandardCharsets.US_ASCII))) {
            throw unavailable();
        }
        return record;
    }

    private Run attach(Run run, QualityProjection.Snapshot snapshot, QualityRecord.Group group) {
        if (snapshot == null) {
            return run;
        }
        if (snapshot.fields().size() > 2000 || run.snapshots().size() >= 200) {
            throw unavailable();
        }
        var prefix = QualityProjection.digest(group.toString()) + ":" + snapshot.snapshotKey() + ":";
        var recorded = run.snapshots().get(snapshot.snapshotKey());
        if (recorded != null && recorded.identityVerified()) {
            if (!recorded.group().equals(group) || !recorded.aliases().keySet().equals(snapshot.fields().stream().map(QualityProjection.Field::key).collect(Collectors.toSet()))) {
                throw unavailable();
            }
            return run;
        }
        var aliases = snapshot.fields().stream().collect(Collectors.toUnmodifiableMap(QualityProjection.Field::key,
            field -> prefix + field.position()));
        var controls = snapshot.fields().stream().collect(Collectors.toUnmodifiableMap(field -> prefix + field.position(), QualityProjection.Field::control));
        var link = new SnapshotLink(group, aliases, controls);
        var existing = run.snapshots().get(snapshot.snapshotKey());
        if (existing != null && !existing.equals(link)) {
            throw unavailable();
        }
        var snapshotFields = snapshot.fields().stream().collect(Collectors.toUnmodifiableMap(field -> prefix + field.position(), field -> {
            var prior = run.execution().fields().get(prefix + field.position());
            return new QualityExecution.Field(field.mapped() || (prior != null && prior.mapped()),
                field.eligible() || (prior != null && prior.eligible()), prior == null ? null : prior.progress(), prior != null && prior.observed());
        }));
        var fields = Stream.concat(run.execution().fields().entrySet().stream().filter(entry -> !snapshotFields.containsKey(entry.getKey())),
            snapshotFields.entrySet().stream()).collect(Collectors.toUnmodifiableMap(Map.Entry::getKey, Map.Entry::getValue));
        if (fields.size() > 2000) {
            throw unavailable();
        }
        var snapshots = Stream.concat(run.snapshots().entrySet().stream().filter(entry -> !entry.getKey().equals(snapshot.snapshotKey())),
            Stream.of(Map.entry(snapshot.snapshotKey(), link))).collect(Collectors.toUnmodifiableMap(Map.Entry::getKey, Map.Entry::getValue));
        return new Run(run.tokenHash(), new QualityExecution(run.execution().startedAt(), clock.instant(), fields,
            run.execution().events(), run.execution().terminal()), snapshots,
            snapshots.values().stream().map(value -> value.group().structure()).distinct().count() > 1);
    }

    private IllegalArgumentException unavailable() {
        return new IllegalArgumentException("Quality observation unavailable");
    }

    private boolean insert(QualityRecord record) {
        var inserted = store.insert(record);
        if (inserted) { maintain(record); }
        return inserted;
    }

    private void maintain(QualityRecord record) {
        try {
            if (registry != null && record.kind() == QualityRecord.Kind.REQUEST
                && ((RequestEvent) record.payload()).counts() != null && !record.group().structure().equals("UNKNOWN")) { registry.observe(record.group(), record.createdAt()); }
            if (rollup != null) { rollup.observe(record); }
        } catch (RuntimeException exception) {
            org.slf4j.LoggerFactory.getLogger(QualityCollectionService.class).warn("QUALITY_DERIVED_OBSERVATION_UNAVAILABLE");
        }
    }
}
