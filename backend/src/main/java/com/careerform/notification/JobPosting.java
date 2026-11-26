package com.careerform.notification;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

import com.fasterxml.jackson.annotation.JsonInclude;
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.PersistenceCreator;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * 팀이 등록한 채용 공고. 링크가 자연 키이며 유일 인덱스로 중복 등록을 막는다. roles는 소분류 코드 배열, role은 그 라벨을 이은 표시 문자열이며 레거시 문서는 둘 다 null일 수 있다.
 * deliveriesReady는 등록 완료 표시다. 새 공고는 false로 저장하고 대상 구독의 발송 문서를 모두 저장한 뒤 true로 바꾼다. 필드가 없는(null) 기존 공고는 완료로 본다.
 */
@Document("job_postings")
public record JobPosting(
    @Id String id,
    String company,
    String role,
    List<String> roles,
    String link,
    Instant opensAt,
    Instant closesAt,
    Instant registeredAt,
    Boolean deliveriesReady
) {
    @PersistenceCreator
    public JobPosting {
        Objects.requireNonNull(id);
        Objects.requireNonNull(company);
        Objects.requireNonNull(link);
        Objects.requireNonNull(opensAt);
        Objects.requireNonNull(closesAt);
        Objects.requireNonNull(registeredAt);
        if (!opensAt.isBefore(closesAt)) { throw new IllegalArgumentException("Invalid posting period"); }
        roles = roles == null ? null : List.copyOf(roles);
    }

    /** 완료 표시가 없는 기존 공고. */
    public JobPosting(String id, String company, String role, List<String> roles, String link, Instant opensAt, Instant closesAt, Instant registeredAt) {
        this(id, company, role, roles, link, opensAt, closesAt, registeredAt, null);
    }

    public JobPosting ready() { return new JobPosting(id, company, role, roles, link, opensAt, closesAt, registeredAt, true); }

    /** 알림 예정 시각: 등록 시각과 접수 시작 중 늦은 쪽. */
    public Instant scheduledAt() { return opensAt.isAfter(registeredAt) ? opensAt : registeredAt; }

    /** 접수 시작 ≤ now < 마감. */
    public boolean openAt(Instant now) { return !opensAt.isAfter(now) && now.isBefore(closesAt); }

    public View view() { return new View(id, company, role, roles, link, opensAt, closesAt); }

    /** 확장에 내려주는 모양. 진행 중 목록 항목과 푸시 payload가 같은 모양을 쓰고, 레거시 공고는 roles를 생략하되 기존 자유 글자 role이 있으면 유지하고 role도 null일 때만 생략한다. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record View(String id, String company, String role, List<String> roles, String link, Instant opensAt, Instant closesAt) { }
}
