package com.careerform.quality;

public final class QualityReports {
    private QualityReports() { }

    public static void validate(QualityCollectionService.Report report) {
        if (report == null || report.eventId() == null || !report.eventId().matches("[A-Za-z0-9_-]{1,128}")
            || report.snapshotId() != null && report.snapshotId().length() > 256
            || report.fields().size() > 2000 || report.identities().size() > 2000
            || report.snapshotId() == null && (!report.fields().isEmpty() || !report.identities().isEmpty())
            || report.finished() != null && report.finished() != QualityExecution.Status.COMPLETED && report.finished() != QualityExecution.Status.CANCELLED
            || report.fields().entrySet().stream().anyMatch(entry -> entry.getKey().length() > 256 || entry.getValue() == null)
            || report.identities().entrySet().stream().anyMatch(entry -> entry.getKey().length() > 256 || entry.getValue() == null
                || entry.getValue().length() > 2048 || !entry.getValue().matches("e[1-9]\\d{0,7}(?:\\.e[1-9]\\d{0,7}){0,99}"))) {
            throw new QualityAdmissionException(400);
        }
    }
}
