package com.careerform.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.convert.ApplicationConversionService;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.data.mongodb.core.MongoTemplate;

import com.careerform.monitoring.ExternalCallMetrics;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

@DisplayName("발송 방식 설정에 따른 알림 조립")
class PushTransportContextTest {
    private static final VapidTestKeys KEYS = VapidTestKeys.generate();
    private static final String QUEUE_URL = "career-form.notification.push.sqs.queue-url=https://sqs.ap-northeast-2.amazonaws.com/000000000000/synthetic-push";
    private final ApplicationContextRunner runner = new ApplicationContextRunner()
        // 운영 기동과 같이 "60s", "15m" 같은 기간 표기를 읽게 한다.
        .withInitializer(context -> context.getBeanFactory().setConversionService(ApplicationConversionService.getSharedInstance()))
        .withUserConfiguration(Infrastructure.class, NotificationConfiguration.class)
        .withPropertyValues("career-form.notification.enabled=true",
            "career-form.notification.push.vapid.public-key=" + KEYS.publicKey,
            "career-form.notification.push.vapid.private-key=" + KEYS.privateKey,
            "career-form.notification.push.vapid.subject=mailto:synthetic@example.test");

    @Configuration(proxyBeanMethods = false)
    static class Infrastructure {
        @Bean MongoTemplate mongoTemplate() { return mock(MongoTemplate.class); }
        @Bean MeterRegistry meterRegistry() { return new SimpleMeterRegistry(); }
        @Bean ExternalCallMetrics externalCallMetrics(MeterRegistry registry) { return new ExternalCallMetrics(registry); }
        @Bean @Primary NotificationStore memoryNotificationStore() { return new MemoryNotificationStore(); }
        @Bean @Primary WebPushClient fakeWebPushClient() { return new FakeWebPushClient(); }
    }

    @Test
    @DisplayName("기본값은 direct이고 발송기만 뜨며 SQS 클라이언트는 만들지 않는다")
    void defaultsToDirect() {
        runner.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).hasSingleBean(PushDispatcher.class).hasSingleBean(PushDispatchSchedule.class);
            assertThat(context).doesNotHaveBean(PushQueue.class).doesNotHaveBean(PushRelay.class).doesNotHaveBean(PushRelaySchedule.class)
                .doesNotHaveBean(PushWorker.class);
            assertThat(context.getBean(PushTransport.class).mode()).isEqualTo(PushTransport.Mode.DIRECT);
        });
    }

    @Test
    @DisplayName("direct를 명시해도 같고 대소문자를 가리지 않는다")
    void acceptsExplicitDirect() {
        runner.withPropertyValues("career-form.notification.push.transport=DIRECT").run(context -> {
            assertThat(context).hasNotFailed().hasSingleBean(PushDispatcher.class).doesNotHaveBean(PushQueue.class);
        });
    }

    @Test
    @DisplayName("sqs면 릴레이와 워커가 뜨고 발송기는 뜨지 않는다")
    void wiresRelayAndWorkerForSqs() {
        runner.withPropertyValues("career-form.notification.push.transport=sqs", QUEUE_URL).run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context).hasSingleBean(SqsPushQueue.class).hasSingleBean(PushRelay.class).hasSingleBean(PushRelaySchedule.class)
                .hasSingleBean(PushWorker.class);
            assertThat(context).doesNotHaveBean(PushDispatcher.class).doesNotHaveBean(PushDispatchSchedule.class);
            var transport = context.getBean(PushTransport.class);
            assertThat(transport.mode()).isEqualTo(PushTransport.Mode.SQS);
            assertThat(transport.region()).isEqualTo("ap-northeast-2");
            assertThat(transport.queueLease()).hasMinutes(15);
        });
    }

    @Test
    @DisplayName("릴레이만 켠 프로세스와 워커만 켠 프로세스로 나눠 띄울 수 있다")
    void splitsRelayAndWorker() {
        runner.withPropertyValues("career-form.notification.push.transport=sqs", QUEUE_URL, "career-form.notification.push.worker.enabled=false")
            .run(context -> assertThat(context).hasNotFailed().hasSingleBean(PushRelay.class).hasSingleBean(PushRelaySchedule.class)
                .doesNotHaveBean(PushWorker.class));
        runner.withPropertyValues("career-form.notification.push.transport=sqs", QUEUE_URL, "career-form.notification.push.relay.enabled=false")
            .run(context -> assertThat(context).hasNotFailed().hasSingleBean(PushWorker.class).doesNotHaveBean(PushRelay.class)
                .doesNotHaveBean(PushRelaySchedule.class));
    }

    @Test
    @DisplayName("sqs인데 큐 주소가 없거나, 릴레이와 워커를 둘 다 껐거나, 모르는 방식이면 기동이 실패한다")
    void failsFastOnInvalidTransport() {
        runner.withPropertyValues("career-form.notification.push.transport=sqs")
            .run(context -> assertThat(context).hasFailed().getFailure().rootCause().hasMessage("Push SQS queue URL is required"));
        runner.withPropertyValues("career-form.notification.push.transport=sqs", QUEUE_URL, "career-form.notification.push.relay.enabled=false",
                "career-form.notification.push.worker.enabled=false")
            .run(context -> assertThat(context).hasFailed().getFailure().rootCause().hasMessage("Push relay or worker must be enabled"));
        runner.withPropertyValues("career-form.notification.push.transport=kafka")
            .run(context -> assertThat(context).hasFailed().getFailure().rootCause().hasMessage("Invalid push transport"));
        runner.withPropertyValues("career-form.notification.push.transport=")
            .run(context -> assertThat(context).hasFailed().getFailure().rootCause().hasMessage("Invalid push transport"));
    }

    @Test
    @DisplayName("테스트나 다른 조립이 큐를 직접 주면 SQS 클라이언트를 만들지 않는다")
    void usesProvidedQueue() {
        runner.withPropertyValues("career-form.notification.push.transport=sqs", QUEUE_URL)
            .withBean(PushQueue.class, () -> new MemoryPushQueue(java.time.Clock.systemUTC()))
            .run(context -> assertThat(context).hasNotFailed().hasSingleBean(PushQueue.class).doesNotHaveBean(SqsPushQueue.class));
    }

    @Test
    @DisplayName("알림이 꺼져 있으면 방식 설정과 상관없이 아무 것도 뜨지 않는다")
    void wiresNothingWhenDisabled() {
        runner.withPropertyValues("career-form.notification.enabled=false", "career-form.notification.push.transport=sqs", QUEUE_URL)
            .run(context -> assertThat(context).hasNotFailed().doesNotHaveBean(PushTransport.class).doesNotHaveBean(PushQueue.class)
                .doesNotHaveBean(PushWorker.class).doesNotHaveBean(PushDispatcher.class));
    }
}
