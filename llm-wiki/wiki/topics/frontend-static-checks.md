# 프론트 정적 검사 범위

> Topic: frontend-static-checks
> Status: Current
> Current: [CF-368 프론트 lint의 TS 소스 제외와 typecheck 미실행 관찰](../../raw/issues/CF-368/documents/frontend-lint-and-typecheck-gaps.md)
> History: [CF-368 프론트 lint의 TS 소스 제외와 typecheck 미실행 관찰](../../raw/issues/CF-368/documents/frontend-lint-and-typecheck-gaps.md)
> Updated: 2026-10-29

## 현재 상태

2026-10-29 관찰 기준으로 `frontend/eslint.config.js`가 `**/*.{ts,tsx}`를 `ignores`에 두어 `npm run lint`는 TS 소스를 검사하지 않는다. develop `dcee68dd`에서 `npm run typecheck`는 `native-executor.static-gate.test.ts`의 TS2322로 이미 실패하며, frontend CI와 `harness/scripts/verify.py`는 typecheck를 실행하지 않는다.

따라서 lint 통과나 CI 통과를 TS 타입·lint 검사 통과로 해석하지 않는다. 변경의 타입 오류는 typecheck 출력에서 기존 TS2322 외의 새 오류가 없는지로 따로 확인한다. 테스트 실행 계층은 [프론트 브라우저 테스트](frontend-browser-testing.md)를 따른다.

## 변경 이유

CF-368의 자동 검증 중 Issue가 요구한 `npm run typecheck && npm run lint`가 기대한 범위를 검사하지 않는다는 것을 관찰해 기록했다. 고치는 작업은 별도 후보이며 CF-368에서 바꾸지 않았다.
