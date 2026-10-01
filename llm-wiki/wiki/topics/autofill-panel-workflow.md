# 지원서 패널 안 자동 기입 흐름

> Topic: autofill-panel-workflow
> Status: Current
> Current: [CF-140 범용 입력 결과의 완료 판정](../../raw/issues/CF-140/documents/generic-result-completion.md)
> History: [CF-90 패널 안 자동 기입 흐름](../../raw/issues/CF-90/documents/extension/autofill-panel-workflow.md), [CF-140 범용 입력 결과의 완료 판정](../../raw/issues/CF-140/documents/generic-result-completion.md)
> Updated: 2026-10-01

## 현재 상태

자동 기입은 content script의 in-page 지원서 패널 하나에서 로딩, 필요한 확인과 결과를 표시한다. Chrome 기본 side panel의 요청도 같은 host로 연결한다. 목록 복귀는 검색 상태와 시작 초점을 복원하고, 패널 닫기는 workflow를 정리한 뒤 host를 숨긴다.

반복 시작과 이전 닫기 콜백을 구분해 새 workflow를 보호한다. 분석/재분석과 실제 쓰기를 다른 상태 문구로 표시하며, 스피너의 reduced-motion 대응과 live region/busy 분리, StrictMode 실행 수명 복원을 유지한다.

## 범용 입력의 완료 판정

범용 `LLM_SUGGESTED` 항목은 승인된 실제 쓰기 성공과 현재 값 일치가 확인되면 완료로 집계한다. 입력 전 `needs-review`였던 항목도 동일하며, 현재 값 불일치·빈 값·읽기 불가와 false verifier는 확인 필요에 남긴다. 입력 전 승인·덮어쓰기 정책과 어댑터 판정은 유지한다.

결과 모델과 progress verifier가 함께 현재 값을 확인한다. 두 경로의 범용 출처 차단을 함께 갱신하며, 매핑 근거 없는 `needs-review`는 미검증으로 유지한다. 모델 단위 테스트와 production workflow의 실제 DOM 값·완료 수 회귀 테스트로 이 연계를 검증한다. [CF-140 근거](../../raw/issues/CF-140/documents/generic-result-completion.md)

## 변경 이유

분석 중 빈 모달 헤더만 보이던 UI를 제거하고 지원서 패널 안에서 일관된 진행·종료 흐름을 제공한다. 표시 계층 변경으로 기존 매핑·승인·입력 정책을 바꾸지 않는다.

CF-140은 실제 값이 반영된 범용 항목을 출처만으로 확인 필요에 남기던 판정을 변경한다. 완료는 입력값 반영 여부의 확인이며 매핑 의미, 저장 또는 제출 완료의 보증이 아니다.
