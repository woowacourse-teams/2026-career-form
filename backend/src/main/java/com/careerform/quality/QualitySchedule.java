package com.careerform.quality;

import org.springframework.scheduling.annotation.Scheduled;

public final class QualitySchedule {
    private final QualityDailyBatch batch;
    private final QualityRepair repair;
    private final QualityTaskQueue tasks;
    private final QualityDirtySources dirty;
    private final QualityStore store;
    private final QualityRollup rollup;
    private final int batchSize;

    public QualitySchedule(QualityDailyBatch batch, QualityRepair repair, QualityTaskQueue tasks, QualityDirtySources dirty,
                           QualityStore store, QualityRollup rollup, int batchSize) {
        if (batchSize < 1 || batchSize > 1000) { throw new IllegalArgumentException("Invalid quality aggregate batch size"); }
        this.batch = batch; this.repair = repair; this.tasks = tasks; this.dirty = dirty;
        this.store = store; this.rollup = rollup; this.batchSize = batchSize;
    }

    @Scheduled(fixedDelayString = "${career-form.quality.batch-poll-ms:60000}", initialDelay = 60000)
    @Scheduled(cron = "0 20 9 * * MON-FRI", zone = "Asia/Seoul")
    public void dispatch() { tasks.submit(0, () -> { batch.dispatch(); return true; }); }

    @Scheduled(fixedDelayString = "${career-form.quality.repair-poll-ms:60000}", initialDelay = 300000)
    public void repair() { tasks.submit(0, () -> { repair.repair(); return true; }); }

    @Scheduled(fixedDelayString = "${career-form.quality.aggregate-poll-ms:60000}", initialDelay = 60000)
    public void aggregate() {
        tasks.submit(0, () -> {
            dirty.flush(batchSize, id -> {
                store.find(id, java.time.Instant.now()).ifPresent(rollup::observe);
                return true;
            });
            return true;
        });
    }
}
