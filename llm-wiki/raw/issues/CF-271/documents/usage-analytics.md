# Greeting 가져오기 진입과 저장 완료 계측

> Issue: [CF-271](https://github.com/woowacourse-teams/2026-career-form/issues/271)
> Collected: 2026-10-21
> Approval-Digest: dbc296eaa5b5917ca69dc5431dd4f54ef1543cbfb1c8cf8c22a0ca85da05d840
> Source-Revision: 0de01651f6ce0d02f56038013c724d212096e987

## 결정

Greeting 지원서 가져오기에 `greeting_import_viewed`와 `greeting_import_saved` 이벤트를 추가한다. viewed는 가져오기 버튼으로 검토 화면을 연 시점이며 읽기 성공을 뜻하지 않는다. saved는 선택한 값의 저장이 성공했을 때만 기록하고 취소, 읽기와 저장 실패, 충돌, 중복 클릭에서는 기록하지 않는다. 가져오기로 비어 있지 않은 프로필을 저장하면 기존 `profile_first_saved`를 같은 최초 이벤트 중복 방지 규칙으로 기록한다. 속성은 기존과 같은 `surface`와 지원서 안 패널의 `page_host`뿐이다.

## 저장 경계

Greeting 가져오기 저장은 `saveIfUnchanged` 비교 저장으로 충돌을 막는다. 일반 `save`만 감싸는 `useProfileSaveTracking`은 이 메서드를 전달하지 않아 충돌 보호를 잃으므로 쓰지 않고, 저장 성공 스냅샷을 받은 `PageImport`에서 이벤트를 직접 기록한다.

## 발생 화면

가져오기 reader는 지원서 안 패널(`InPageProfilePanel`)에만 주입되어 운영의 가져오기 이벤트 `surface`는 `in_page_panel`만 발생한다. 크롬 기본 사이드 패널(`sidepanel.html`)은 같은 App을 쓰지만 가져오기 버튼이 없다.

## 계측 도구

제품 이용 계측은 PostHog 명시 이벤트만 사용하며 GA 등 다른 분석 도구나 SDK는 사용하지 않는다. CF-147과 CF-193의 허용 속성, 로컬 익명 식별자, 키 없는 빌드 차단과 계측 실패 격리 경계는 그대로 유지한다.

## 근거와 검증 경계

합성 값으로 App의 양쪽 모드, PageImport의 저장 성공, 취소, 읽기와 저장 실패, 충돌, 중복 저장, 계측 예외와 키 없는 빌드를 자동 테스트로 확인했다. 실제 브라우저의 로컬 수집 확인과 운영 PostHog 수집 확인은 사람 확인 사항으로 남는다.

## 참고 코드

- `frontend/src/analytics/events.ts`
- `frontend/src/profile/page-import/PageImport.tsx`
- `frontend/entrypoints/sidepanel/App.tsx`
- `frontend/src/extension/InPageProfilePanel.tsx`
