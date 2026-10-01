# SK·현대 실시간 옵션 선택 보완

> Topic: adapter-live-option-selection
> Status: Current
> Current: [CF-82 SK·현대 실시간 옵션 선택 보완](../../raw/issues/CF-82/documents/adapter/live-option-selection.md)
> History: [CF-82 SK·현대 실시간 옵션 선택 보완](../../raw/issues/CF-82/documents/adapter/live-option-selection.md)
> Updated: 2026-09-09

## 현재 상태

표준 ID가 있는 어학 값은 SK·현대의 현재 화면에서 확인한 정확히 하나의 옵션으로만 선택한다. 자유 텍스트와 0개·복수 후보는 자동 선택하지 않는다.

## 변경 이유

회사별 실제 선택지·코드를 우선해 정적 코드와 유사도 추측으로 인한 오입력을 막는다.
