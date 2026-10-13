package com.careerform.monitoring.mongo;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.TimeUnit;

import com.mongodb.ServerAddress;
import com.mongodb.connection.ClusterId;
import com.mongodb.connection.ConnectionId;
import com.mongodb.connection.ConnectionPoolSettings;
import com.mongodb.connection.ServerId;
import com.mongodb.event.ConnectionCheckOutFailedEvent;
import com.mongodb.event.ConnectionCheckedInEvent;
import com.mongodb.event.ConnectionCheckedOutEvent;
import com.mongodb.event.ConnectionCreatedEvent;
import com.mongodb.event.ConnectionReadyEvent;
import com.mongodb.event.ConnectionPoolClosedEvent;
import com.mongodb.event.ConnectionPoolCreatedEvent;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

class MongoPoolMetricsTest {

    @Test
    void measuresInUseSeparatelyFromIdleAndUsesActualMaximum() {
        var registry = new SimpleMeterRegistry();
        var listener = new MongoPoolMetrics(new MongoMetrics(registry));
        var server = new ServerId(new ClusterId(), new ServerAddress());
        var connection = new ConnectionId(server);
        listener.connectionPoolCreated(new ConnectionPoolCreatedEvent(server,
            ConnectionPoolSettings.builder().maxSize(12).build()));
        listener.connectionCreated(new ConnectionCreatedEvent(connection));
        assertThat(registry.get("career.form.mongo.pool.idle").gauge().value()).isZero();
        listener.connectionReady(new ConnectionReadyEvent(connection, 1));
        listener.connectionCheckedOut(new ConnectionCheckedOutEvent(connection, 4, 200_000_000));

        assertThat(registry.get("career.form.mongo.pool.in.use").gauge().value()).isEqualTo(1);
        assertThat(registry.get("career.form.mongo.pool.idle").gauge().value()).isZero();
        assertThat(registry.get("career.form.mongo.pool.max").gauge().value()).isEqualTo(12);
        assertThat(registry.get("career.form.mongo.checkout").tag("outcome", "success").timer().totalTime(TimeUnit.MILLISECONDS)).isEqualTo(200);

        listener.connectionCheckedIn(new ConnectionCheckedInEvent(connection, 4));
        assertThat(registry.get("career.form.mongo.pool.in.use").gauge().value()).isZero();
        assertThat(registry.get("career.form.mongo.pool.idle").gauge().value()).isEqualTo(1);
    }

    @Test
    void isolatesPoolsCountsTimeoutsAndMarksClosedPoolUnavailable() {
        var registry = new SimpleMeterRegistry();
        var listener = new MongoPoolMetrics(new MongoMetrics(registry));
        var first = new ServerId(new ClusterId(), new ServerAddress());
        var second = new ServerId(new ClusterId(), new ServerAddress());
        for (var server : new ServerId[] { first, second }) {
            listener.connectionPoolCreated(new ConnectionPoolCreatedEvent(server,
                ConnectionPoolSettings.builder().maxSize(10).build()));
        }
        listener.connectionCheckOutFailed(new ConnectionCheckOutFailedEvent(first, 3,
            ConnectionCheckOutFailedEvent.Reason.TIMEOUT, 1_000_000_000));
        listener.connectionPoolClosed(new ConnectionPoolClosedEvent(first));

        assertThat(registry.get("career.form.mongo.pool.available").gauges())
            .extracting(gauge -> gauge.value()).containsExactlyInAnyOrder(0.0, 1.0);
        assertThat(registry.get("career.form.mongo.checkout.timeouts").counters())
            .extracting(counter -> counter.count()).containsExactlyInAnyOrder(1.0, 0.0);
        assertThat(registry.get("career.form.mongo.checkout").tags("outcome", "timeout").timers()
            .stream().mapToLong(timer -> timer.count()).sum()).isEqualTo(1);
    }
}
