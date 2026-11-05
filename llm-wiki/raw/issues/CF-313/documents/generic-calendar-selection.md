# 달력 기입의 공통 최종 값 확인

## 승인한 지식

- `frontend/src/autofill/write/executor.ts`의 `SELECT_DATE` 경로는 달력 실행기 성공만 믿고 결과를 반환해, 페이지가 값을 되돌려도 "입력 완료"로 보고될 수 있었다.
- 수정 뒤 settle 단계에서 대상 입력의 최종 값을 다시 읽어 승인 날짜와 대조한다(`calendar-executor.ts`의 `calendarValueSettled`). 불일치, 노드 교체 또는 분리가 있으면 `skipped(needs-verification, RETAINED_VALUE_UNCONFIRMED)`로 보고한다.
- 테스트에서 값을 되돌리는 시점은 첫 `written` 통지 안, 즉 최종 확인 이전이어야 결함이 재현된다. change 핸들러의 microtask에서 되돌리면 실행기 자체 검사에 먼저 걸려 이 경로를 검증하지 못한다.

## 근거와 경계

회귀 테스트는 `frontend/src/autofill/write/calendar-settle.test.ts`에 있다. 달력 소유권, 승인 분리와 기본 선택 경계(CF-104, CF-118, CF-307)는 바꾸지 않고, 다른 기입 명령과 같은 최종 값 확인을 `SELECT_DATE`에도 적용한 것이다. 실사이트 달력 실행은 이 수집 범위가 아니다.
