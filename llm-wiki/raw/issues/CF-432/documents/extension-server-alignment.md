# 서버와 확장의 직무 미선택 정책 일치

> Issue: [CF-432](https://github.com/woowacourse-teams/2026-career-form/issues/432)
> Collected: 2026-11-07
> Approval-Digest: 7fa81d649c3847946c61720c258533e9dd42172144711304010e08025c5d43df
> Source-Revision: da17fde3

확장 알림 topic에서 본 CF-432의 의미다. [승인 후보 스냅샷](approved-candidates.md)의 후보 1 가운데 확장과 맞닿는 부분을 적는다. 확장의 미선택 처리, 문구, 선택기와 거르기는 CF-431과 CF-395 payload의 내용이 그대로 유효하다.

- 서버도 받을 직무를 고르지 않은 구독을 항상 발송 대상에 넣는다. CF-431 확장의 "직무를 고르지 않으면 모든 공고를 받는다"와 서버 발송이 같은 정책이 됐다.
- 서버에서 미선택 구독을 빼던 전환 설정(`CAREER_FORM_PUSH_ROLE_FILTER_ENFORCED`)은 CF-432에서 없어졌다. CF-431이 적어 둔 "#432 전에는 켜지 않는다" 주의는 더 필요 없고, 미선택 제외로 되돌리려면 코드 변경이 필요하다.
