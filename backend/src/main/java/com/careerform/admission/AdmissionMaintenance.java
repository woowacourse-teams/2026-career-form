package com.careerform.admission;

import java.time.Instant;
import org.springframework.scheduling.annotation.Scheduled;
import io.micrometer.core.instrument.MeterRegistry;

public final class AdmissionMaintenance {
    private final MongoInstallStore installs;
    private final MongoUsageStore usage;
    private final MeterRegistry meters;
    public AdmissionMaintenance(MongoInstallStore installs, MongoUsageStore usage, MeterRegistry meters) {
        this.installs = installs; this.usage = usage; this.meters = meters;
    }
    @Scheduled(fixedDelayString = "${career-form.admission.maintenance-ms:30000}")
    public void run() {
        try {
            var now = Instant.now();
            usage.returnExpired(now);
            installs.clearRecoveryCopies(now);
            meters.counter("analysis.admission.maintenance", "outcome", "completed").increment();
        } catch (RuntimeException error) {
            meters.counter("analysis.admission.maintenance", "outcome", "failed").increment();
        }
    }
}
