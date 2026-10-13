package com.careerform.monitoring.mongo;

import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.ToDoubleFunction;

import com.mongodb.connection.ConnectionId;
import com.mongodb.connection.ServerId;
import com.mongodb.event.ConnectionCheckOutFailedEvent;
import com.mongodb.event.ConnectionCheckedInEvent;
import com.mongodb.event.ConnectionCheckedOutEvent;
import com.mongodb.event.ConnectionClosedEvent;
import com.mongodb.event.ConnectionReadyEvent;
import com.mongodb.event.ConnectionPoolClosedEvent;
import com.mongodb.event.ConnectionPoolCreatedEvent;
import com.mongodb.event.ConnectionPoolListener;
import io.micrometer.core.instrument.Gauge;

public final class MongoPoolMetrics implements ConnectionPoolListener {

    private final MongoMetrics metrics;
    private final Map<ServerId, State> states = new ConcurrentHashMap<>();
    private final AtomicInteger sequence = new AtomicInteger();

    public MongoPoolMetrics(MongoMetrics metrics) {
        this.metrics = metrics;
    }

    @Override
    public void connectionPoolCreated(ConnectionPoolCreatedEvent event) {
        var server = event.getServerId();
        var name = Integer.toString(sequence.incrementAndGet());
        states.put(server, new State(name, event.getSettings().getMaxSize(), Set.of(), 0, true));
        gauge("in.use", server, State::inUse);
        gauge("idle", server, state -> Math.max(0, state.ready().size() - state.inUse()));
        gauge("max", server, State::maximum);
        gauge("available", server, state -> state.open() ? 1 : 0);
        metrics.registry().counter("career.form.mongo.checkout.timeouts", "pool", name);
        metrics.registry().counter("career.form.mongo.checkout.failures", "pool", name);
        metrics.initialize("checkout", "pool", name, "success", "timeout", "failure");
    }

    private void gauge(String suffix, ServerId server, ToDoubleFunction<State> value) {
        Gauge.builder("career.form.mongo.pool." + suffix, states,
            current -> value.applyAsDouble(current.get(server)))
            .tag("pool", states.get(server).name()).strongReference(true).register(metrics.registry());
    }

    @Override
    public void connectionReady(ConnectionReadyEvent event) {
        var connection = event.getConnectionId();
        states.computeIfPresent(connection.getServerId(), (server, state) -> new State(state.name(), state.maximum(),
            Stream.concat(state.ready().stream(), Stream.of(connection)).collect(Collectors.toUnmodifiableSet()),
            state.inUse(), state.open()));
    }

    @Override
    public void connectionClosed(ConnectionClosedEvent event) {
        var connection = event.getConnectionId();
        states.computeIfPresent(connection.getServerId(), (server, state) -> new State(state.name(), state.maximum(),
            state.ready().stream().filter(ready -> !ready.equals(connection)).collect(Collectors.toUnmodifiableSet()),
            state.inUse(), state.open()));
    }

    @Override
    public void connectionCheckedOut(ConnectionCheckedOutEvent event) {
        var server = event.getConnectionId().getServerId();
        update(server, 1);
        record(server, "success", event.getElapsedTime(TimeUnit.NANOSECONDS));
    }

    @Override
    public void connectionCheckedIn(ConnectionCheckedInEvent event) {
        update(event.getConnectionId().getServerId(), -1);
    }

    @Override
    public void connectionCheckOutFailed(ConnectionCheckOutFailedEvent event) {
        var state = states.get(event.getServerId());
        if (state == null) {
            return;
        }
        var timeout = event.getReason() == ConnectionCheckOutFailedEvent.Reason.TIMEOUT;
        metrics.registry().counter("career.form.mongo.checkout.failures", "pool", state.name()).increment();
        if (timeout) {
            metrics.registry().counter("career.form.mongo.checkout.timeouts", "pool", state.name()).increment();
        }
        record(event.getServerId(), timeout ? "timeout" : "failure", event.getElapsedTime(TimeUnit.NANOSECONDS));
    }

    @Override
    public void connectionPoolClosed(ConnectionPoolClosedEvent event) {
        states.computeIfPresent(event.getServerId(), (server, state) ->
            new State(state.name(), state.maximum(), state.ready(), state.inUse(), false));
    }

    private void update(ServerId server, int inUse) {
        states.computeIfPresent(server, (key, state) -> new State(state.name(), state.maximum(),
            state.ready(), Math.max(0, state.inUse() + inUse), state.open()));
    }

    private void record(ServerId server, String outcome, long nanos) {
        var state = states.get(server);
        if (state != null) {
            metrics.record("checkout", "pool", state.name(), outcome, nanos);
        }
    }

    private record State(String name, int maximum, Set<ConnectionId> ready, int inUse, boolean open) {
    }
}
