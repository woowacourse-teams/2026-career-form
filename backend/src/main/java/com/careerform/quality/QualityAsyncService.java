package com.careerform.quality;

import java.util.UUID;

import tools.jackson.databind.ObjectMapper;

public final class QualityAsyncService {
    private final QualityRegistration registration;
    private final QualityTaskQueue tasks;
    private final QualityCollectionService collector;
    private final QualityRegistry registry;
    private final java.util.function.Function<QualityCapturedSnapshot, QualityProjection.Snapshot> projector;
    private final ObjectMapper mapper = new ObjectMapper();

    public QualityAsyncService(QualityRegistration registration, QualityTaskQueue tasks, QualityCollectionService collector, QualityRegistry registry) {
        this(registration, tasks, collector, registry, QualityCapturedSnapshot::project);
    }

    QualityAsyncService(QualityRegistration registration, QualityTaskQueue tasks, QualityCollectionService collector, QualityRegistry registry,
                        java.util.function.Function<QualityCapturedSnapshot, QualityProjection.Snapshot> projector) {
        this.projector = projector;
        this.registration = registration;
        this.tasks = tasks;
        this.collector = collector;
        this.registry = registry;
    }

    public record Observation(String connection, String host, String company, boolean greeting, String route,
                              Long policyVersion, String extension, String publicLink,
                              QualityCollectionService.RequestEvent event, QualityProjection.Snapshot snapshot) { }

    public String connection(String run, String key) {
        if (run == null && key == null) { return null; }
        try { return registration.connection(run, key); }
        catch (QualityAdmissionException exception) { return null; }
    }

    public QualityRegistration.Credentials register(QualityRegistration.Input input) {
        return registration.register(input, context -> tasks.submit(bytes(context), () -> {
            collector.register(context.runId(), context.tokenHash(), context.createdAt());
            registration.prepared(context.connection(), null);
            return true;
        }));
    }

    public boolean observeCaptured(java.util.function.Function<QualityCaptureBudget, QualityObservationCapture> capture) {
        return tasks.submitCaptured(limit -> {
            var budget = new QualityCaptureBudget(limit);
            var captured = capture.apply(budget);
            return new QualityTaskQueue.Prepared(budget.bytes(), new java.util.concurrent.Callable<Boolean>() {
                private Observation observation;
                public Boolean call() {
                    if (observation == null) {
                        observation = captured.project(projector);
                        tasks.requireEventSize(bytes(observation));
                    }
                    return collect(observation);
                }
            });
        });
    }

    private boolean collect(Observation observation) {
        var context = observation.connection() == null ? null : registration.find(observation.connection());
        if (observation.connection() != null && context == null) { return false; }
        if (context != null && !context.persisted()) { return false; }
        var snapshot = observation.snapshot();
        var host = observation.host();
        var identity = host.equals("UNKNOWN") ? null : QualitySite.identify(host, observation.company(), observation.greeting(),
            registry != null && snapshot != null && registry.dedicated(host.toLowerCase(java.util.Locale.ROOT), snapshot.structureKey()),
            context == null ? UUID.randomUUID().toString() : context.runId());
        var group = identity == null ? collector.group("UNKNOWN", "UNKNOWN", "UNKNOWN", null, null)
            : collector.group(identity, snapshot == null ? "UNKNOWN" : snapshot.structureKey(), observation.route(),
                observation.policyVersion(), observation.extension(), observation.event().calls());
        if (context == null) {
            collector.observe(group, observation.event(), snapshot, null, null, false, observation.publicLink());
        } else {
            collector.observeRegistered(group, observation.event(), snapshot, context.runId(), context.tokenHash(), observation.publicLink());
            registration.prepared(context.connection(), snapshot == null ? null : snapshot.snapshotKey());
        }
        return true;
    }

    public void report(String runId, String token, QualityCollectionService.Report report) {
        reportBatch(runId, token, java.util.List.of(report));
    }

    public void reportBatch(String runId, String token, java.util.List<QualityCollectionService.Report> reports) {
        QualityReports.validateBatch(reports);
        var eventBytes = reports.size() == 1 ? bytes(reports.getFirst()) : bytes(java.util.Map.of("reports", reports));
        var retained = QualityReports.retainedBytes(reports);
        registration.reportBatch(runId, token, reports.stream().map(QualityCollectionService.Report::eventId).toList(), context -> {
            var pending = reports.stream().filter(report -> !context.events().contains(QualityProjection.digest(report.eventId()))).toList();
            var connection = context.connection();
            return tasks.submit(retained, eventBytes, new java.util.concurrent.Callable<Boolean>() {
                private java.util.List<PendingReport> remaining;
                public Boolean call() {
                    var current = registration.find(connection);
                    if (current == null) { throw new QualityAdmissionException(401); }
                    if (!current.persisted()) { return false; }
                    if (remaining == null) { remaining = pending.stream().map(report -> new PendingReport(report,
                        report.snapshotId() == null ? null : QualityProjection.digest(report.snapshotId()))).toList(); }
                    var ready = remaining.stream().filter(member -> member.snapshotKey() == null || current.snapshots().contains(member.snapshotKey()))
                        .findFirst().orElse(null);
                    if (ready == null) { return false; }
                    collector.reportRegistered(current.runId(), current.tokenHash(), ready.report());
                    remaining = remaining.stream().filter(member -> member != ready).toList();
                    return remaining.isEmpty();
                }
            });
        });
    }

    private record PendingReport(QualityCollectionService.Report report, String snapshotKey) { }

    private int bytes(Object event) { return mapper.writeValueAsBytes(event).length; }
}
