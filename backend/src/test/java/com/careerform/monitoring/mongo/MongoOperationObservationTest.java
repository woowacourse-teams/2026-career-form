package com.careerform.monitoring.mongo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import org.springframework.data.mongodb.core.MongoTemplate;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;

class MongoOperationObservationTest {

    @Test
    void proxyObservesActualMongoTemplateMethodAndPreservesResult() {
        var registry = new SimpleMeterRegistry();
        var target = mock(MongoTemplate.class);
        when(target.findById("synthetic-id", String.class)).thenReturn("synthetic-result");
        var proxy = (MongoTemplate) new MongoOperationObservation(new MongoMetrics(registry), "prod").proxy(target);
        assertThat(proxy.findById("synthetic-id", String.class)).isEqualTo("synthetic-result");
        assertThat(registry.get("career.form.mongo.operation").tags("operation", "findById", "outcome", "success")
            .timer().count()).isEqualTo(1);
    }

    @Test
    void recordsOnlyOutermostInvocationAndPreservesReturnAndFailure() throws Throwable {
        var registry = new SimpleMeterRegistry();
        var observer = new MongoOperationObservation(new MongoMetrics(registry), "prod");

        var result = observer.observe("findOne", () -> observer.observe("find", () -> "result"));
        assertThat(result).isEqualTo("result");
        assertThat(registry.get("career.form.mongo.operation").tags("operation", "findOne", "outcome", "success").timer().count()).isEqualTo(1);
        assertThat(registry.get("career.form.mongo.operation").tags("operation", "find", "outcome", "success").timer().count()).isZero();
        var exception = new IllegalArgumentException("private-value");
        assertThatThrownBy(() -> observer.observe("save", () -> { throw exception; })).isSameAs(exception);
        assertThat(registry.get("career.form.mongo.operation").tags("operation", "save", "outcome", "failure").timer().count()).isEqualTo(1);
        observer.observe("findOne", () -> "again");
        assertThat(registry.get("career.form.mongo.operation").tags("operation", "findOne", "outcome", "success").timer().count()).isEqualTo(2);
        observer.observe("findAndReplace", () -> "updated");
        assertThat(registry.get("career.form.mongo.operation").tags("operation", "findAndReplace", "outcome", "success").timer().count()).isEqualTo(1);
        assertThat(MDC.get("dbOperation")).isNull();
    }
}
