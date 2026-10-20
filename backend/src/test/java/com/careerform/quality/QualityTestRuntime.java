package com.careerform.quality;

import java.time.Clock;
import java.time.Duration;
import java.util.IdentityHashMap;
import java.util.Map;

import org.junit.jupiter.api.extension.AfterEachCallback;
import org.junit.jupiter.api.extension.ExtensionContext;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

final class QualityTestRuntime implements AfterEachCallback {
    private final SimpleMeterRegistry meters = new SimpleMeterRegistry();
    private final QualityTaskQueue tasks = new QualityTaskQueue(64, 4194304, 131072, Duration.ofSeconds(30), Clock.systemUTC(), meters);
    private final Map<QualityCollectionService, QualityAsyncService> observations = new IdentityHashMap<>();

    QualityAsyncService service(QualityCollectionService collector, QualityRegistry registry) {
        return observations.computeIfAbsent(collector, ignored -> new QualityAsyncService(new QualityRegistration(256, Clock.systemUTC(), meters), tasks, collector, registry));
    }

    void await() {
        org.awaitility.Awaitility.await().atMost(Duration.ofSeconds(3)).until(() -> tasks.active() == 0 && tasks.waiting() == 0);
    }

    @Override public void afterEach(ExtensionContext context) { tasks.close(); meters.close(); }
}
