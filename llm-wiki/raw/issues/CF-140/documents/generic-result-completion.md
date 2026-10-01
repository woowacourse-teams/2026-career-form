# 범용 입력 결과의 실제 값 기반 완료 판정

> Issue: [CF-140](https://github.com/woowacourse-teams/2026-career-form/issues/140)
> Collected: 2026-10-01
> Approval-Digest: f613f99c662b07a118bee6e68460f9417d62a0e98246c1c318e9938bd2d78892
> Source-Revision: b63ee0327d26cd7984f9211c7f583c78eee19ef6

## 유지하는 패널 실행 흐름

자동 기입은 content script의 in-page 지원서 패널 하나에서 로딩, 필요한 확인과 결과를 표시한다. Chrome 기본 side panel의 요청도 같은 host로 연결한다. 목록 복귀는 검색 상태와 시작 초점을 복원하고, 패널 닫기는 workflow를 정리한 뒤 host를 숨긴다.

반복 시작과 이전 닫기 콜백을 구분해 새 workflow를 보호한다. 분석·재분석과 실제 쓰기는 서로 다른 상태로 표시하며, reduced-motion과 live region·busy 분리 및 StrictMode 실행 수명 복원의 기존 경계를 유지한다.

이 기반 흐름은 CF-90 원문 `llm-wiki/raw/issues/CF-90/documents/extension/autofill-panel-workflow.md`를 계승하며, bundle manifest의 Supersedes로 연결한다. CF-140은 아래 범용 입력 결과 판정만 갱신한다.

## 완료 기준

범용 `LLM_SUGGESTED` 항목은 사용자가 승인한 실제 쓰기가 성공하고, 읽을 수 있는 현재 칸 값이 기존 `matchesResultValue` 기준으로 기대값과 일치하면 완료로 집계한다. 입력 전 `needs-review`였던 조건부 범용 항목도 같은 기준을 적용한다.

현재 값 불일치, 빈 값, 읽기 불가 또는 `progressStateFor`의 false 판정은 `입력 결과 확인`으로 남긴다. 쓰기 미실행과 실패, 숨김, 기존 값 유지와 재시도 회복의 기존 분류를 유지한다. 실제 쓰기 기록이나 현재 값 확인 없이 수집 시점의 값만으로 완료를 추정하지 않는다.

입력 전 선택과 승인, 덮어쓰기 정책, 회사 어댑터 판정과 값 정규화는 유지한다. 완료 표시는 입력값 반영 확인이며 매핑 의미의 정확성이나 지원서 저장·제출 완료를 보증하지 않는다.

## 두 결과 판정 경로

`result-model.ts`는 결과 패널의 완료·확인 필요 항목을 만들고, `progress-model.ts`의 verifier는 실제 칸에 과거 쓰기가 아직 반영돼 있는지 검사한다.

기존 두 경로는 값이 일치해도 `LLM_SUGGESTED` 출처를 이유로 미검증 처리했다. 결과 모델의 출처 차단만 제거하면 모델 단위 테스트는 통과하지만 실제 workflow에서 verifier가 false를 반환해 완료 집계가 올라가지 않는다.

두 경로 모두 `LLM_SUGGESTED`를 현재 값 검증 대상으로 허용한다. `ADAPTER_VERIFIED`의 기존 판정과, 두 매핑 근거가 없는 `needs-review`를 미검증으로 남기는 경계를 유지한다. 결과 모델에서 false verifier를 무시하지 않는다.

## 검증 근거

구현 전 일반·조건부 범용 일치값 모델 테스트와 production workflow 테스트가 실패했고, tracker의 범용 일치값 검증 테스트도 실패했다. 두 출처 차단을 함께 변경한 뒤 관련 9개 파일의 144개 테스트가 통과했다.

```sh
cd frontend
npm test -- src/autofill/workflow/result-model.test.ts src/autofill/workflow/result-field-state.test.ts src/autofill/workflow/AutofillWorkflow.results.test.tsx src/autofill/workflow/WorkflowResults.test.tsx src/autofill/workflow/WorkflowResults.summary.test.tsx src/autofill/workflow/result-value-match.greeting.test.ts src/autofill/workflow/greeting-result-registry.test.ts src/autofill/workflow/progress-model.test.ts src/autofill/workflow/progress-model.disabled-retry.test.ts
```

합성 지원서에서 production `AutofillWorkflow`, 수집기, writer, tracker와 결과 패널을 실제 브라우저로 실행했다. 분석 응답만 결정적인 범용 대역으로 고정했다.

- 일반 텍스트와 조건부 선택의 실제 쓰기 후 완료 2개·확인 필요 0개를 확인했다.
- 쓰기 후 실제 값을 변경하면 완료 1개·확인 필요 1개와 결과 확인 안내가 표시됐다.
- 쓰기 후 입력칸을 제거해 읽기 불가로 만들면 완료 1개·확인 필요 1개로 바뀌었다.
- 1280×900과 390×844 화면에서 가로 넘침과 겹침 없이 결과를 확인했다. 테스트 브라우저, 서버, profile과 임시 fixture를 정리했다.

타입 검사, lint, 변경 파일 포맷, extension build·zip과 전체 하네스 검증을 통과했다. 전체 frontend 커버리지에서는 별도 통합 테스트의 시간 초과와 후속 assertion 실패가 남았다. 동일 실패 파일의 기준 코드 비교에서도 실패가 있었고, 변경 쪽에서만 보인 네 현대차 사례는 분리 실행 시 기준·변경 코드 모두 통과했다. 전체 커버리지는 통과로 기록하지 않는다.

## 참고 코드

- `frontend/src/autofill/workflow/result-model.ts`
- `frontend/src/autofill/workflow/progress-model.ts`
- `frontend/src/autofill/workflow/result-model.test.ts`
- `frontend/src/autofill/workflow/progress-model.test.ts`
- `frontend/src/autofill/workflow/AutofillWorkflow.results.test.tsx`
