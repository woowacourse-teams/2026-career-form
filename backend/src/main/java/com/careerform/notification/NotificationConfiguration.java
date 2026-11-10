package com.careerform.notification;

import java.time.Clock;
import java.time.Duration;
import java.util.Arrays;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.scheduling.annotation.EnableScheduling;

import com.careerform.monitoring.ExternalCallMetrics;

import io.micrometer.core.instrument.MeterRegistry;

/** 공고 구독 알림 조립. career-form.notification.enabled=true일 때만 발송기와 API가 뜬다. */
@Configuration(proxyBeanMethods = false)
@EnableScheduling
@ConditionalOnProperty(prefix = "career-form.notification", name = "enabled", havingValue = "true")
public class NotificationConfiguration {
    private static final Logger log = LoggerFactory.getLogger(NotificationConfiguration.class);

    @Bean public PushSettings pushSettings(
        @Value("${career-form.notification.push.dispatch-interval:60s}") Duration dispatchInterval,
        @Value("${career-form.notification.push.concurrency:20}") int concurrency,
        @Value("${career-form.notification.push.max-attempts:8}") int maxAttempts,
        @Value("${career-form.notification.push.lease:120s}") Duration lease,
        @Value("${career-form.notification.push.timeout:10s}") Duration timeout,
        @Value("${career-form.notification.push.batch-size:500}") int batchSize,
        @Value("${career-form.notification.push.max-per-cycle:20000}") int maxPerCycle,
        @Value("${career-form.notification.push.allowed-endpoint-hosts:fcm.googleapis.com,jmt17.google.com}") String allowedEndpointHosts) {
        return new PushSettings(dispatchInterval, concurrency, maxAttempts, lease, timeout, batchSize, maxPerCycle,
            Arrays.stream(allowedEndpointHosts.split(",")).collect(Collectors.toUnmodifiableSet()));
    }

    @Bean public VapidKeys vapidKeys(
        @Value("${career-form.notification.push.vapid.public-key:}") String publicKey,
        @Value("${career-form.notification.push.vapid.private-key:}") String privateKey,
        @Value("${career-form.notification.push.vapid.subject:}") String subject) {
        return VapidKeys.parse(publicKey, privateKey, subject);
    }

    @Bean public MongoNotificationStore notificationStore(MongoTemplate mongo) { return new MongoNotificationStore(mongo); }

    /** 분류 파일이 깨져 있으면 예외가 그대로 올라가 기동이 멈춘다. */
    @Bean public JobCategories jobCategories() { return JobCategories.load(); }

    @Bean public JobPostingService jobPostingService(NotificationStore store, JobCategories categories) {
        return new JobPostingService(store, categories, Clock.systemUTC());
    }

    @Bean public PushSubscriptionService pushSubscriptionService(NotificationStore store, JobCategories categories, PushSettings settings) {
        return new PushSubscriptionService(store, categories, Clock.systemUTC(), settings.allowedEndpointHosts());
    }

    @Bean public WebPushClient webPushClient(VapidKeys keys, PushSettings settings) {
        return new ZerodepWebPushClient(keys, settings.timeout(), Clock.systemUTC());
    }

    @Bean public RetryPolicy retryPolicy(PushSettings settings) { return new RetryPolicy(settings.maxAttempts()); }

    @Bean public PushDispatchMetrics pushDispatchMetrics(MeterRegistry meters, ExternalCallMetrics external) {
        return new PushDispatchMetrics(meters, external);
    }

    @Bean public PushDeliveryExecutor pushDeliveryExecutor(NotificationStore store, WebPushClient client, RetryPolicy policy, PushDispatchMetrics metrics) {
        return new PushDeliveryExecutor(store, client, policy, Clock.systemUTC(), metrics);
    }

    @Bean public PushDispatcher pushDispatcher(NotificationStore store, PushDeliveryExecutor deliveries, PushSettings settings, PushDispatchMetrics metrics) {
        return PushDispatcher.withVirtualThreads(store, deliveries, settings, Clock.systemUTC(), metrics);
    }

    @Bean public PushDispatchSchedule pushDispatchSchedule(PushDispatcher dispatcher) { return new PushDispatchSchedule(dispatcher); }

    @Bean public ApplicationRunner notificationIndexes(MongoNotificationStore store) {
        return arguments -> {
            try { store.ensureIndexes(); }
            catch (RuntimeException exception) { log.warn("NOTIFICATION_INDEXES_UNAVAILABLE"); }
        };
    }
}
