package com.careerform.quality;

import java.util.UUID;

import tools.jackson.databind.ObjectMapper;

public final class QualityAsyncService {
    private final QualityRegistration registration;
    private final QualityTaskQueue tasks;
    private final QualityCollectionService collector;
    private final QualityRegistry registry;
    private final ObjectMapper mapper = new ObjectMapper();

    public QualityAsyncService(QualityRegistration registration, QualityTaskQueue tasks, QualityCollectionService collector, QualityRegistry registry) {
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

    public boolean observe(Observation observation) { return tasks.submit(bytes(observation), () -> collect(observation)); }

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
        QualityReports.validate(report);
        var retained = bytes(report);
        registration.report(runId, token, report.eventId(), context -> tasks.submit(retained, () -> {
            var current = registration.find(context.connection());
            if (current == null) { throw new QualityAdmissionException(401); }
            if (!current.persisted() || report.snapshotId() != null && !current.snapshots().contains(QualityProjection.digest(report.snapshotId()))) { return false; }
            collector.reportRegistered(current.runId(), current.tokenHash(), report);
            return true;
        }));
    }

    private int bytes(Object event) { return mapper.writeValueAsBytes(event).length; }
}
