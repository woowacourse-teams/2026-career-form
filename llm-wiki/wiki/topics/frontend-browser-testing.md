# 프론트 브라우저 테스트

> Topic: frontend-browser-testing
> Status: Current
> Current: [CF-304 shard 실행과 병합 검증 경계](../../raw/issues/CF-304/documents/frontend-test-sharding.md)
> History: [CF-304 shard 실행과 병합 검증 경계](../../raw/issues/CF-304/documents/frontend-test-sharding.md); [CF-178 실행 경계](../../raw/issues/CF-178/documents/browser-testing.md)
> Updated: 2026-10-20

## 현재 상태

기존 jsdom 단위 테스트와 Playwright Chromium 상호작용 테스트를 Vitest의 별도 프로젝트로 실행한다. 합성 달력, 실제 같은 출처 iframe 탐색, Shadow CSS 클릭 전달은 브라우저에서 확인하고, 기존 단위 회귀와 네 지표 80% 커버리지 기준을 유지한다.

로컬 `npm run coverage`는 한 명령으로 두 프로젝트를 실행한다. CI는 세 shard job이 blob 보고서를 만들고, 병합 job이 보고서 세 개를 확인한 뒤 `npm run coverage:merge`로 테스트 실패, browser 미수집, 커버리지 미달을 검사한다. shard 실행은 커버리지 기준을 검사하지 않는다. 브라우저 미수집이나 미설치를 성공으로 처리하지 않는다. 이 계층의 성공을 설치 확장 E2E, 실사이트 성공률 또는 R1 기준선으로 해석하지 않는다. 원격 CI 성공은 실제 PR check를 별도로 확인한다.

## 변경 이유

jsdom의 문서 속성 재정의와 CSS 모사만으로는 실제 포커스, iframe 문서 수명과 클릭 전달을 입증할 수 없어 브라우저가 필요한 경계만 분리했다(CF-178). 단일 워커, 단일 job 실행은 테스트 시간 총합이 CI 시간이 되어 러너 편차만으로 제한 시간을 넘었기 때문에 shard 분할과 병합 검증으로 바꿨다(CF-304). 세부 대안은 연결된 raw의 ADR에서 확인한다.
