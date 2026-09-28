# 범용 연월 달력 선택과 로컬 실행 경계

> Topic: generic-calendar-selection
> Status: Current
> Current: [CF-118 readonly 연월일 달력 선택 경계](../../raw/issues/CF-118/documents/generic-calendar-selection.md)
> History: [근거 1](../../raw/issues/CF-104/documents/adr/104-generic-calendar-selection.md); [근거 2](../../raw/issues/CF-118/documents/generic-calendar-selection.md)
> Updated: 2026-09-28

## 현재 상태

읽기 전용 달력은 회사별 selector가 아니라 검증 가능한 DOM 소유권과 날짜 단위 구조를 지원 단위로 삼는다. `SELECT_DATE`와 일반 입력 승인을 분리하고, 브라우저가 원본 날짜 검증, 대상 값 계산, 실행 예산·중단, 팝업 소유권, 실제 값 유지 및 다른 필드 부수 효과를 확인한다. 월 달력에서 모델은 날짜 값·HTML·승인 정보 없이 비식별 후보 역할 ID만 선택하거나 기권한다. 기존 직접 입력·검색 경로는 유지한다.

CF-118부터 ui-datepicker 계열 연월일 달력은 월 승인과 분리된 일 단위 승인으로 처리한다. 공유 루트 달력의 소유권은 닫힌 상태에서 대상 opener를 활성화한 뒤 그 달력 하나만 표시되는지로 증명하고, 월 select는 0~11 값과 라벨이 일치할 때만 신뢰한다. 연도·월 변경 뒤 DOM을 재조회해 정확한 일자 하나만 누른다. 한 입력칸에 월 달력과 연월일 달력이 함께 감지되면 보류한다.

가상화·화살표 전용 탐색, 인라인 달력과 그 밖의 날짜 위젯은 자동 추정하지 않는다. 합성 fixture 및 설치 UI 테스트의 성공은 실제 지원서 입력 검증으로 간주하지 않는다.

## 변경 이유

읽기 전용 달력은 단순 텍스트 형식 변환과 다른 UI 상태 전이가 필요하다. 회사별 고정 DOM과 무제한 클릭 실행을 피하면서 개인정보와 사용자의 개별 승인을 보존하기 위해 로컬 상태 머신 경계를 선택했다. CF-118은 의미 매핑이 입사일·종료일을 `SELECT_DATE`로 판단해도 월 달력만 조작할 수 있던 한계를, 공유 루트 연월일 달력의 소유권 증명과 정확한 일자 확인으로 보완했다.
