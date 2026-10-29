# Greeting 가져오기 노출 계측

> Issue: CF-361
> Collected: 2026-10-29
> Approval-Digest: ec3886f25f760674ba26c7d55d133822bd370a831846397fa30d604fc15f6d91
> Source-Revision: 94d54d49a984e2df69194346bc56d23dada4fe69

이 문서는 2026-10-29에 승인된 CF-361 후보 1을 수집한 기록이다. Approval-Digest는 [승인 후보 스냅샷](approved-candidates.md) 전체 UTF-8 바이트의 SHA-256이다.

## 결정

지원서 안 패널이 열릴 때 설치된 정책이 Greeting 폼으로 인식하면 `greeting_import_offered`를 한 번 기록한다. 이 이벤트가 가져오기 깔때기의 분모이며, `greeting_import_viewed`와 `greeting_import_saved`는 그 아래 단계다.

## 발생 시점과 경계

`InPageProfilePanel`이 마운트될 때 `prepareImportPolicy`로 실행 정책을 한 번 준비하고, `recognizesGreetingForm(document)`(정책 컴포넌트 섹션이 있는지)가 참일 때만 기록한다. 마운트 시 정책 요청과 가져오기 버튼 클릭 시 요청이 겹치면 진행 중인 요청 하나를 공유해 요청은 한 번만 나간다. 정책 로드 실패와 정책이 인식하지 않는 페이지에서는 기록하지 않고 패널과 가져오기 버튼은 그대로 동작한다. 속성은 `surface`(`in_page_panel`)와 `page_host`(호스트명)뿐이며 프로필 값, 지원서 입력값, 전체 URL은 보내지 않는다. 키 없는 빌드는 전송하지 않는다.

## 배경

CF-271의 `greeting_import_viewed`, `greeting_import_saved`는 스토어 v1.4.0(2026-10-23 배포)에 포함됐지만 2026-10-29 기준 0건이었고, 노출 이벤트가 없어 "Greeting 페이지에 온 사람이 없었다"와 "보고도 누르지 않았다"를 구분할 수 없었다. 가져오기 버튼은 지원서 안 패널에서 항상 보이므로 버튼 표시가 아니라 정책 인식을 노출 기준으로 삼는다.

## 근거와 검증 경계

합성 Greeting 픽스처로 `InPageProfilePanel.import.test.tsx`가 인식된 폼에서 한 번 기록, 비인식 페이지 미기록, 정책 로드 실패 미기록을 확인했다. 운영 PostHog 수집 확인은 사람 확인 사항으로 남는다.

## 참고 코드

- `frontend/src/analytics/events.ts`
- `frontend/src/extension/InPageProfilePanel.tsx`
- `frontend/src/profile/page-import/reader.ts`
