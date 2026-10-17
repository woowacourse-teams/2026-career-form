# 범용 드롭다운의 구조 클릭 허용 경계

> Topic: generic-dropdown-click-gate
> Status: Current
> Current: [CF-244 구조 클릭 허용 경계](../../raw/issues/CF-244/documents/generic-dropdown-click-gate.md)
> History: [CF-244 구조 클릭 허용 경계](../../raw/issues/CF-244/documents/generic-dropdown-click-gate.md)
> Updated: 2026-10-17

## 현재 상태

범용 드롭다운 수집은 isSafeStructuralClick(...).allowed를 그대로 따른다. aria-label이나 title의 금지 판정을 보이는 문구로 우회하지 않으며, 허용 메뉴와 금지 accessible label을 분리해 검증한다. 선택 인자를 생략한 collector 동작은 유지한다.

기존 수집 범위와 메뉴 소유권은 [범용 버튼 드롭다운 안전성](generic-button-dropdown-safety.md)을 함께 따른다.

## 변경 이유

범용 API 분석 전에 구조 클릭 정책이 금지한 행동을 수집기 예외로 실행하지 않도록 허용 경계를 고정한다.
