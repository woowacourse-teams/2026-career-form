# 지원서 패널 안 자동 기입 흐름

> Topic: autofill-panel-workflow
> Status: Current
> Current: [상태 드라이버 실패의 안전 범위 보류](../../raw/issues/CF-168/documents/autofill-panel-workflow.md)
> History: [CF-90 패널 안 자동 기입 흐름](../../raw/issues/CF-90/documents/extension/autofill-panel-workflow.md), [CF-140 범용 입력 결과의 완료 판정](../../raw/issues/CF-140/documents/generic-result-completion.md), [CF-142 버튼 드롭다운 값 보존과 실제 반영 판정](../../raw/issues/CF-142/documents/button-dropdown-result-completion.md), [CF-168 상태 드라이버 실패의 안전 범위 보류](../../raw/issues/CF-168/documents/autofill-panel-workflow.md)
> Updated: 2026-10-08

## 현재 상태

자동 기입은 content script의 in-page 지원서 패널 하나에서 로딩, 필요한 확인과 결과를 표시한다. Chrome 기본 side panel의 요청도 같은 host로 연결한다. 목록 복귀는 검색 상태와 시작 초점을 복원하고, 패널 닫기는 workflow를 정리한 뒤 host를 숨긴다.

반복 시작과 이전 닫기 콜백을 구분해 새 workflow를 보호한다. 분석/재분석과 실제 쓰기를 다른 상태 문구로 표시하며, 스피너의 reduced-motion 대응과 live region/busy 분리, StrictMode 실행 수명 복원을 유지한다.

## 범용 입력의 완료 판정

범용 `LLM_SUGGESTED` 항목은 승인된 실제 쓰기 성공과 현재 값 일치가 확인되면 완료로 집계한다. 입력 전 `needs-review`였던 항목도 동일하며, 현재 값 불일치·빈 값·읽기 불가와 false verifier는 확인 필요에 남긴다. 입력 전 승인·덮어쓰기 정책과 어댑터 판정은 유지한다.

결과 모델과 progress verifier가 함께 현재 값을 확인한다. 두 경로의 범용 출처 차단을 함께 갱신하며, 매핑 근거 없는 `needs-review`는 미검증으로 유지한다. 모델 단위 테스트와 production workflow의 실제 DOM 값·완료 수 회귀 테스트로 이 연계를 검증한다. [CF-140 근거](../../raw/issues/CF-140/documents/generic-result-completion.md)

## 버튼 드롭다운의 값 보존과 완료

수집·재열기는 다른 필드 값 보존을 검사하고 자체 probe의 부작용은 복구 후 중단한다. 실제 사용자 수정은 덮어쓰지 않으며 취소·지연 복수 메뉴도 정리한다. 비동기 재승인 뒤 현재 값, 원래 메뉴와 옵션을 입력 직전에 다시 확인한다.

선택 후 실제 표시값 반영을 구독하고 기존 결과 모델·progress verifier에 연결한다. click 성공만으로 완료를 집계하지 않는다. [소유 관계와 후보 범위](generic-button-dropdown-safety.md), [CF-142 근거](../../raw/issues/CF-142/documents/button-dropdown-result-completion.md)

## 상태 드라이버 실패의 안전 범위 보류

다른 입력란을 드러내거나 바꾸는 상태 드라이버가 실패해도, 어댑터가 실패 범위를 주거나 범용 드라이버가 DOM 변경 전에 실패했음이 증명되면 그 범위만 보류하고 나머지를 계속 입력한다. 변경 후이거나 불확실한 실패와 범위가 없는 어댑터 실패는 기존처럼 멈춘다. 실패 코드 `OPTION_UNMATCHED`와 원인별 보류 사유를 사용하며 프로필 값은 사유에 넣지 않는다. [CF-168 근거](../../raw/issues/CF-168/documents/autofill-panel-workflow.md)

## 변경 이유

분석 중 빈 모달 헤더만 보이던 UI를 제거하고 지원서 패널 안에서 일관된 진행·종료 흐름을 제공한다. 표시 계층 변경으로 기존 매핑·승인·입력 정책을 바꾸지 않는다.

CF-140은 실제 값이 반영된 범용 항목을 출처만으로 확인 필요에 남기던 판정을 변경한다. 완료는 입력값 반영 여부의 확인이며 매핑 의미, 저장 또는 제출 완료의 보증이 아니다.
