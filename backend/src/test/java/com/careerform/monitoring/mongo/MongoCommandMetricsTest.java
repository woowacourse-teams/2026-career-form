package com.careerform.monitoring.mongo;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.TimeUnit;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.core.read.ListAppender;
import com.mongodb.ServerAddress;
import com.mongodb.connection.ClusterId;
import com.mongodb.connection.ConnectionDescription;
import com.mongodb.connection.ServerId;
import com.mongodb.event.CommandStartedEvent;
import com.mongodb.event.CommandSucceededEvent;
import com.mongodb.event.CommandFailedEvent;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.bson.BsonDocument;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;

class MongoCommandMetricsTest {

    @Test
    void keepsOriginalRequestContextAcrossCallbacksAndDoesNotLogPayloads() {
        var registry = new SimpleMeterRegistry();
        var listener = new MongoCommandMetrics(new MongoMetrics(registry), "prod");
        var connection = new ConnectionDescription(new ServerId(new ClusterId(), new ServerAddress()));
        var logger = (Logger) LoggerFactory.getLogger(MongoCommandMetrics.class);
        var appender = new ListAppender<ch.qos.logback.classic.spi.ILoggingEvent>();
        appender.start();
        logger.addAppender(appender);
        try {
            MDC.put("requestId", "00000000-0000-0000-0000-000000000001");
            listener.commandStarted(new CommandStartedEvent(null, 1, 10, connection,
                "private-db", "find", BsonDocument.parse("{find:'private-value'}")));
            MDC.put("requestId", "00000000-0000-0000-0000-000000000002");
            listener.commandStarted(new CommandStartedEvent(null, 2, 11, connection,
                "private-db", "find", new BsonDocument()));
            MDC.clear();
            listener.commandSucceeded(new CommandSucceededEvent(null, 1, 10, connection,
                "private-db", "find", BsonDocument.parse("{value:'private-response'}"), 50_000_000));
            listener.commandFailed(new CommandFailedEvent(null, 2, 11, connection,
                "private-db", "find", 80_000_000, new IllegalStateException("private-error")));

            assertThat(registry.get("career.form.mongo.command").tags("command", "find", "outcome", "success").timer()
                .totalTime(TimeUnit.MILLISECONDS)).isEqualTo(50);
            assertThat(registry.get("career.form.mongo.command").tags("command", "find", "outcome", "failure").timer().count()).isEqualTo(1);
            assertThat(appender.list).extracting(event -> event.getFormattedMessage())
                .anySatisfy(message -> assertThat(message).contains("requestId=00000000-0000-0000-0000-000000000001"))
                .anySatisfy(message -> assertThat(message).contains("requestId=00000000-0000-0000-0000-000000000002"))
                .allSatisfy(message -> assertThat(message).doesNotContain("private-"));
        } finally {
            MDC.clear();
            logger.detachAppender(appender);
            appender.stop();
        }
    }
}
