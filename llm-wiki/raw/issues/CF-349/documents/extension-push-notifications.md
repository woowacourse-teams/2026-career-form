# 확장 Web Push 구독과 공고 알림

> Issue: CF-349
> Collected: 2026-10-26
> Approval-Digest: a614605e0a14261d727cde1371ebc8ba7c290d69bd5f59da72f0fbc7f2a8d8dc
> Source-Revision: 5b0a3f63c3417c32ecae1ffb7256db3965a097ab

이 문서는 2026-10-26에 승인된 CF-349 후보 1·2·3·5, 같은 날 범위 수정 뒤 승인된 후보 6·7·8·9, 직무 선택 입력 결정 뒤 승인된 후보 10을 수집한 기록이다. Approval-Digest는 [승인 후보 스냅샷](approved-candidates.md) 전체 UTF-8 바이트의 SHA-256이다. 확장의 Web Push 구독과 공고 알림은 이전 topic Wiki에 없던 주제라 Supersedes가 없다. 구독 endpoint와 키, 실제 공고·프로필 값, 대화 전문은 기록하지 않는다.

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

## 알림 표시 자가 진단 (후보 6)

Chrome 확장 API로는 OS 알림 허용 여부를 감지할 수 없다. `chrome.notifications.create`는 허용이 꺼져 있어도 정상 완료되므로 사용자 응답으로 대신한다. 로컬 `careerForm.push.visibility`에 결과(`unknown`·`seen`·`not_seen`), 확인 시각, 출처(`test`·`notification_click`·`card`), 첫 표시 시각(`shownAt`), 나중에 시각(`askLaterAt`)을 둔다. 테스트 알림(`careerForm.push.test`)은 사용자의 버튼 클릭으로만 띄우고 응답을 기록하면 지우며, 설치·시작·푸시 수신 시 자동 알림은 없다. 공고 알림 클릭은 자동으로 `seen`이다.

노출은 설치 온보딩 카드(`SiteApp` installed 모드에서 `pushClient`가 주입된 확장에서만, 공개 사이트 제외), 지원 공고 탭 질문 카드(미확인·구독 켜짐·나중에 없음), 첫 알림 뒤 미클릭 확인 카드(봤어요·못 봤어요), 구독 설정 패널의 결과 행과 상시 알림 테스트이며 결과가 기록되면 카드는 사라진다. `not_seen`이거나 `getPermissionLevel`이 `denied`면 macOS(시스템 설정 › 알림 › Google Chrome, 알림 스타일, 집중 모드)·Windows(설정 › 시스템 › 알림, 방해 금지)·Chrome 사이트 설정 경로를 UA에 따라 글로 안내하고 다시 테스트를 두며 시스템 설정을 대신 열지 않는다. 발신자 검사는 options.html 전체, onboarding.html은 `status`·`disable`·`test`·`record`만 허용하고 그 밖은 차단한다.

## 미확인 공고 배지 (후보 7)

새 공고 알림마다 `careerForm.push.unread`에 공고 ID→마감 시각을 넣고 `chrome.action.setBadgeText`(숫자만)·`setBadgeBackgroundColor`·`setTitle`로 그린다. 공지함 열람(`inbox` 메시지가 목록을 받은 뒤)은 전부, 알림 클릭으로 연 공고는 개별로 지우고 마감 지난 항목은 정리하며, 서비스워커 시작마다 저장 목록으로 다시 그린다. 사이드 패널 "지원 공고 관리" 버튼은 storage를 직접 읽는 reader로 같은 개수를 표시하고 `storage.onChanged`로 갱신한다. 배지에는 회사명·직무를 넣지 않고 아이콘 클릭 동작(사이드 패널 열기)은 바꾸지 않는다.

## 공고 열기 시 마감 알림 자동 저장 (후보 8)

설정 `careerForm.push.autoSave`는 기본 켜짐이며 구독 켜짐·꺼짐과 독립이다. 알림 본문 클릭, 알림 "공고 열기" 버튼, 공지함 "공고 열기" 세 경로에서 CF-161 `PostingService.save`에 기본 알림 시점으로 저장하고 이미 저장·마감 지난 공고는 건너뛰며 미래 알림이 없어도 목록에는 저장한다. 알림 표시만으로는 저장하지 않는다. 알림 경로는 `careerForm.push.autosaved.<id>` 후속 알림의 "저장 취소" 버튼, 공지함은 카드 인라인 "취소"로 `PostingService.remove`를 불러 저장 공고와 예약을 함께 지운다. 취소 대상은 url이 같은 planned 로컬 공고이며 수동 저장한 공고에는 취소를 제안하지 않는다. 저장 계측은 `trigger`(`button`·`open`)로 구분하고 취소는 `posting_auto_save_cancelled`로 기록한다.

## 화면 정리 (후보 9)

