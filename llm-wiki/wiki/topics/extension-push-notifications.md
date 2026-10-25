# 확장 Web Push 구독과 공고 알림

> Topic: extension-push-notifications
> Status: Current
> Current: [CF-349 확장 Web Push 구독과 공고 알림](../../raw/issues/CF-349/documents/extension-push-notifications.md)
> History: [CF-349 확장 Web Push 구독과 공고 알림](../../raw/issues/CF-349/documents/extension-push-notifications.md)
> Updated: 2026-10-26

## 현재 상태

확장은 설치 하나를 구독 하나로 보고 설치, 브라우저 시작, 켜기, 재시도 알람, `pushsubscriptionchange`를 모두 `PushSubscriptionService.sync()`로 처리한다. 서버 VAPID 공개키로 `userVisibleOnly: false` 조용한 구독을 만들고 endpoint와 키를 서버에 등록하며, 서버가 endpoint로 중복 처리하므로 매번 다시 등록한다. 공개키가 바뀌면 기존 구독을 해제하고 다시 만든다. 끄기는 로컬 설정 off → 서버 해지 → 브라우저 해제 순서다. 상태 6종(`registered`, `disabled`, `unsupported`, `not_configured`, `endpoint_unavailable`, `failed`)을 로컬에 남기고 일시 오류만 `chrome.alarms`로 1·5·15·60분 백오프 재시도한다. manifest `minimum_chrome_version`은 121이다.

푸시 payload는 `push-api.ts`에서 검증하고 같은 공고 ID와 마감 지난 공고는 알림 없이 버린다. 알림은 본문 클릭과 "공고 열기" 버튼의 사용자 클릭으로만 탭을 열고, "마감 알림 저장"은 CF-161 `PostingService.save`에 기본 알림 시점(24시간·2시간 전)으로 저장한 뒤 결과를 확인 알림으로 구분한다. 관리 페이지 "지원 공고" 탭의 공지함은 진행 중 공고를 마감순으로 보여 주고 저장한 공고를 구분하며 백엔드 미설정, 엔드포인트 없음, 네트워크 오류를 분리해 안내한다.

API 계약의 확장 측 정본은 `frontend/src/job-postings/push-api.ts` 한 파일이며 2026-10-26 기준 Draft PR #351(CF-348)의 `NotificationController`와 일치한다(`/api/v1/notifications/*`, 해지는 POST, 필드 `link`·`opensAt`·`closesAt`). CF-348 머지 전까지 재확인이 필요하다. 서버 마감 변경은 로컬 리마인더에 반영되지 않고, 개인정보 고지 문구 확정은 사람 몫이다.

## 변경 이유

확장의 알림이 사용자가 직접 저장한 공고의 로컬 마감 알림뿐이라 팀이 등록한 새 공고를 받을 수단이 없었다. 2026-10-25 설계에서 전달 경로를 Web Push로 정하고 푸시를 놓친 사용자를 공지함으로 보완하기로 했다.

## 관련 지식

- [선택적 이용 계측](usage-analytics.md)
- [확장·백엔드 호환 배포](release-compatibility.md)
- [범용 endpoint 부재의 frontend 오류 전달](generic-endpoint-unavailable.md)
- [확장 프로그램 릴리스](extension-release.md)
