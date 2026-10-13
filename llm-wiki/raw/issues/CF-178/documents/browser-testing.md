# 프론트 브라우저 테스트 실행 경계

근거: [CF-178](https://github.com/woowacourse-teams/2026-career-form/issues/178).

Approval-Digest: a44d4319a65cb6f0fc17934d216e915b38e1c1fec8acb5c1d1839957fa6b7013

## 실행 계약

Vitest 4.1.10의 `unit` 프로젝트는 기존 jsdom 테스트를 유지하고, `browser` 프로젝트는 Playwright 1.64.0의 Chromium을 사용한다. `npm test`와 `npm run coverage`는 두 프로젝트를 실행한다. 단위 테스트만 선택할 때는 `npm run test:unit`을 사용한다.

브라우저 프로젝트는 합성 달력, 실제 같은 출처 GET 검색 iframe, Shadow CSS 클릭 전달의 8개 사례를 검증한다. 날짜와 검색 실행기는 실제 제품 함수를 호출하고, Shadow 테스트는 제품 CSS와 실제 포인터 입력을 사용한다. iframe 문서 속성이나 레이아웃 결과를 mock하지 않는다. 기존 테스트와 제품 코드의 동작은 변경하지 않는다.

기본 combined 실행에서 browser 테스트가 수집되지 않거나 Chromium이 설치되지 않은 경우 비정상 종료한다. 명시적인 unit-only 실행은 허용한다. 이 실패 경계와 브라우저 8개 사례는 로컬 실행으로 확인했다.

CI는 `npm run coverage` 한 번으로 두 프로젝트와 통합 제품 커버리지를 검증한다. statements, branches, functions, lines의 80% 기준을 유지한다. 이번 Issue에 workflow를 통합하는 사람의 예외 승인과 `harness-change` 라벨은 공통 보호 검사를 대체하지 않는다.

## 검증 해석

합성 fixture의 Chromium 성공은 설치된 MV3 확장 프로그램 E2E나 실제 회사 지원서의 R1 기준선이 아니다. 실제 값, 계정, 세션 또는 회사 DOM을 이 테스트에 수집하지 않는다. 로컬 통과와 원격 CI 통과도 구분하며, 원격 실행 결과는 해당 PR의 검증 기록과 check에서 확인한다.

계층 분리의 대안과 장기 결정은 [ADR](adr/178-browser-interaction-test-boundary.md)에 기록한다.
