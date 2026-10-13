package com.careerform.monitoring.mongo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

class MongoOperationObservationTest {

    @Test
    void recordsOnlyOutermostInvocationAndPreservesReturnAndFailure() throws Throwable {
        var registry = new SimpleMeterRegistry();
        var observer = new MongoOperationObservation(new MongoMetrics(registry), "prod");

        var result = observer.observe("findOne", () -> observer.observe("find", () -> "result"));
        assertThat(result).isEqualTo("result");
        assertThat(registry.get("career.form.mongo.operation").tag("operation", "findOne").timer().count()).isEqualTo(1);
        assertThat(registry.find("career.form.mongo.operation").tag("operation", "find").timer()).isNull();
        var exception = new IllegalArgumentException("private-value");
        assertThatThrownBy(() -> observer.observe("save", () -> { throw exception; })).isSameAs(exception);
        assertThat(registry.get("career.form.mongo.operation").tag("outcome", "failure").timer().count()).isEqualTo(1);
        observer.observe("findOne", () -> "again");
        assertThat(registry.get("career.form.mongo.operation").tag("operation", "findOne").timer().count()).isEqualTo(2);
    }
}
