package com.careerform.quality;

import java.time.Instant;
import java.util.List;
import java.util.Map;

public record QualityStatsResponse(Instant from, Instant to, List<Row> rows, List<Failure> failures) {
    public QualityStatsResponse { rows = List.copyOf(rows); failures = List.copyOf(failures); }

    public record Dimension(String environment, String site, String host, String siteIdentity,
                            String structure, String route, String version, String dateKst) {
    }

    public record Row(Dimension dimension, long analysisRequests, long executionCount, long reportedExecutions, Double reportingRate,
                      long pending, long unobserved, long cancelled, long deduplicationUnknown, long collected, long mapped, Double mappingRate,
                      long uniqueCollected, long uniqueMapped, long reportedCollected, long reportedMapped,
                      long bound, long attempted, long written, long retained,
                      long inputResultObserved, long inputResultUnobserved, long retentionObserved, long retentionUnobserved,
                      Double bindingRate, Double inputSuccessRate, Double retentionRate, Double collectedRetentionRate,
                      Double observedInputSuccessRate, Double observedRetentionRate,
                      long humanDenominator, long humanExecutions, long unregistered, long scopeMismatch,
                      Double humanCollectedCoverage, Double humanMappedCoverage, Double humanWrittenCoverage, Double humanRetainedCoverage,
                      String humanLabel, String observationLabel, long aiCalls, long aiFailures, long aiTimeouts,
                      Double aiFailureRate, Double aiTimeoutRate, Long analysisP95Ms, long analysisSamples, long analysisOverflow,
                      Long aiP95Ms, long aiSamples, long aiOverflow, Map<String, Long> reasons) {
        public Row { reasons = Map.copyOf(reasons); }
    }

    public record Failure(Dimension dimension, String cohort, String stage, String reason, String control, long count) {
    }
}
