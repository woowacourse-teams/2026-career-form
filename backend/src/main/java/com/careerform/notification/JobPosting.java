package com.careerform.notification;

import java.time.Instant;
import java.util.Objects;

import com.fasterxml.jackson.annotation.JsonInclude;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

/** 팀이 등록한 채용 공고. 링크가 자연 키이며 유일 인덱스로 중복 등록을 막는다. 직무는 선택 입력이라 null일 수 있다. */
@Document("job_postings")
public record JobPosting(
    @Id String id,
    String company,
    String role,
    String link,
    Instant opensAt,
    Instant closesAt,
    Instant registeredAt
) {
    public JobPosting {
        Objects.requireNonNull(id);
        Objects.requireNonNull(company);
        Objects.requireNonNull(link);
        Objects.requireNonNull(opensAt);
        Objects.requireNonNull(closesAt);
        Objects.requireNonNull(registeredAt);
        if (!opensAt.isBefore(closesAt)) { throw new IllegalArgumentException("Invalid posting period"); }
    }

    /** 알림 예정 시각: 등록 시각과 접수 시작 중 늦은 쪽. */
    public Instant scheduledAt() { return opensAt.isAfter(registeredAt) ? opensAt : registeredAt; }

    /** 접수 시작 ≤ now < 마감. */
    public boolean openAt(Instant now) { return !opensAt.isAfter(now) && now.isBefore(closesAt); }

    public View view() { return new View(id, company, role, link, opensAt, closesAt); }

    /** 확장에 내려주는 모양. 진행 중 목록 항목과 푸시 payload가 같은 모양을 쓰고, 직무가 없으면 role 필드를 생략한다. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record View(String id, String company, String role, String link, Instant opensAt, Instant closesAt) { }
}
