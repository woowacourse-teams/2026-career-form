# 지원서 패널 안 자동 기입 흐름

> Topic: autofill-panel-workflow
> Status: Current
> Current: [CF-90 패널 안 자동 기입 흐름](../../raw/issues/CF-90/documents/extension/autofill-panel-workflow.md)
> History: [CF-90 패널 안 자동 기입 흐름](../../raw/issues/CF-90/documents/extension/autofill-panel-workflow.md)
> Updated: 2026-09-12

## 현재 상태

자동 기입은 content script의 in-page 지원서 패널 하나에서 로딩, 필요한 확인과 결과를 표시한다. Chrome 기본 side panel의 요청도 같은 host로 연결한다. 목록 복귀는 검색 상태와 시작 초점을 복원하고, 패널 닫기는 workflow를 정리한 뒤 host를 숨긴다.

반복 시작과 이전 닫기 콜백을 구분해 새 workflow를 보호한다. 분석/재분석과 실제 쓰기를 다른 상태 문구로 표시하며, 스피너의 reduced-motion 대응과 live region/busy 분리, StrictMode 실행 수명 복원을 유지한다.

## 변경 이유

분석 중 빈 모달 헤더만 보이던 UI를 제거하고 지원서 패널 안에서 일관된 진행·종료 흐름을 제공한다. 표시 계층 변경으로 기존 매핑·승인·입력 정책을 바꾸지 않는다.
