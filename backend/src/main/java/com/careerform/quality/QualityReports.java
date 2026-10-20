package com.careerform.quality;

public final class QualityReports {
    private QualityReports() { }

    public static long retainedBytes(java.util.List<QualityCollectionService.Report> reports) {
        var budget = new QualityCaptureBudget(Long.MAX_VALUE);
        for (var report : reports) {
            budget.retain(512);
            budget.text(report.eventId(), 128);
            budget.text(report.snapshotId(), 256);
            report.fields().forEach((id, state) -> { budget.retain(512); budget.text(id, 256); });
            report.identities().forEach((id, identity) -> { budget.retain(256); budget.text(id, 256); budget.text(identity, 2048); });
        }
        return budget.bytes();
    }

    public static void validateBatch(java.util.List<QualityCollectionService.Report> reports) {
        if (reports == null || reports.isEmpty() || reports.size() > 200) { throw new QualityAdmissionException(400); }
        reports.forEach(QualityReports::validate);
        if (reports.stream().map(QualityCollectionService.Report::eventId).distinct().count() != reports.size()
            || reports.subList(0, reports.size() - 1).stream().anyMatch(report -> report.finished() != null)) {
            throw new QualityAdmissionException(400);
        }
    }

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
