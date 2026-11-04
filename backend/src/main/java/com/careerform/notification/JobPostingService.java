package com.careerform.notification;

import java.net.URI;
import java.net.URISyntaxException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Objects;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 공고 등록·삭제와 발송 예약. 등록 응답은 저장과 예약 완료를 뜻하며 FCM 수락을 기다리지 않는다.
 * 대기 발송은 공고 직무와 겹치는 구독에만 만들고, 전환 설정이 꺼져 있으면 받을 직무를 고르지 않은 구독도 포함한다.
 */
public final class JobPostingService {
    static final int MAX_COMPANY_LENGTH = 80;
    static final int MAX_ROLE_LENGTH = 120;
    static final int MAX_ROLES_PER_POSTING = 10;
    static final int MAX_LINK_LENGTH = 1024;
    static final Duration MAX_SUMMARY_RANGE = Duration.ofDays(400);
    private static final Logger log = LoggerFactory.getLogger(JobPostingService.class);
    private final NotificationStore store;
    private final JobCategories categories;
    private final RoleFilterPolicy roleFilter;
    private final Clock clock;

    public JobPostingService(NotificationStore store, JobCategories categories, RoleFilterPolicy roleFilter, Clock clock) {
        this.store = Objects.requireNonNull(store);
        this.categories = Objects.requireNonNull(categories);
        this.roleFilter = Objects.requireNonNull(roleFilter);
        this.clock = Objects.requireNonNull(clock);
    }

    /** 등록 입력. roles는 직무 분류의 소분류 코드 배열이며 role 라벨은 서버가 파생한다. */
    public record Draft(String company, List<String> roles, String link, Instant opensAt, Instant closesAt) { }

    public sealed interface Outcome permits Registered, Duplicate { }

    public record Registered(JobPosting posting, long deliveries) implements Outcome { }

    public record Duplicate(String existingId) implements Outcome { }

    /** 관리 목록 행. roles는 공고의 소분류 코드에 라벨을 붙인 목록이고 레거시 공고는 null이다. */
    public record Row(JobPosting posting, List<JobCategories.Role> roles, DeliveryProgress progress) { }

    /** 기간별 요약. 수락률·포기율은 끝난 발송(수락+포기) 기준, 평균 시도는 기간 안 전체 발송 기준이며 분모가 0이면 null이다. */
    public record Summary(Instant from, Instant to, long postings, DeliverySummary deliveries, Double acceptanceRate, Double abandonRate,
                          Double averageAttempts, long subscriptions) { }

    public static final class InvalidRange extends IllegalArgumentException {
        public InvalidRange() { super("Invalid summary range"); }
    }

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
        var deliveries = store.subscriptionIdsForRoles(posting.roles(), !roleFilter.enforced()).stream()
            .map(subscriptionId -> PushDelivery.pending(Identifiers.random(), posting.id(), subscriptionId, posting.scheduledAt())).toList();
        store.insertDeliveries(deliveries);
        log.info("POSTING_REGISTERED postingId={} roles={} deliveries={}", posting.id(), posting.roles().size(), deliveries.size());
        return new Registered(posting, deliveries.size());
    }

    /** 공고를 지우고 아직 대기인 발송만 취소한다. 수락·포기·발송 중 기록은 남는다. */
    public boolean delete(String id) {
        if (!store.deletePosting(id)) { return false; }
        store.deletePendingDeliveries(id);
        return true;
    }

    public List<Row> list() {
        return store.listPostings().stream().map(posting -> new Row(posting, roles(posting), store.deliveryProgress(posting.id()))).toList();
    }

    public List<JobPosting> open() { return store.listOpenPostings(clock.instant()); }

    public Summary summary(Instant from, Instant to) {
        if (from == null || to == null || !from.isBefore(to) || Duration.between(from, to).compareTo(MAX_SUMMARY_RANGE) > 0) { throw new InvalidRange(); }
        var deliveries = store.summarizeDeliveries(from, to);
        var finished = deliveries.accepted() + deliveries.abandoned();
        var total = deliveries.total();
        return new Summary(from, to, store.countPostingsRegisteredBetween(from, to), deliveries,
            finished == 0 ? null : (double) deliveries.accepted() / finished,
            finished == 0 ? null : (double) deliveries.abandoned() / finished,
            total == 0 ? null : (double) deliveries.attempts() / total,
            store.countSubscriptions());
    }

    private JobPosting validate(Draft draft, Instant now) {
        Objects.requireNonNull(draft);
        var company = text(draft.company(), MAX_COMPANY_LENGTH, "COMPANY");
        var roles = roles(draft.roles());
        var link = link(draft.link());
        if (draft.opensAt() == null || draft.closesAt() == null || !draft.opensAt().isBefore(draft.closesAt())) { throw new InvalidPosting("PERIOD"); }
        if (!draft.closesAt().isAfter(now)) { throw new InvalidPosting("CLOSED"); }
        return new JobPosting(Identifiers.random(), company, categories.label(roles, MAX_ROLE_LENGTH), roles, link, draft.opensAt(), draft.closesAt(), now);
    }

    /** 소분류 코드를 정규화한 뒤 1개 이상 상한 이하이고 모두 분류에 있어야 한다. */
    private List<String> roles(List<String> value) {
        var roles = JobCategories.normalize(value);
        if (roles.isEmpty() || roles.size() > MAX_ROLES_PER_POSTING || !roles.stream().allMatch(categories::containsRole)) { throw new InvalidPosting("ROLE"); }
        return roles;
    }

    /** 저장된 코드에 라벨을 붙인다. 분류에서 사라진 코드는 코드를 라벨로 쓰고 레거시 공고는 null이다. */
    private List<JobCategories.Role> roles(JobPosting posting) {
        if (posting.roles() == null) { return null; }
        return posting.roles().stream().map(code -> new JobCategories.Role(code, categories.roleLabel(code).orElse(code))).toList();
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
