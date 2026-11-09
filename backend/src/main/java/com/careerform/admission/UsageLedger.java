package com.careerform.admission;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

public final class UsageLedger {
    private final MongoUsageStore store;
    private final Clock clock;
    private final AdmissionSettings settings;

    public UsageLedger(MongoUsageStore store, Clock clock, AdmissionSettings settings) {
        this.store = store;
        this.clock = clock;
        this.settings = settings;
    }

    public record Ticket(String bucket, String operation, int limit, Instant expiresAt) {
        @Override public String toString() { return "Ticket[redacted]"; }
    }

    public Ticket user(String install) {
        var end = windowEnd(3600);
        return reserve("user:" + install + ":" + end.getEpochSecond(), settings.userHourly(), end.plusSeconds(86400),
            UUID.randomUUID().toString(), clock.instant().plus(settings.reservationTimeout()), "USER_LIMIT", end, false);
    }

    public Ticket occupy(String install) {
        return reserve("slots:" + install, settings.installActive(), null, UUID.randomUUID().toString(),
            clock.instant().plus(settings.reservationTimeout()), "INSTALL_BUSY", null, true);
    }

    public Ticket protection(String owner, int limit, int seconds, String operation, String reason) {
        var end = windowEnd(seconds);
        return reserve(owner + ":" + end.getEpochSecond(), limit, end.plusSeconds(86400), operation, clock.instant().plus(settings.reservationTimeout()), reason, end, false);
    }

    private Ticket reserve(String bucket, int limit, Instant expiresAt, String operation, Instant deadline,
                           String reason, Instant retryAt, boolean compact) {
        var ticket = new Ticket(bucket, operation, limit, expiresAt);
        try {
            var result = store.change(bucket, limit, expiresAt,
                current -> (compact ? current.compactSlots(clock.instant(), limit) : current.expire(clock.instant()))
                    .reserve(operation, deadline, clock.instant()));
            var state = result.entries().get(operation).state();
            if (state != UsageBucket.State.RESERVED && state != UsageBucket.State.COMMITTED) throw AdmissionFailure.unavailable();
            return ticket;
        } catch (AdmissionFailure error) {
            if (error.code().equals("BUCKET_EXHAUSTED")) throw new AdmissionFailure(reason, 429, retryAt);
            throw error;
        }
    }

    public void commitProtection(Ticket ticket) {
        validateProtection(ticket);
        var result = store.change(ticket.bucket(), ticket.limit(), ticket.expiresAt(), current -> current.settle(ticket.operation(), true, clock.instant()));
        if (result.entries().get(ticket.operation()).state() != UsageBucket.State.COMMITTED) throw AdmissionFailure.unavailable();
    }

    public void cancelProtection(Ticket ticket) {
        validateProtection(ticket);
        store.change(ticket.bucket(), ticket.limit(), ticket.expiresAt(), current -> current.cancelApproval(ticket.operation()));
    }

    public void settle(Ticket ticket, boolean success) {
        store.change(ticket.bucket(), ticket.limit(), ticket.expiresAt(), current -> current.settle(ticket.operation(), success, clock.instant()));
    }

    private static void validateProtection(Ticket ticket) {
        if (!ticket.bucket().startsWith("install:") && !ticket.bucket().startsWith("global:") && !ticket.bucket().startsWith("issuance:")) {
            throw new IllegalArgumentException("Expected transmission approval");
        }
    }

    public Instant windowEnd(int seconds) {
        var epoch = clock.instant().getEpochSecond();
        return Instant.ofEpochSecond(Math.floorDiv(epoch, seconds) * seconds + seconds);
    }
}
