# 프론트 lint의 TS 소스 제외와 typecheck 미실행 관찰

> Issue: CF-368
> Collected: 2026-10-29
> Approval-Digest: 0ca1b67136be3ae037b664c3398b75b7d43ff56854e386b64df2836d2e9144a5
> Source-Revision: bd1f21a776d4de1461717ac108125248f994711c

이 문서는 2026-10-29 CF-368의 자동 검증 중 관찰해 승인된 후보 11을 수집한 기록이다. Approval-Digest의 계산 방식과 원문은 [manifest](../manifest.md)와 [승인 후보 스냅샷](approved-candidates.md)을 따른다. CF-368은 이 관찰을 고치지 않았다.

## 관찰

- `frontend/eslint.config.js`가 `**/*.{ts,tsx}`를 `ignores`에 두어, `npm run lint`(`eslint .`)는 TS 소스를 검사하지 않는다. lint 통과는 TS·TSX 코드의 lint 통과를 뜻하지 않는다.
- develop `dcee68dd`에서 `npm run typecheck`(`wxt prepare && tsc --noEmit`)가 `native-executor.static-gate.test.ts`의 TS2322로 이미 실패한다. CF-368 변경과 무관한 기존 실패다.
- frontend CI(`.github/workflows/frontend-ci.yml`)와 `harness/scripts/verify.py`는 typecheck를 실행하지 않으므로 이 실패가 검사에 걸리지 않는다.

## 영향

Issue의 자동 검증 목록이 `npm run typecheck && npm run lint`를 요구해도, 현재는 typecheck가 기존 실패로 끝나고 lint는 TS 소스를 보지 않는다. 변경 파일의 타입 오류는 typecheck 출력에서 기존 TS2322 외의 새 오류가 없는지로 따로 확인해야 한다. 이 공백을 메우는 작업(TS lint 범위, typecheck의 CI·`verify.py` 편입, 기존 TS2322 수정)은 별도 후보다.
