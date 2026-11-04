# 받을 직무 저장 계측

> Issue: [CF-395](https://github.com/woowacourse-teams/2026-career-form/issues/395)
> Collected: 2026-11-04
> Approval-Digest: 06bed9b73b031ba11fd558442feb39e15b45b702740a2cf873c46a68bc574dbd
> Source-Revision: 4e6283fa

이 문서는 [승인 후보 스냅샷](approved-candidates.md)의 후보 4(계측)를 선택적 이용 계측 topic에 잇는 기록이다. CF-361까지의 이벤트 목록과 개인정보 경계는 그대로이고 이벤트 하나와 속성 하나만 더한다.

## 받을 직무 저장 이벤트 (후보 4)

옵션 화면의 알림 설정에서 받을 직무를 저장하면 `push_roles_saved` 이벤트를 보내고 속성은 `role_count`(저장된 소분류 코드 개수, 0 이상 정수)뿐이다. 직무 코드 자체는 `events.ts`의 허용 속성에서 제외해 PostHog, 콘솔 디버그 로그, PR 본문 어디에도 코드 값이 남지 않는다. 사이드 패널의 "알림 켜기"는 새 이벤트 없이 기존 `push_subscription_enabled`를 `side_panel`·`in_page_panel` surface로 보낸다. 키 없는 빌드는 기존 규칙대로 전송하지 않는다.
