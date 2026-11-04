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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 팀용 공고 관리 API. 경로는 QualityApiFilter가 품질 관리 비밀번호로 보호한다. */
@RestController
@ConditionalOnProperty(prefix = "career-form.notification", name = "enabled", havingValue = "true")
public final class JobPostingAdminController {
    private final JobPostingService postings;

    public JobPostingAdminController(JobPostingService postings) { this.postings = postings; }

    /** 등록 요청. roles는 직무 분류의 소분류 코드 배열이고 요청의 role 자유 글자는 받지 않는다(모르는 필드로 무시된다). */
    public record Registration(String company, List<String> roles, String link, Instant opensAt, Instant closesAt) { }

    public record RoleView(String code, String label) { }

    public record Registered(String id, Instant scheduledAt, long deliveries) { }

    /** 목록 행. roles는 코드와 라벨 목록이며 레거시 공고는 role과 함께 생략된다. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Row(String id, String company, String role, List<RoleView> roles, String link, Instant opensAt, Instant closesAt, Instant registeredAt,
                      Instant scheduledAt, DeliveryProgress progress) {
        static Row of(JobPostingService.Row row) {
            var posting = row.posting();
            var roles = row.roles() == null ? null : row.roles().stream().map(role -> new RoleView(role.code(), role.label())).toList();
            return new Row(posting.id(), posting.company(), posting.role(), roles, posting.link(), posting.opensAt(), posting.closesAt(),
                posting.registeredAt(), posting.scheduledAt(), row.progress());
        }
    }

    public record Rows(List<Row> postings) {
        public Rows { postings = List.copyOf(postings); }
    }

    /** 요약 응답. roleSelectedSubscriptions는 받을 직무를 1개 이상 고른 구독 수다. */
    public record SummaryResponse(Instant from, Instant to, long postings, Deliveries deliveries, Double acceptanceRate, Double abandonRate,
                                  Latency latencyMillis, long subscriptions, long roleSelectedSubscriptions) {
        public record Deliveries(long pending, long sending, long accepted, long abandoned, long total, Double averageAttempts) { }

        public record Latency(Long p50, Long p95) { }

        static SummaryResponse of(JobPostingService.Summary summary) {
            var deliveries = summary.deliveries();
            return new SummaryResponse(summary.from(), summary.to(), summary.postings(),
                new Deliveries(deliveries.pending(), deliveries.sending(), deliveries.accepted(), deliveries.abandoned(), deliveries.total(), summary.averageAttempts()),
                summary.acceptanceRate(), summary.abandonRate(), new Latency(deliveries.latencyP50Millis(), deliveries.latencyP95Millis()), summary.subscriptions(),
                summary.roleSelectedSubscriptions());
        }
    }

    /** 기간별 요약. 집계값만 돌려주고 endpoint·키·링크는 내지 않는다. */
    @GetMapping("/api/v1/notifications/admin/summary")
    public SummaryResponse summary(@RequestParam Instant from, @RequestParam Instant to) { return SummaryResponse.of(postings.summary(from, to)); }

    @GetMapping("/api/v1/notifications/admin/postings")
    public Rows list() { return new Rows(postings.list().stream().map(Row::of).toList()); }

    @PostMapping("/api/v1/notifications/admin/postings")
    public ResponseEntity<?> register(@RequestBody Registration registration) {
        var outcome = postings.register(new JobPostingService.Draft(registration.company(), registration.roles(), registration.link(),
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

    @ExceptionHandler(JobPostingService.InvalidRange.class)
    public ResponseEntity<Map<String, String>> invalidRange() { return ResponseEntity.badRequest().body(Map.of("error", "INVALID_RANGE")); }

    @ExceptionHandler(JobPostingService.InvalidPosting.class)
    public ResponseEntity<Map<String, String>> invalid(JobPostingService.InvalidPosting exception) {
        return ResponseEntity.badRequest().body(Map.of("error", "INVALID_POSTING", "reason", exception.reason()));
    }
}