공지함은 3건까지 펼치고 "n건 더 보기"로 나머지를 열며, 구독 설정 패널은 저장 공고 목록 아래·알림과 로컬 저장 안내 위에 둬 저장 공고가 첫 화면에 보이게 한다. 알림 아이콘은 1254px 로고 대신 128px 전용 자산 `notification-icon.png`를 쓰고 CF-161 마감 알림도 같은 자산을 쓴다. 온보딩 하단 안내와 설정 패널에 "OS 알림이 꺼져 있어도 아이콘 숫자와 공지함으로 새 공고를 알 수 있다"를 적는다. 추가분은 모두 설정으로 되돌릴 수 있는 화면 동작이라 ADR 없이 이 topic에 근거를 남긴다. 계측 확장은 [공고 알림 계측 payload](usage-analytics.md)에 있다.

## 직무 선택 입력 (후보 10)

팀이 등록하는 공채 공고는 직무가 하나로 정해지지 않는 경우가 많아 직무를 선택 항목으로 바꿨다(#348과 함께). 확장은 푸시 payload와 진행 중 공고 목록에서 `role`이 없거나(백엔드는 직무가 없으면 필드를 생략) 빈 문자열이면 직무 없음(`""`)으로 받아 공고를 버리지 않고 공고 ID·회사·링크·기간 검증은 그대로 둔다. 문자열이 아니거나 길이·제어문자 규칙에 어긋난 `role`은 기존처럼 버린다. 알림 제목은 직무가 있으면 "회사 · 직무", 없으면 회사명만이고 공지함 카드와 저장 공고 카드는 직무 줄을 숨긴다. CF-161 로컬 공고 모델은 `validateInput`이 회사명만 필수("회사명을 입력해 주세요.")이고 공고 저장 폼의 직무 `required`를 없앴으며 기존 저장 데이터는 그대로 읽힌다. 계측 속성 변화는 없다. 직무 없는 공고는 이 변경이 포함된 확장 버전에서만 보이므로 스토어 보급이 끝나기 전에는 팀이 직무를 비워 등록하지 않는다.

## 근거

- `frontend/src/job-postings/push-api.ts`, `push-subscription.ts`, `push-receiver.ts`, `push-background.ts`, `push-background-handler.ts`, `push-client.ts`, `push-messages.ts`, `push-settings.ts`, `server-posting.ts`, `notification-check.ts`, `unread-postings.ts`, `use-push-state.ts`, `VisibilityCheck.tsx`, `SubscriptionSettings.tsx`, `OnboardingNotificationCard.tsx`, `NoticeBoard.tsx`, `JobPostings.tsx`
- `frontend/site/SiteApp.tsx`(온보딩 카드), `frontend/entrypoints/onboarding/App.tsx`, `frontend/entrypoints/sidepanel/App.tsx`(미확인 개수), `frontend/public/notification-icon.png`
- `frontend/src/job-postings/model.ts`(`validateInput`), `PostingForm.tsx`, `PostingList.tsx`, `background-handler.ts`(직무 선택 입력)
- `frontend/entrypoints/background.ts`, `frontend/wxt.config.ts`(`minimum_chrome_version`)
- `frontend/README.md`의 "공고 알림 구독(Web Push)"
- `backend/src/main/java/com/careerform/notification/NotificationController.java`(PR #351, CF-348)
- Issue #349 본문

## 검증 경계

Chrome API 대역과 가짜 시계·가짜 fetch로 구독 등록·재등록·해지·재시도, push 이벤트의 알림 생성, 중복·마감 억제, 알림 클릭의 열기·저장 연결, 공지함 목록·오류·저장, 테스트 알림과 응답 기록, 권한 `denied` 안내, 카드 노출 조건, 배지 증감·복원, 자동 저장·취소·설정 끔, 온보딩 발신자 허용, 계측 속성 제한을 자동 테스트로 확인했다.

2026-10-26 로컬 실기동(로컬 백엔드 CF-348, Google Chrome 155와 Chrome for Testing 156 별도 프로필, 합성 공고)에서 설치 직후 서버 구독 등록, 합성 공고의 FCM 수락 뒤 수 초 안의 알림 생성, 끄기·켜기에 따른 서버 구독 수 변화, 브라우저 완전 종료 중 등록한 공고의 재시작 뒤 도착, 죽은 endpoint의 410 처리, 공지함 마감순·3건 접기, 배지 증가·공지함 열람 뒤 0·재시작 뒤 복원, 사이드 패널 개수, 온보딩 카드와 "안 보였어요" 뒤 설정 안내, 공지함 열기 자동 저장과 취소를 확인했다. OS 알림이 화면에 실제로 그려지는지와 알림 클릭 경로(열기·자동 보임·개별 배지 제거·알림 경로 자동 저장과 저장 취소)는 자동화 수단이 없어 사람 확인 사항이고, Chromium 파생 브라우저(Aside)는 수신·공지함·저장은 정상이지만 OS 알림을 표시하지 않는다. Chromium 계열의 구독 endpoint 호스트는 Chrome과 다를 수 있어 백엔드의 허용 endpoint 호스트 설정과 맞춰야 한다.
