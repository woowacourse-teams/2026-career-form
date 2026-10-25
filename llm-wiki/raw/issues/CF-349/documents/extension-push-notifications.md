# 확장 Web Push 구독과 공고 알림

> Issue: CF-349
> Collected: 2026-10-26
> Approval-Digest: dab518584df0f2191e1b2b11ab24a5ebda3ed6297255baad4e3e5142db471952
> Source-Revision: 7dd07128ad3ccd0edf2834f4084d5b8e0e76cfed

이 문서는 2026-10-26에 승인된 CF-349 후보 1·2·3·5를 수집한 기록이다. Approval-Digest는 [승인 후보 스냅샷](approved-candidates.md) 전체 UTF-8 바이트의 SHA-256이다. 확장의 Web Push 구독과 공고 알림은 이전 topic Wiki에 없던 주제라 Supersedes가 없다. 구독 endpoint와 키, 실제 공고·프로필 값, 대화 전문은 기록하지 않는다.

## 구독 수명주기 (후보 1)

설치(`onInstalled`), 브라우저 시작(`onStartup`), 켜기, 재시도 알람, `pushsubscriptionchange`가 모두 `PushSubscriptionService.sync()`로 수렴한다. 서버가 endpoint로 중복 처리하므로 매번 다시 등록하고, 기존 브라우저 구독의 `applicationServerKey`가 서버 공개키와 다르면 `unsubscribe()` 뒤 재구독한다. 끄기는 로컬 설정 off → 서버 해지 → 브라우저 `unsubscribe()` 순서이며, 켜기는 설정 on 뒤 등록이다. 켜기 등록이 실패해도 설정은 켜짐으로 남겨 재시도와 다음 시작에서 등록이 이어진다.

상태는 `registered`, `disabled`, `unsupported`, `not_configured`, `endpoint_unavailable`, `failed` 6종을 `chrome.storage.local`의 `careerForm.push.status`에 남긴다. 재시도는 `NETWORK`·`TIMEOUT`·`SERVER_ERROR`에만 `chrome.alarms`(`careerForm.push.retry`)로 1·5·15·60분 상한 백오프를 건다. `NOT_CONFIGURED`, `ENDPOINT_UNAVAILABLE`(404), `BAD_REQUEST`, Chrome 121 미만은 재시도 없이 상태만 남긴다. 서비스워커가 깨어날 때마다 등록하지는 않는다.

## 조용한 푸시 수신과 알림 클릭 (후보 2)

`pushManager.subscribe({ userVisibleOnly: false })`와 manifest `minimum_chrome_version` 121(UA 메이저 버전으로 2중 확인)로 사용자에게 보이지 않는 푸시를 받는다. payload는 `push-api.ts`의 `parseServerPosting`으로 검증해 HTTP(S) 링크가 아니거나 형식이 다르면 버리고, 같은 공고 ID와 마감 지난 공고는 알림 없이 버린다. 알린 공고는 `careerForm.push.notified`에 공고 데이터와 함께 기록해 서비스워커 재시작 뒤의 클릭도 처리하며 마감이 지나면 정리한다.

알림 ID 접두어는 `careerForm.push.posting.`(공고 알림)과 `careerForm.push.saved.`(저장 확인)이며 CF-161의 `careerForm.job.` 처리기와 서로 무시한다. 탭은 알림 본문 클릭과 "공고 열기" 버튼의 사용자 클릭으로만 열고, "마감 알림 저장"은 기존 `PostingService.save`에 기본 알림 시점(1440·120분)으로 넘긴 뒤 저장됨, 남은 알림 없음, 이미 저장, 마감 지남을 확인 알림으로 구분한다. 남은 알림이 없을 때의 문구는 공고 폼의 기존 안내를 그대로 쓴다.

## 확장 측 API 계약 정본 (후보 3)

확장 측 공고 알림 API 계약의 정본은 `frontend/src/job-postings/push-api.ts` 한 파일이다. 2026-10-26 기준 원격 Draft PR #351(CF-348, `d7100f7`)의 `NotificationController`와 대조해 일치함을 확인했다.

- `GET /api/v1/notifications/vapid-public-key` → `{publicKey}` (base64url P-256 비압축 점 65바이트, 아니면 `INVALID_RESPONSE`)
- `POST /api/v1/notifications/subscriptions` `{endpoint, expirationTime, keys{p256dh, auth}}` → 201/200 `{subscriptionId, created}`
- `POST /api/v1/notifications/subscriptions/unsubscribe` `{endpoint}` → 204
- `GET /api/v1/notifications/postings` → `{postings[{id, company, role, link, opensAt, closesAt}]}` 마감순
- 푸시 payload는 같은 6필드 JSON이며 `type` 필드가 없다.

요청에는 `X-Career-Form-Version`을 붙이고 `credentials: omit`, 10초 타임아웃이며 404는 `ENDPOINT_UNAVAILABLE`, 미설정 빌드는 `NOT_CONFIGURED`로 강등한다. CF-348이 머지되기 전까지 계약 재확인이 필요하다.

## 공지함과 구독 설정 화면 (후보 5)

공지함은 관리 페이지 "지원 공고" 탭 안의 `NoticeBoard` 구역이며 사이드 패널의 기존 "지원 공고 관리" 진입을 재사용한다. 목록은 백그라운드 경유(`careerForm.push` 메시지, 관리 페이지 발신자만 허용)로 진행 중 공고를 받아 마감순으로 보여 주고, 저장 여부는 로컬 공고 `url`과 서버 `link` 문자열 일치로 판단하므로 서버 마감 변경은 로컬 리마인더에 반영되지 않는 한계가 남는다. 백엔드 미설정, 엔드포인트 없음, 네트워크 오류는 문구를 분리하고 다시 불러오기 버튼을 둔다. 구독 스위치는 기본 켜짐이고 미지원 Chrome에서는 비활성화하며, 구독 주소가 서버에 저장된다는 데이터 안내를 둔다. 개인정보 고지 문구 확정은 사람 몫이다.

## 근거

- `frontend/src/job-postings/push-api.ts`, `push-subscription.ts`, `push-receiver.ts`, `push-background.ts`, `push-background-handler.ts`, `push-client.ts`, `push-messages.ts`, `server-posting.ts`, `NoticeBoard.tsx`, `JobPostings.tsx`
- `frontend/entrypoints/background.ts`, `frontend/wxt.config.ts`(`minimum_chrome_version`)
- `frontend/README.md`의 "공고 알림 구독(Web Push)"
- `backend/src/main/java/com/careerform/notification/NotificationController.java`(PR #351, CF-348)
- Issue #349 본문

## 검증 경계

Chrome API 대역과 가짜 시계·가짜 fetch로 구독 등록·재등록·해지·재시도, push 이벤트의 알림 생성, 중복·마감 억제, 알림 클릭의 열기·저장 연결, 공지함 목록·오류·저장, 계측 속성 제한을 자동 테스트로 확인했다. 실제 Chrome 알림 표시, 서비스워커 재시작, Chrome 완전 종료 중 도착, FCM 종단은 사람 확인 사항이다.
