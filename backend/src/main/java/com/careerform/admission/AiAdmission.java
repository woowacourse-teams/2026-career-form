package com.careerform.admission;

import java.util.UUID;
import java.util.function.Supplier;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;

public final class AiAdmission {
    private final InheritableThreadLocal<java.util.concurrent.ConcurrentLinkedQueue<UsageLedger.Ticket>> results = new InheritableThreadLocal<>();
    private final UsageLedger ledger;
    private final ExecutionGate gate;
    private final AdmissionSettings settings;
    private final MeterRegistry meters;

    public AiAdmission(UsageLedger ledger, ExecutionGate gate, AdmissionSettings settings, MeterRegistry meters) {
        this.ledger = ledger;
        this.gate = gate;
        this.settings = settings;
        this.meters = meters;
        meters.gauge("analysis.admission.active", gate, ExecutionGate::active);
        meters.gauge("analysis.admission.waiting", gate, ExecutionGate::waiting);
    }

    public <T> T logical(Supplier<T> operation) {
        var context = AnalysisContext.current();
        var user = ledger.user(context.installationId());
        UsageLedger.Ticket slot = null;
        var received = false;
        try {
            slot = ledger.occupy(context.installationId());
            var result = operation.get();
            context.check();
            received = true;
            var pending = results.get();
            if (pending == null) commitUser(user); else pending.add(user);
            return result;
        } catch (RuntimeException error) {
            if (!received) release(user);
            if (error instanceof AdmissionFailure failure) meters.counter("analysis.admission.rejected", "reason", failure.code()).increment();
            throw error;
        } finally { if (slot != null) release(slot); }
    }

    public <T> T validatedResults(Supplier<T> operation) {
        if (results.get() != null) return operation.get();
        var pending = new java.util.concurrent.ConcurrentLinkedQueue<UsageLedger.Ticket>();
        results.set(pending);
        var validated = false;
        try {
            var response = operation.get();
            AnalysisContext.current().check();
            validated = true;
            pending.forEach(this::commitUser);
            return response;
        } finally {
            if (!validated) pending.forEach(this::release);
            results.remove();
        }
    }

    private void commitUser(UsageLedger.Ticket ticket) {
        ledger.settle(ticket, true);
        meters.counter("analysis.admission.user", "outcome", "committed").increment();
    }

    public <T> T transmit(Supplier<T> operation) {
        var context = AnalysisContext.current();
        var waiting = Timer.start(meters);
        try (var permit = gate.acquire(context.deadlineNanos())) {
            waiting.stop(meters.timer("analysis.admission.queue.wait"));
            var id = UUID.randomUUID().toString();
            UsageLedger.Ticket install = null;
            UsageLedger.Ticket global = null;
            var dispatched = false;
            try {
                install = ledger.protection("install:" + context.installationId(), settings.installMinute(), 60, id, "INSTALL_LIMIT");
                global = ledger.protection("global", settings.globalHourly(), 3600, id, "GLOBAL_LIMIT");
                context.check();
                ledger.commitProtection(install);
                ledger.commitProtection(global);
                context.check();
                dispatched = true;
                meters.counter("analysis.admission.transmission", "outcome", "approved").increment();
                return operation.get();
            } finally {
                if (!dispatched) {
                    if (global != null) cancelProtection(global);
                    if (install != null) cancelProtection(install);
                }
            }
        }
    }

    public void sent() { meters.counter("analysis.admission.transport.attempts").increment(); }

    private void cancelProtection(UsageLedger.Ticket ticket) {
        try { ledger.cancelProtection(ticket); }
        catch (RuntimeException error) { meters.counter("analysis.admission.reservation", "outcome", "release_failed").increment(); }
    }

    public long timeoutMillis(long configured) { return AnalysisContext.current().timeoutMillis(configured); }

    private void release(UsageLedger.Ticket ticket) {
        try {
            ledger.settle(ticket, false);
            meters.counter("analysis.admission.reservation", "outcome", "released").increment();
        } catch (RuntimeException error) {
            meters.counter("analysis.admission.reservation", "outcome", "release_failed").increment();
        }
    }
}
