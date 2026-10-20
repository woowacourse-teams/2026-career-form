package com.careerform.quality;

import java.util.List;
import java.util.Map;

public record QualityReportRequest(String eventId, String snapshotId, Map<String, QualityExecution.ClientState> fields,
                                   QualityExecution.Status finished, Map<String, String> identities,
                                   List<QualityCollectionService.Report> reports) {
    public List<QualityCollectionService.Report> entries() {
        if (reports != null) {
            if (eventId != null || snapshotId != null || fields != null || finished != null || identities != null) {
                throw new QualityAdmissionException(400);
            }
            QualityReports.validateBatch(reports);
            return List.copyOf(reports);
        }
        if (fields == null) { throw new QualityAdmissionException(400); }
        return List.of(new QualityCollectionService.Report(eventId, snapshotId, fields, finished, identities));
    }
    @Override public String toString() { return "QualityReportRequest[redacted]"; }
}
