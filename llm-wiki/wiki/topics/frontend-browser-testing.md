# 프론트 브라우저 테스트

> Topic: frontend-browser-testing
> Status: Current
> Current: [CF-178 실행 경계](../../raw/issues/CF-178/documents/browser-testing.md)
> History: [CF-178 실행 경계](../../raw/issues/CF-178/documents/browser-testing.md)
> Updated: 2026-10-11

## 현재 상태

기존 jsdom 단위 테스트와 Playwright Chromium 상호작용 테스트를 Vitest의 별도 프로젝트로 실행한다. 합성 달력, 실제 같은 출처 iframe 탐색, Shadow CSS 클릭 전달은 브라우저에서 확인하고, 기존 단위 회귀와 네 지표 80% 커버리지 기준을 유지한다.

CI는 같은 coverage 명령으로 두 프로젝트를 실행한다. 브라우저 미수집이나 미설치를 성공으로 처리하지 않는다. 이 계층의 성공을 설치 확장 E2E, 실사이트 성공률 또는 R1 기준선으로 해석하지 않는다. 원격 CI 성공은 실제 PR check를 별도로 확인한다.

## 변경 이유

jsdom의 문서 속성 재정의와 CSS 모사만으로는 실제 포커스, iframe 문서 수명과 클릭 전달을 입증할 수 없어 브라우저가 필요한 경계만 분리했다. 세부 대안은 연결된 raw의 ADR에서 확인한다.
