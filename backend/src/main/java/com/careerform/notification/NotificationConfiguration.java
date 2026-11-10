package com.careerform.notification;

import java.time.Clock;
import java.time.Duration;
import java.util.Arrays;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.scheduling.annotation.EnableScheduling;

import com.careerform.monitoring.ExternalCallMetrics;

import io.micrometer.core.instrument.MeterRegistry;

/** 공고 구독 알림 조립. career-form.notification.enabled=true일 때만 발송과 API가 뜬다. 발송 방식은 push.transport(direct 기본, sqs)로 고른다. */
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

    /** 방식 값이 direct·sqs가 아니거나 sqs인데 큐 설정이 모자라면 여기서 기동이 멈춘다. */
    @Bean public PushTransport pushTransport(
        @Value("${career-form.notification.push.transport:direct}") String transport,
        @Value("${career-form.notification.push.sqs.queue-url:}") String queueUrl,
        @Value("${career-form.notification.push.sqs.region:ap-northeast-2}") String region,
        @Value("${career-form.notification.push.sqs.endpoint:}") String endpoint,
        @Value("${career-form.notification.push.relay.enabled:true}") String relayEnabled,
        @Value("${career-form.notification.push.worker.enabled:true}") String workerEnabled,
        @Value("${career-form.notification.push.queue-lease:15m}") Duration queueLease) {
        return new PushTransport(PushTransport.parseMode(transport), queueUrl, region, endpoint, PushTransport.parseFlag(relayEnabled, "relay.enabled"),
            PushTransport.parseFlag(workerEnabled, "worker.enabled"), queueLease);
    }

    /**
     * 지금 방식: API 서버 안의 발송기가 주기마다 직접 보낸다.
     * 안쪽 조립 클래스에는 @Configuration을 붙이지 않는다. 붙이면 컴포넌트 스캔이 바깥 조건(알림 켜짐)과 무관하게 따로 읽는다.
     */
    @ConditionalOnProperty(prefix = "career-form.notification.push", name = "transport", havingValue = "direct", matchIfMissing = true)
    static class DirectTransport {
        @Bean PushDispatcher pushDispatcher(NotificationStore store, PushDeliveryExecutor deliveries, PushSettings settings, PushDispatchMetrics metrics) {
            return PushDispatcher.withVirtualThreads(store, deliveries, settings, Clock.systemUTC(), metrics);
        }

        @Bean PushDispatchSchedule pushDispatchSchedule(PushDispatcher dispatcher) { return new PushDispatchSchedule(dispatcher); }
    }

    /** SQS 방식: 릴레이가 큐에 넣고 워커가 꺼내 보낸다. 릴레이와 워커는 설정으로 따로 켜고 끈다. */
    @ConditionalOnProperty(prefix = "career-form.notification.push", name = "transport", havingValue = "sqs")
    static class SqsTransport {
        @Bean @ConditionalOnMissingBean(PushQueue.class) SqsPushQueue pushQueue(PushTransport transport) { return SqsPushQueue.create(transport); }

        @Bean @ConditionalOnProperty(prefix = "career-form.notification.push.relay", name = "enabled", havingValue = "true", matchIfMissing = true)
        PushRelay pushRelay(NotificationStore store, PushQueue queue, PushSettings settings, PushTransport transport, PushDispatchMetrics metrics) {
            return new PushRelay(store, queue, settings, transport.queueLease(), Clock.systemUTC(), metrics);
        }

        @Bean @ConditionalOnProperty(prefix = "career-form.notification.push.relay", name = "enabled", havingValue = "true", matchIfMissing = true)
        PushRelaySchedule pushRelaySchedule(PushRelay relay) { return new PushRelaySchedule(relay); }

        @Bean @ConditionalOnProperty(prefix = "career-form.notification.push.worker", name = "enabled", havingValue = "true", matchIfMissing = true)
        PushWorker pushWorker(NotificationStore store, PushQueue queue, PushDeliveryExecutor deliveries, PushSettings settings, PushDispatchMetrics metrics) {
            return PushWorker.withVirtualThreads(store, queue, deliveries, settings, Clock.systemUTC(), metrics);
        }

        /** 애플리케이션이 다 뜬 뒤에 받기를 시작한다. 컨텍스트가 닫힐 때 워커의 close()가 받기를 멈춘다. */
        @Bean @ConditionalOnProperty(prefix = "career-form.notification.push.worker", name = "enabled", havingValue = "true", matchIfMissing = true)
        ApplicationRunner pushWorkerStart(PushWorker worker) { return arguments -> worker.start(); }
    }

    @Bean public ApplicationRunner notificationIndexes(MongoNotificationStore store) {
        return arguments -> {
            try { store.ensureIndexes(); }
            catch (RuntimeException exception) { log.warn("NOTIFICATION_INDEXES_UNAVAILABLE"); }
        };
    }
}
