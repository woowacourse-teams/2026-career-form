package com.careerform.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("발송 방식 설정")
class PushTransportTest {
    private static final String QUEUE = "https://sqs.ap-northeast-2.amazonaws.com/000000000000/synthetic-push";

    @Test
    @DisplayName("direct는 큐 설정 없이 만들 수 있다")
    void directNeedsNoQueue() {
        var transport = PushTransport.direct();
        assertThat(transport.mode()).isEqualTo(PushTransport.Mode.DIRECT);
        assertThat(transport.queueUrl()).isNull();
        assertThat(new PushTransport(PushTransport.Mode.DIRECT, " ", "", null, false, false, Duration.ofMinutes(15)).region()).isNull();
    }

    @Test
    @DisplayName("sqs는 http(s) 큐 주소와 리전이 있어야 하고 빈 값은 없는 값으로 본다")
    void sqsRequiresQueueAndRegion() {
        var transport = new PushTransport(PushTransport.Mode.SQS, " " + QUEUE + " ", "ap-northeast-2", " ", true, false, Duration.ofMinutes(15));
        assertThat(transport.queueUrl()).isEqualTo(QUEUE);
        assertThat(transport.endpoint()).isNull();
        assertThatThrownBy(() -> new PushTransport(PushTransport.Mode.SQS, "", "ap-northeast-2", null, true, true, Duration.ofMinutes(15)))
            .hasMessage("Push SQS queue URL is required");
        assertThatThrownBy(() -> new PushTransport(PushTransport.Mode.SQS, "synthetic-push", "ap-northeast-2", null, true, true, Duration.ofMinutes(15)))
            .hasMessage("Push SQS queue URL is required");
        assertThatThrownBy(() -> new PushTransport(PushTransport.Mode.SQS, QUEUE, " ", null, true, true, Duration.ofMinutes(15)))
            .hasMessage("Push SQS region is required");
        assertThatThrownBy(() -> new PushTransport(PushTransport.Mode.SQS, QUEUE, "ap-northeast-2", "elasticmq:9324", true, true, Duration.ofMinutes(15)))
            .hasMessage("Invalid push SQS endpoint");
        assertThatThrownBy(() -> new PushTransport(PushTransport.Mode.SQS, QUEUE, "ap-northeast-2", null, false, false, Duration.ofMinutes(15)))
            .hasMessage("Push relay or worker must be enabled");
    }

    @Test
    @DisplayName("큐 리스는 1분에서 12시간 사이다")
    void boundsQueueLease() {
        assertThatThrownBy(() -> new PushTransport(PushTransport.Mode.DIRECT, null, null, null, true, true, Duration.ofSeconds(59)))
            .hasMessage("Invalid push queue lease");
        assertThatThrownBy(() -> new PushTransport(PushTransport.Mode.DIRECT, null, null, null, true, true, Duration.ofHours(13)))
            .hasMessage("Invalid push queue lease");
    }

    @Test
    @DisplayName("방식 값은 대소문자를 가리지 않는 direct와 sqs만 받는다")
    void parsesMode() {
        assertThat(PushTransport.parseMode("direct")).isEqualTo(PushTransport.Mode.DIRECT);
        assertThat(PushTransport.parseMode("SQS")).isEqualTo(PushTransport.Mode.SQS);
        for (var invalid : new String[] {null, "", " sqs", "kafka"}) {
            assertThatThrownBy(() -> PushTransport.parseMode(invalid)).hasMessage("Invalid push transport");
        }
    }
}
