# 공고 알림 구독·표시·공지함 계측

> Issue: CF-349
> Collected: 2026-10-26
> Approval-Digest: 58fbaa1907e00e8d62c1b4f88adb4413722dae936a4a5931773699a306f41f97
> Source-Revision: 480e75ff5e9e75c5ab8b8ecbdbec321c0ced30c1

이 문서는 2026-10-26에 승인된 CF-349 후보 4, 같은 날 범위 수정 뒤 승인된 후보 9의 계측 부분, 표시 지연 계측 결정 뒤 승인된 후보 11을 수집한 기록이다. Approval-Digest는 [승인 후보 스냅샷](approved-candidates.md) 전체 UTF-8 바이트의 SHA-256이다.

## 결정

공고 알림에 PostHog 이벤트 7개를 추가한다. 옵션 화면(`surface` `options`)의 `push_subscription_enabled`, `push_subscription_disabled`, `posting_inbox_viewed`, `posting_inbox_saved`와 OS 알림(새 `surface` `notification`)의 `posting_notification_shown`, `posting_notification_opened`, `posting_notification_saved`다. 범위 수정으로 `notification_test_sent`, `notification_visibility_answered`(속성 `answer`: `seen`·`not_seen`), `posting_auto_save_cancelled`를 더하고 저장 이벤트(`posting_notification_saved`, `posting_inbox_saved`)에 계기 `trigger`(`button`·`open`)를 붙인다. 표시 지연 계측으로 알림 표시 이벤트에만 `delay_ms`(표시 시각 − payload `sentAt`, 음수는 0, 24시간 초과는 86,400,000으로 자름)를 더하고 `sentAt`이 없으면 생략한다. 속성은 `surface`, 서버 공고 ID `posting_id`, `answer`, `trigger`, `delay_ms`뿐이며 회사명, 링크, 프로필 값은 보내지 않는다.

## 속성 경계

`posting_id`는 `[A-Za-z0-9_-]{1,64}`에 맞는 값만, `answer`와 `trigger`는 허용 값만, `delay_ms`는 0 이상 정수만 `parseAnalyticsMessage`가 통과시키고 그 밖의 속성과 값은 버린다. `posthog.ts`는 `posting_id`가 있을 때만 전송 속성에 넣는다. 백그라운드가 직접 만드는 알림 이벤트도 같은 PostHog 핸들러를 거치므로 키 없는 빌드는 전송하지 않는다.

## 발생 시점

- 공지함 열람은 목록 로드 성공 시 마운트당 한 번, 공지함 저장은 `PostingService.save` 성공 뒤, 구독 켬·끔은 `setEnabled` 성공 뒤 기록한다.
- 알림 표시는 `chrome.notifications.create` 성공 뒤, 열기는 사용자 클릭으로 탭을 연 뒤, 저장은 로컬 저장 성공(남은 알림 없음 포함) 뒤에만 기록한다. 이미 저장한 공고와 마감 지난 공고는 저장 이벤트를 기록하지 않는다.
- 알림 테스트 실행과 표시 확인 응답은 버튼을 누른 화면(`options` 또는 `extension_onboarding`)이 기록하고, 자동 저장 취소는 후속 알림(`notification`)과 공지함(`options`)에서 취소가 끝난 뒤 기록한다. 자동 저장 설정 켜기·끄기 자체는 기록하지 않는다.

## 계측 도구

제품 이용 계측은 PostHog 명시 이벤트만 사용하며 GA 등 다른 분석 도구나 SDK는 사용하지 않는다. CF-147, CF-193, CF-271의 허용 속성, 로컬 익명 식별자, 키 없는 빌드 차단과 계측 실패 격리 경계는 그대로 유지한다. 키 없는 빌드는 전송하지 않되 허용 속성만 담은 `console.debug` 기록을 남겨 수동 검증 경로(예: `delay_ms` 확인)로 쓴다(2026-10-26 사람 결정).

## 근거와 검증 경계

합성 값으로 `background-analytics.test.ts`, `posthog.test.ts`, `NoticeBoard.test.tsx`, `JobPostings.test.tsx`, `push-receiver.test.ts`가 속성 허용 목록, 발생 시점, 회사명·링크 제외를 확인했다. 운영 PostHog 수집 확인은 사람 확인 사항으로 남는다.

## 참고 코드

- `frontend/src/analytics/events.ts`, `frontend/src/analytics/posthog.ts`
- `frontend/src/job-postings/push-receiver.ts`, `frontend/src/job-postings/NoticeBoard.tsx`, `frontend/src/job-postings/JobPostings.tsx`
- `frontend/entrypoints/background.ts`
