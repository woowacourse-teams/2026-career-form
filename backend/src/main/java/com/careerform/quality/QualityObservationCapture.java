package com.careerform.quality;

import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

public record QualityObservationCapture(QualityAsyncService.Observation metadata, QualityCapturedSnapshot snapshot) {
    @Override public String toString() { return "QualityObservationCapture[redacted]"; }

    public QualityAsyncService.Observation project(Function<QualityCapturedSnapshot, QualityProjection.Snapshot> projector) {
        var projected = snapshot == null ? null : projector.apply(snapshot);
        var original = metadata.event();
        var reasons = projected == null ? Map.<String, Long>of() : projected.fields().stream().filter(field -> !field.mapped() || !field.eligible())
            .collect(Collectors.toUnmodifiableMap(field -> (field.mapped() ? "WRITE|SERVER_WRITE_UNAVAILABLE|" : "MAPPING|NOT_MAPPED|")
                + field.control(), field -> 1L, Long::sum));
        var event = new QualityCollectionService.RequestEvent(original.operation(), original.status(), original.durationMs(),
            projected == null ? null : projected.counts(), original.calls(), original.routeState(), original.requestId(), original.resultState(), reasons);
        return new QualityAsyncService.Observation(metadata.connection(), metadata.host(), metadata.company(), metadata.greeting(), metadata.route(),
            metadata.policyVersion(), metadata.extension(), metadata.publicLink(), event, projected);
    }
}
