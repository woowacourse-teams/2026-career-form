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

OS 알림 허용은 확장이 감지할 수 없으므로 사용자 응답으로 확인한다. 테스트 알림은 사용자의 버튼 클릭으로만 띄우고 응답(`careerForm.push.visibility`)을 로컬에 기록하며, 공고 알림 클릭은 자동으로 보임이다. 온보딩 카드(확장에서만), 지원 공고 탭의 질문·확인 카드, 설정 패널 결과 행에서 확인하고, 안 보였거나 권한이 `denied`면 OS별 설정 경로를 글로 안내한다. 새 공고 알림마다 아이콘 배지 숫자(`careerForm.push.unread`)가 늘고 공지함 열람에 0이 되며 서비스워커 재시작 뒤 복원되고, 사이드 패널 "지원 공고 관리" 버튼에 같은 숫자가 보인다. 설정 "공고를 열면 마감 알림에 자동 저장"(기본 켜짐)이 켜져 있으면 알림·공지함에서 공고를 열 때 CF-161 공고로 저장하고 후속 알림의 "저장 취소" 또는 카드의 "취소"로 되돌린다. 공지함은 3건까지 펼치고, 구독 설정 패널은 저장 공고 목록 아래에 있으며, 알림 아이콘은 128px 전용 자산이다. onboarding.html은 상태 조회·끄기·테스트·결과 기록만 보낼 수 있다. 직무는 선택 항목이다. payload·목록에서 `role`이 없거나 비어 있으면 직무 없는 공고로 받고, 알림 제목은 회사명만, 카드는 직무 줄을 숨기며, 로컬 공고 저장도 회사명만 필수다. 스토어 보급 전에는 팀이 직무를 비워 등록하지 않는다.

## 변경 이유

확장의 알림이 사용자가 직접 저장한 공고의 로컬 마감 알림뿐이라 팀이 등록한 새 공고를 받을 수단이 없었다. 2026-10-25 설계에서 전달 경로를 Web Push로 정하고 푸시를 놓친 사용자를 공지함으로 보완하기로 했다. 2026-10-26 로컬 통합 테스트에서 OS 알림 허용이 꺼지면 알림이 한 번도 보이지 않는데 확장과 사용자 모두 알 길이 없고, 알림 없이 새 공고를 알 수동 채널이 없으며, 알림 뒤 CF-161 저장으로 이어지는 흐름이 끊기는 문제가 확인돼 자가 진단·배지·자동 저장을 더했다. 같은 날 팀 공고의 직무가 하나로 정해지지 않는 경우가 많다는 결정으로 직무를 선택 입력으로 바꿨다.

## 관련 지식

- [선택적 이용 계측](usage-analytics.md)
- [확장·백엔드 호환 배포](release-compatibility.md)
- [범용 endpoint 부재의 frontend 오류 전달](generic-endpoint-unavailable.md)
- [확장 프로그램 릴리스](extension-release.md)
