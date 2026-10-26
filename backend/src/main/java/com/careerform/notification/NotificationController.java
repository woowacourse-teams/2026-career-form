package com.careerform.notification;

import java.util.List;
import java.util.Map;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** 확장용 API. 토글이 꺼지면 bean이 없어 404가 되고 확장은 ENDPOINT_UNAVAILABLE로 처리한다. */
@RestController
@ConditionalOnProperty(prefix = "career-form.notification", name = "enabled", havingValue = "true")
public final class NotificationController {
    private final VapidKeys keys;
    private final PushSubscriptionService subscriptions;
    private final JobPostingService postings;

    public NotificationController(VapidKeys keys, PushSubscriptionService subscriptions, JobPostingService postings) {
        this.keys = keys;
        this.subscriptions = subscriptions;
        this.postings = postings;
    }

    public record SubscriptionRequest(String endpoint, Long expirationTime, Keys keys) {
        public record Keys(String p256dh, String auth) {
            @Override public String toString() { return "Keys[redacted]"; }
        }

        @Override public String toString() { return "SubscriptionRequest[redacted]"; }
    }

    public record UnsubscribeRequest(String endpoint) {
        @Override public String toString() { return "UnsubscribeRequest[redacted]"; }
    }

    public record SubscriptionResponse(String subscriptionId, boolean created) { }

    public record PostingsResponse(List<JobPosting.View> postings) {
        public PostingsResponse { postings = List.copyOf(postings); }
    }

    @GetMapping("/api/v1/notifications/vapid-public-key")
    public Map<String, String> publicKey() { return Map.of("publicKey", keys.publicKey()); }

    @PostMapping("/api/v1/notifications/subscriptions")
    public ResponseEntity<SubscriptionResponse> subscribe(@RequestBody SubscriptionRequest request) {
        if (request.keys() == null) { throw new PushSubscriptionService.InvalidSubscription("KEYS"); }
        var registration = subscriptions.register(request.endpoint(), request.keys().p256dh(), request.keys().auth());
        return ResponseEntity.status(registration.created() ? 201 : 200)
            .body(new SubscriptionResponse(registration.subscription().id(), registration.created()));
    }

    @PostMapping("/api/v1/notifications/subscriptions/unsubscribe")
    public ResponseEntity<Void> unsubscribe(@RequestBody UnsubscribeRequest request) {
        subscriptions.unsubscribe(request.endpoint());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/api/v1/notifications/postings")
    public PostingsResponse openPostings() { return new PostingsResponse(postings.open().stream().map(JobPosting::view).toList()); }

    @ExceptionHandler(PushSubscriptionService.InvalidSubscription.class)
    public ResponseEntity<Map<String, String>> invalidSubscription() { return ResponseEntity.badRequest().body(Map.of("error", "INVALID_SUBSCRIPTION")); }
}
