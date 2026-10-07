package com.careerform.quality;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import jakarta.servlet.http.HttpServletRequest;

@RestController
@ConditionalOnProperty(prefix = "career-form.quality", name = "enabled", havingValue = "true")
public final class QualityRegistryController {
    private final QualityRegistry registry;
    private final QualityAccess access;

    public QualityRegistryController(QualityRegistry registry, QualityAccess access) { this.registry = registry; this.access = access; }

    public record Change(Long fieldCount, String publicLink, QualityRegistry.DeferReason reason, Instant until, String claimant, Boolean dedicatedHost) {
    }

    public record Row(String id, String site, String structure, String route, String version, String homepage, String publicLink,
                      Instant firstSeen, Instant lastSeen, QualityRegistry.Status status, QualitySite.Status identity, boolean recheck, boolean mine, String claimant,
                      Instant claimExpiresAt, QualityRegistry.DeferReason deferReason, Instant deferredUntil, List<QualityRegistry.Confirmation> history) {
        public Row { history = List.copyOf(history); }
    }

    public record Page(List<Row> items, boolean hasMore, long nextOffset) {
        public Page { items = List.copyOf(items); }
    }

    @GetMapping("/api/v1/quality/sites")
    public Page list(@RequestParam(defaultValue = "PENDING") String status,
                     @RequestParam(defaultValue = "0") long offset, @RequestParam(defaultValue = "50") int limit,
                     HttpServletRequest request) {
        var completed = switch (status) { case "PENDING" -> Boolean.FALSE; case "COMPLETED" -> Boolean.TRUE;
            case "ALL" -> null; default -> throw new IllegalArgumentException("Invalid list status"); };
        var records = registry.page(completed, offset, limit);
        return new Page(records.stream().limit(limit).map(record -> row(record, request)).toList(), records.size() > limit, offset + limit);
    }

    @GetMapping("/api/v1/quality/sites/{id}")
    public List<QualityRegistry.Confirmation> history(@PathVariable String id) { return registry.candidate(id).history(); }

    @GetMapping("/api/v1/quality/sites/{id}/details")
    public Row details(@PathVariable String id, HttpServletRequest request) { return row(registry.record(id), request); }

    @PostMapping("/api/v1/quality/sites/{id}/{action}")
    public ResponseEntity<Void> change(@PathVariable String id, @PathVariable String action, @RequestBody(required = false) Change change,
                                       HttpServletRequest request) {
        var owner = QualityApiFilter.claimant(request);
        if (!access.validClaimant(owner)) { throw new IllegalArgumentException("Missing claimant"); }
        switch (action) {
            case "claim" -> registry.claim(id, owner, change == null ? null : change.claimant());
            case "release" -> registry.release(id, owner);
            case "reopen" -> registry.reopen(id, owner);
            case "confirm" -> {
                if (change == null || change.fieldCount() == null) { throw new IllegalArgumentException("Missing count"); }
                registry.confirm(id, owner, change.fieldCount(), change.publicLink(), Boolean.TRUE.equals(change.dedicatedHost()));
            }
            case "defer" -> {
                if (change == null) { throw new IllegalArgumentException("Missing reason"); }
                registry.defer(id, owner, change.reason(), change.until());
            }
            default -> throw new IllegalArgumentException("Invalid action");
        }
        return ResponseEntity.noContent().header("Set-Cookie", QualityLoginController.claimCookie(access.renewVerifiedClaimant(owner))).build();
    }

    @ExceptionHandler(QualityRegistry.Conflict.class)
    public ResponseEntity<Map<String, String>> conflict() { return ResponseEntity.status(409).body(Map.of("error", "CANDIDATE_CHANGED")); }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> invalid() { return ResponseEntity.badRequest().body(Map.of("error", "INVALID_CHANGE")); }

    private Row row(QualityRecord record, HttpServletRequest request) {
        var candidate = (QualityRegistry.Candidate) record.payload();
        var session = QualityApiFilter.claimant(request);
        var now = registry.time();
        return new Row(candidate.id(), record.group().host(), record.group().structure(), record.group().route(), record.group().version(),
            candidate.homepage(), candidate.publicLink(), candidate.firstSeen(), candidate.lastSeen(), candidate.statusAt(now), record.group().identity(), candidate.recheck(),
            session != null && candidate.claimedAt(now) && access.validClaimant(session) && QualityProjection.digest(session).equals(candidate.claimOwner()),
            candidate.claimedAt(now) ? candidate.claimant() : null, candidate.claimExpiresAt(),
            candidate.deferReason(), candidate.deferredUntil(), candidate.history());
    }
}
