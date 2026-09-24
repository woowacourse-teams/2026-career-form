# 범용 연월 달력 선택과 로컬 실행 경계

> Topic: generic-calendar-selection
> Status: Current
> Current: [CF-104 승인된 ADR 후보](../../raw/issues/CF-104/documents/adr/104-generic-calendar-selection.md)
> History: [근거 1](../../raw/issues/CF-104/documents/adr/104-generic-calendar-selection.md)
> Updated: 2026-09-24

## 현재 상태

읽기 전용 연월 달력은 회사별 selector가 아니라 검증 가능한 DOM 소유권과 월 단위 구조를 지원 단위로 삼는다. `SELECT_DATE`와 일반 입력 승인을 분리하고, 브라우저가 원본 날짜 검증, 대상 연월 계산, 실행 예산·중단, 팝업 소유권, 실제 값 유지 및 다른 필드 부수 효과를 확인한다. 모델은 날짜 값·HTML·승인 정보 없이 비식별 후보 역할 ID만 선택하거나 기권한다. 기존 직접 입력·검색 경로는 유지한다.

일 단위·가상화·화살표 전용 탐색은 자동 추정하지 않는다. 합성 fixture 및 설치 UI 테스트의 성공은 실제 지원서 입력 검증으로 간주하지 않는다.

## 변경 이유

읽기 전용 달력은 단순 텍스트 형식 변환과 다른 UI 상태 전이가 필요하다. 회사별 고정 DOM과 무제한 클릭 실행을 피하면서 개인정보와 사용자의 개별 승인을 보존하기 위해 로컬 상태 머신 경계를 선택했다.
