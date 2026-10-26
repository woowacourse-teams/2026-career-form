package com.careerform.notification;

import java.net.URI;
import java.net.URISyntaxException;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Objects;

/** 공고 등록·삭제와 발송 예약. 등록 응답은 저장과 예약 완료를 뜻하며 FCM 수락을 기다리지 않는다. */
public final class JobPostingService {
    static final int MAX_COMPANY_LENGTH = 80;
    static final int MAX_ROLE_LENGTH = 120;
    static final int MAX_LINK_LENGTH = 1024;
    private final NotificationStore store;
    private final Clock clock;

    public JobPostingService(NotificationStore store, Clock clock) {
        this.store = Objects.requireNonNull(store);
        this.clock = Objects.requireNonNull(clock);
    }

    public record Draft(String company, String role, String link, Instant opensAt, Instant closesAt) { }

    public sealed interface Outcome permits Registered, Duplicate { }

    public record Registered(JobPosting posting, long deliveries) implements Outcome { }

    public record Duplicate(String existingId) implements Outcome { }

    public record Row(JobPosting posting, DeliveryProgress progress) { }

    public static final class InvalidPosting extends IllegalArgumentException {
        private final String reason;

        public InvalidPosting(String reason) {
            super("Invalid posting: " + reason);
            this.reason = reason;
        }

        public String reason() { return reason; }
    }

    public Outcome register(Draft draft) {
        var now = clock.instant();
        var posting = validate(draft, now);
        var existing = store.findPostingByLink(posting.link());
        if (existing.isPresent()) { return new Duplicate(existing.get().id()); }
        if (!store.insertPosting(posting)) {
            return new Duplicate(store.findPostingByLink(posting.link()).map(JobPosting::id).orElse("UNKNOWN"));
        }
        var deliveries = store.subscriptionIds().stream()
            .map(subscriptionId -> PushDelivery.pending(Identifiers.random(), posting.id(), subscriptionId, posting.scheduledAt())).toList();
        store.insertDeliveries(deliveries);
        return new Registered(posting, deliveries.size());
    }

    /** 공고를 지우고 아직 대기인 발송만 취소한다. 수락·포기·발송 중 기록은 남는다. */
    public boolean delete(String id) {
        if (!store.deletePosting(id)) { return false; }
        store.deletePendingDeliveries(id);
        return true;
    }

    public List<Row> list() {
        return store.listPostings().stream().map(posting -> new Row(posting, store.deliveryProgress(posting.id()))).toList();
    }

    public List<JobPosting> open() { return store.listOpenPostings(clock.instant()); }

    private JobPosting validate(Draft draft, Instant now) {
        Objects.requireNonNull(draft);
        var company = text(draft.company(), MAX_COMPANY_LENGTH, "COMPANY");
        var role = optionalText(draft.role(), MAX_ROLE_LENGTH, "ROLE");
        var link = link(draft.link());
        if (draft.opensAt() == null || draft.closesAt() == null || !draft.opensAt().isBefore(draft.closesAt())) { throw new InvalidPosting("PERIOD"); }
        if (!draft.closesAt().isAfter(now)) { throw new InvalidPosting("CLOSED"); }
        return new JobPosting(Identifiers.random(), company, role, link, draft.opensAt(), draft.closesAt(), now);
    }

    /** 직무처럼 비우거나 생략할 수 있는 값. 값이 있을 때만 길이와 제어 문자를 검사한다. */
    private static String optionalText(String value, int maxLength, String reason) {
        return value == null || value.isBlank() ? null : text(value, maxLength, reason);
    }

    private static String text(String value, int maxLength, String reason) {
        if (value == null) { throw new InvalidPosting(reason); }
        var trimmed = value.strip();
        if (trimmed.isEmpty() || trimmed.length() > maxLength || trimmed.chars().anyMatch(Character::isISOControl)) { throw new InvalidPosting(reason); }
        return trimmed;
    }

    static String link(String value) {
        if (value == null || value.isBlank() || value.length() > MAX_LINK_LENGTH) { throw new InvalidPosting("LINK"); }
        URI uri;
        try {
            uri = new URI(value.strip());
        } catch (URISyntaxException exception) {
            throw new InvalidPosting("LINK");
        }
        var scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if (!(scheme.equals("http") || scheme.equals("https")) || uri.getRawUserInfo() != null || uri.getHost() == null || uri.getHost().isBlank()) {
            throw new InvalidPosting("LINK");
        }
        return uri.toString();
    }
}
