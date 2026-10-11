package com.careerform.quality;

import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;

public final class QualitySchedule {
    private final QualityDailyBatch batch;
    private final QualityRepair repair;

    public QualitySchedule(QualityDailyBatch batch, QualityRepair repair) { this.batch = batch; this.repair = repair; }

    @Scheduled(fixedDelayString = "${career-form.quality.batch-poll-ms:60000}", initialDelay = 60000)
    @Scheduled(cron = "0 20 9 * * MON-FRI", zone = "Asia/Seoul")
    public void dispatch() {
        try { batch.dispatch(); }
        catch (RuntimeException exception) { LoggerFactory.getLogger(QualitySchedule.class).warn("QUALITY_BATCH_UNAVAILABLE"); }
    }

    @Scheduled(fixedDelayString = "${career-form.quality.repair-poll-ms:3600000}", initialDelay = 300000)
    public void repair() {
        try { repair.repair(); }
        catch (RuntimeException exception) { LoggerFactory.getLogger(QualitySchedule.class).warn("QUALITY_REPAIR_UNAVAILABLE"); }
    }
}
