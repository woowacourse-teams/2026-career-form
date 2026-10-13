package com.careerform.monitoring.mongo;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

import com.mongodb.MongoExecutionTimeoutException;
import com.mongodb.MongoSocketReadTimeoutException;
import com.mongodb.connection.ConnectionId;
import com.mongodb.event.CommandEvent;
import com.mongodb.event.CommandFailedEvent;
import com.mongodb.event.CommandListener;
import com.mongodb.event.CommandStartedEvent;
import com.mongodb.event.CommandSucceededEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;

public final class MongoCommandMetrics implements CommandListener {

    private static final Logger log = LoggerFactory.getLogger(MongoCommandMetrics.class);
    private static final Set<String> COMMANDS = Set.of("find", "getMore", "insert", "update", "delete",
        "aggregate", "count", "distinct", "findAndModify", "createIndexes", "listIndexes", "listCollections");
    private final MongoMetrics metrics;
    private final String environment;
    private final String database;
    private final Map<Key, Context> pending = new ConcurrentHashMap<>();

    public MongoCommandMetrics(MongoMetrics metrics, String environment) {
        this(metrics, environment, null);
    }

    public MongoCommandMetrics(MongoMetrics metrics, String environment, String database) {
        this.metrics = metrics;
        this.environment = Set.of("dev", "staging", "prod", "local").contains(environment) ? environment : "UNKNOWN";
        this.database = database;
    }

    @Override
    public void commandStarted(CommandStartedEvent event) {
        var requestId = MDC.get("requestId");
        var safeId = requestId != null && requestId.matches("[0-9a-fA-F-]{36}") ? requestId : "none";
        pending.put(key(event), new Context(safeId, command(event), event.getOperationId()));
    }

    @Override
    public void commandSucceeded(CommandSucceededEvent event) {
        complete(event, "success", event.getElapsedTime(TimeUnit.NANOSECONDS), "none");
    }

    @Override
    public void commandFailed(CommandFailedEvent event) {
        var failure = event.getThrowable();
        var timeout = failure instanceof MongoExecutionTimeoutException || failure instanceof MongoSocketReadTimeoutException;
        complete(event, timeout ? "timeout" : "failure", event.getElapsedTime(TimeUnit.NANOSECONDS),
            failure.getClass().getSimpleName().replaceAll("[^a-zA-Z0-9]", ""));
    }

    private void complete(CommandEvent event, String outcome, long nanos, String failure) {
        var previous = pending.remove(key(event));
        var context = previous == null ? new Context("none", command(event), event.getOperationId()) : previous;
        metrics.record("command", "command", context.command(), outcome, nanos);
        log.info("DB_COMMAND env={} db={} command={} outcome={} durationMs={} failure={} requestId={} mongoRequestId={} mongoOperationId={}",
            environment, database != null && database.equals(event.getDatabaseName()) ? environment : "shared",
            context.command(), outcome, TimeUnit.NANOSECONDS.toMillis(nanos), failure,
            context.requestId(), event.getRequestId(), context.operationId());
    }

    private static Key key(CommandEvent event) {
        return new Key(event.getConnectionDescription().getConnectionId(), event.getRequestId());
    }

    private static String command(CommandEvent event) {
        return COMMANDS.contains(event.getCommandName()) ? event.getCommandName() : "OTHER";
    }

    private record Key(ConnectionId connection, int request) {
    }

    private record Context(String requestId, String command, long operationId) {
    }
}
