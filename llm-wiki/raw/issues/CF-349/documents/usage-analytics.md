# 공고 알림 구독·표시·공지함 계측

> Issue: CF-349
> Collected: 2026-10-26
> Approval-Digest: dab518584df0f2191e1b2b11ab24a5ebda3ed6297255baad4e3e5142db471952
> Source-Revision: 7dd07128ad3ccd0edf2834f4084d5b8e0e76cfed

이 문서는 2026-10-26에 승인된 CF-349 후보 4를 수집한 기록이다. Approval-Digest는 [승인 후보 스냅샷](approved-candidates.md) 전체 UTF-8 바이트의 SHA-256이다.

## 결정

공고 알림에 PostHog 이벤트 7개를 추가한다. 옵션 화면(`surface` `options`)의 `push_subscription_enabled`, `push_subscription_disabled`, `posting_inbox_viewed`, `posting_inbox_saved`와 OS 알림(새 `surface` `notification`)의 `posting_notification_shown`, `posting_notification_opened`, `posting_notification_saved`다. 속성은 `surface`와 서버 공고 ID `posting_id`뿐이며 회사명, 링크, 프로필 값은 보내지 않는다.

## 속성 경계

`posting_id`는 `[A-Za-z0-9_-]{1,64}`에 맞는 값만 `parseAnalyticsMessage`가 통과시키고 그 밖의 속성은 버린다. `posthog.ts`는 `posting_id`가 있을 때만 전송 속성에 넣는다. 백그라운드가 직접 만드는 알림 이벤트도 같은 PostHog 핸들러를 거치므로 키 없는 빌드는 전송하지 않는다.

## 발생 시점

- 공지함 열람은 목록 로드 성공 시 마운트당 한 번, 공지함 저장은 `PostingService.save` 성공 뒤, 구독 켬·끔은 `setEnabled` 성공 뒤 기록한다.
- 알림 표시는 `chrome.notifications.create` 성공 뒤, 열기는 사용자 클릭으로 탭을 연 뒤, 저장은 로컬 저장 성공(남은 알림 없음 포함) 뒤에만 기록한다. 이미 저장한 공고와 마감 지난 공고는 저장 이벤트를 기록하지 않는다.

## 계측 도구

제품 이용 계측은 PostHog 명시 이벤트만 사용하며 GA 등 다른 분석 도구나 SDK는 사용하지 않는다. CF-147, CF-193, CF-271의 허용 속성, 로컬 익명 식별자, 키 없는 빌드 차단과 계측 실패 격리 경계는 그대로 유지한다.

## 근거와 검증 경계

합성 값으로 `background-analytics.test.ts`, `posthog.test.ts`, `NoticeBoard.test.tsx`, `JobPostings.test.tsx`, `push-receiver.test.ts`가 속성 허용 목록, 발생 시점, 회사명·링크 제외를 확인했다. 운영 PostHog 수집 확인은 사람 확인 사항으로 남는다.

## 참고 코드

- `frontend/src/analytics/events.ts`, `frontend/src/analytics/posthog.ts`
- `frontend/src/job-postings/push-receiver.ts`, `frontend/src/job-postings/NoticeBoard.tsx`, `frontend/src/job-postings/JobPostings.tsx`
- `frontend/entrypoints/background.ts`
