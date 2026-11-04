package com.careerform.notification;

/**
 * 직무 필터 전환 설정(career-form.notification.role-filter.enforced). 꺼져 있으면(기본) 받을 직무를 고르지 않은 구독도 발송 대상이고,
 * 켜면 공고 직무와 겹치는 직무를 고른 구독만 대상이다. 새 확장이 보급돼 직무 선택 구독 수가 충분해진 뒤 사람이 켠다.
 */
public record RoleFilterPolicy(boolean enforced) {
    public static RoleFilterPolicy defaults() { return new RoleFilterPolicy(false); }
}
