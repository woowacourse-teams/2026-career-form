package com.careerform.quality;

import java.time.Clock;

import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.mongodb.core.MongoTemplate;

@Configuration(proxyBeanMethods = false)
@org.springframework.scheduling.annotation.EnableScheduling
@ConditionalOnProperty(prefix = "career-form.quality", name = "enabled", havingValue = "true")
public class QualityConfiguration {
    @Bean public QualityRepair qualityRepair(QualityStore store, QualityRegistry registry, QualityRollup rollup,
        @Value("${management.metrics.tags.env:local}") String environment,
        @Value("${career-form.quality.repair-batch-size:16}") int batchSize,
        @Value("${career-form.quality.repair-budget-ms:1000}") long budgetMs) {
        return new QualityRepair(store, registry, rollup, Clock.systemUTC(), environment, batchSize, java.time.Duration.ofMillis(budgetMs));
    }

    @Bean public QualityDailyBatch qualityBatch(QualityStore store, QualityRegistry registry,
        @Value("${management.metrics.tags.env:local}") String environment,
        @Value("${career-form.quality.discord.enabled:false}") boolean enabled,
        @Value("${career-form.quality.discord.environment:prod}") String notificationEnvironment,
        @Value("${career-form.quality.discord.webhook:}") String webhook,
        @Value("${career-form.quality.management-url:}") String managementUrl,
        @Value("${career-form.quality.selection.days:7}") int days,
        @Value("${career-form.quality.selection.minimum-sample:20}") long minimumSample) {
        var configured = enabled && environment.equals(notificationEnvironment) && !webhook.isBlank() && !managementUrl.isBlank();
        QualityDiscord.Sender sender = configured ? new QualityDiscord(webhook)::send : message -> new QualityDiscord.Result(QualityDiscord.Status.NOT_CONFIGURED, null);
        return new QualityDailyBatch(store, registry, Clock.systemUTC(), environment, managementUrl, configured, sender, days, minimumSample);
    }

    @Bean public QualityTaskQueue qualityTasks(io.micrometer.core.instrument.MeterRegistry meters,
        @Value("${career-form.quality.queue-capacity:64}") int capacity,
        @Value("${career-form.quality.retained-bytes:4194304}") long bytes,
        @Value("${career-form.quality.event-bytes:131072}") long eventBytes,
        @Value("${career-form.quality.dependency-ttl-ms:30000}") long lifetime) {
        return new QualityTaskQueue(capacity, bytes, eventBytes, java.time.Duration.ofMillis(lifetime), Clock.systemUTC(), meters);
    }

    @Bean public QualityDirtySources qualityDirtySources(io.micrometer.core.instrument.MeterRegistry meters,
        @Value("${career-form.quality.aggregate-capacity:1024}") int capacity,
        @Value("${career-form.quality.aggregate-ttl-ms:86400000}") long lifetime,
        @Value("${career-form.quality.aggregate-attempts:3}") int attempts) {
        return new QualityDirtySources(capacity, java.time.Duration.ofMillis(lifetime), attempts, Clock.systemUTC(), meters);
    }

    @Bean public QualityAsyncService qualityObservations(QualityTaskQueue tasks, QualityCollectionService collector, QualityRegistry registry,
        io.micrometer.core.instrument.MeterRegistry meters, @Value("${career-form.quality.registration-capacity:256}") int capacity) {
        return new QualityAsyncService(new QualityRegistration(capacity, Clock.systemUTC(), meters), tasks, collector, registry);
    }

    @Bean public QualitySchedule qualitySchedule(QualityDailyBatch batch, QualityRepair repair, QualityTaskQueue tasks,
        QualityDirtySources dirty, QualityStore store, QualityRollup rollup,
        @Value("${career-form.quality.aggregate-batch-size:64}") int batchSize) {
        return new QualitySchedule(batch, repair, tasks, dirty, store, rollup, batchSize);
    }
    @Bean public MongoQualityStore qualityStore(MongoTemplate mongo, io.micrometer.core.instrument.MeterRegistry meters,
        @Value("${management.metrics.tags.env:local}") String environment,
        @Value("${career-form.quality.db-timeout-ms:2000}") long timeoutMs) {
        var bounded = new QualityMongoTemplate(mongo, timeoutMs);
        var observed = new com.careerform.monitoring.mongo.MongoOperationObservation(
            new com.careerform.monitoring.mongo.MongoMetrics(meters), environment).proxy(bounded);
        return new MongoQualityStore((MongoTemplate) observed);
    }

    @Bean public MongoQualitySessions qualitySessions(MongoTemplate mongo) { return new MongoQualitySessions(mongo); }

    @Bean public QualityRegistry qualityRegistry(QualityStore store, @Value("${management.metrics.tags.env:local}") String environment) {
        return new QualityRegistry(store, Clock.systemUTC(), environment);
    }

    @Bean public QualityRollup qualityRollup(QualityStore store, QualityRegistry registry) { return new QualityRollup(store, registry, Clock.systemUTC()); }

    @Bean public QualityStats qualityStats(QualityStore store, @Value("${management.metrics.tags.env:local}") String environment) {
        return new QualityStats(store, Clock.systemUTC(), environment);
    }

    @Bean public QualityCollectionService qualityCollector(QualityStore store, QualityRollup rollup, QualityRegistry registry, QualityDirtySources dirty,
        @Value("${management.metrics.tags.env:local}") String environment,
        @Value("${career-form.quality.version:unknown}") String version) {
        return new QualityCollectionService(store, Clock.systemUTC(), environment, version, rollup, registry, dirty);
    }

    @Bean public QualityAccess qualityAccess(MongoQualitySessions sessions,
        @Value("${career-form.quality.password-hash:}") String passwordHash,
        @Value("${career-form.quality.query-token-hash:}") String queryHash) {
        return new QualityAccess(Clock.systemUTC(), passwordHash, queryHash, sessions);
    }

    @Bean public ApplicationRunner qualityIndexes(MongoQualityStore store, MongoQualitySessions sessions) {
        return arguments -> {
            try { store.ensureIndexes(); sessions.ensureIndexes(); }
            catch (RuntimeException exception) { LoggerFactory.getLogger(QualityConfiguration.class).warn("QUALITY_INDEXES_UNAVAILABLE"); }
        };
    }
}
