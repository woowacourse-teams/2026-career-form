package com.careerform.notification;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonInclude;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** 팀용 공고 관리 API. 경로는 QualityApiFilter가 품질 관리 비밀번호로 보호한다. */
@RestController
@ConditionalOnProperty(prefix = "career-form.notification", name = "enabled", havingValue = "true")
public final class JobPostingAdminController {
    private final JobPostingService postings;

    public JobPostingAdminController(JobPostingService postings) { this.postings = postings; }

    public record Registration(String company, String role, String link, Instant opensAt, Instant closesAt) { }

    public record Registered(String id, Instant scheduledAt, long deliveries) { }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Row(String id, String company, String role, String link, Instant opensAt, Instant closesAt, Instant registeredAt,
                      Instant scheduledAt, DeliveryProgress progress) {
        static Row of(JobPostingService.Row row) {
            var posting = row.posting();
            return new Row(posting.id(), posting.company(), posting.role(), posting.link(), posting.opensAt(), posting.closesAt(),
                posting.registeredAt(), posting.scheduledAt(), row.progress());
        }
    }

    public record Rows(List<Row> postings) {
        public Rows { postings = List.copyOf(postings); }
    }

    @GetMapping("/api/v1/notifications/admin/postings")
    public Rows list() { return new Rows(postings.list().stream().map(Row::of).toList()); }

    @PostMapping("/api/v1/notifications/admin/postings")
    public ResponseEntity<?> register(@RequestBody Registration registration) {
        var outcome = postings.register(new JobPostingService.Draft(registration.company(), registration.role(), registration.link(),
            registration.opensAt(), registration.closesAt()));
        return switch (outcome) {
            case JobPostingService.Registered registered -> ResponseEntity.status(201)
                .body(new Registered(registered.posting().id(), registered.posting().scheduledAt(), registered.deliveries()));
            case JobPostingService.Duplicate duplicate -> ResponseEntity.status(409)
                .body(Map.of("error", "DUPLICATE_LINK", "postingId", duplicate.existingId()));
        };
    }

    @DeleteMapping("/api/v1/notifications/admin/postings/{id}")
    public ResponseEntity<Map<String, String>> delete(@PathVariable String id) {
        if (!id.matches("[0-9a-f]{32}") || !postings.delete(id)) { return ResponseEntity.status(404).body(Map.of("error", "POSTING_NOT_FOUND")); }
        return ResponseEntity.noContent().build();
    }

    @ExceptionHandler(JobPostingService.InvalidPosting.class)
    public ResponseEntity<Map<String, String>> invalid(JobPostingService.InvalidPosting exception) {
        return ResponseEntity.badRequest().body(Map.of("error", "INVALID_POSTING", "reason", exception.reason()));
    }
}
