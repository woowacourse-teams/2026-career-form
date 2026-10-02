# 선택적 이용 계측과 개인정보 경계

> Issue: [CF-147](https://github.com/woowacourse-teams/2026-career-form/issues/147)
> Collected: 2026-10-02
> Approval-Digest: 6e01ddd1fe145b97cfe572a34fa01dac1efb3844d81c27ffca19eb3354086e65
> Source-Revision: 02cae24217a2ab02e3b65b5d32492b8a8c3f3421

## 결정과 이유

사용자 동작을 파악하는 PostHog 계측은 명시 이벤트와 `surface`, 지원서 안 패널의
호스트명만 허용한다. 프로필 값, 지원서 입력값과 전체 URL은 제외한다. 익명 식별자는
확장의 `chrome.storage.local` 또는 웹 사이트의 `localStorage`에 로컬 저장한다.
계측 키가 없으면 전송과 식별자 생성을 하지 않는다.

확장은 runtime 메시지를 백그라운드로 전달하며, 백그라운드가 이벤트 이름과 화면을
허용 목록으로 검사하고 추가 속성을 버린다. `page_host`는 지원서 안 패널의 호스트명
형태만 남긴다. SDK와 계측용 host permission을 추가하지 않는다. 웹 사이트는 직접
전송한다. 계측 실패는 사용자 작업을 중단하지 않는다.

## 고지의 확정 경계

개인정보 고지는 검토용 초안이다. 운영 수집 설정, 접속 정보 처리, 보유 기간과 국외
이전은 사람이 검토한 뒤 확정한다. 로컬 프로필 원칙을 제품 전체의 외부 전송 없음으로
표현하지 않는다.

## 근거와 검증 경계

자동 테스트로 키 없는 전송과 식별자 생성의 차단, 금지 속성 제거, 잘못된 호스트명
제거와 동시 최초 이벤트의 식별자 재사용을 확인했다. 실제 확장 및 웹 사이트의 버튼
클릭을 로컬 수집 서버에서 확인했으며, API와 다른 호스트의 수집 서버에 host permission
없이 전송했다. 키 없는 빌드에서는 같은 동작 뒤 계측 요청과 익명 식별자가 없었다.
실제 PostHog 프로젝트 수집 결과나 운영 고지의 적법성 검토를 대신하지 않는다.

## 참고 코드

- `frontend/src/analytics/events.ts`
- `frontend/src/analytics/posthog.ts`
- `frontend/src/analytics/background-analytics.ts`
- `frontend/site/analytics.ts`
- `frontend/site/policies.ts`
