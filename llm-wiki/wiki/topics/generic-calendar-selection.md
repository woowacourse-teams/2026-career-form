# 범용 연월 달력 선택과 로컬 실행 경계

> Topic: generic-calendar-selection
> Status: Current
> Current: [CF-358 다른 컨트롤이 연 층은 날짜 기입의 변화로 세지 않음](../../raw/issues/CF-358/documents/generic-calendar-selection.md)
> History: [근거 1](../../raw/issues/CF-104/documents/adr/104-generic-calendar-selection.md); [근거 2](../../raw/issues/CF-118/documents/generic-calendar-selection.md); [CF-307 날짜 기본 선택과 반복 열 근거](../../raw/issues/CF-307/documents/generic-calendar-selection.md); [CF-313 달력 기입의 공통 최종 값 확인](../../raw/issues/CF-313/documents/generic-calendar-selection.md); [CF-355 실행이 연 달력의 드롭다운 확인 제외](../../raw/issues/CF-355/documents/generic-calendar-selection.md); [CF-358 다른 컨트롤이 연 층은 날짜 기입의 변화로 세지 않음](../../raw/issues/CF-358/documents/generic-calendar-selection.md)
> Updated: 2026-10-29

## 현재 상태

범용 `SELECT_DATE` 대상은 유효한 월·일 달력 승인이 있으면 기본 선택한다. 연월 전용 칸은 형식 차이이므로 확인 필요로 남기지 않는다. 직접 라벨 없는 추가 행은 같은 부모·같은 반복 그룹·동일 행 구조의 같은 열에서만 날짜 단위 근거를 빌린다. 다른 그룹·구조·모호한 그룹·중복 id는 근거로 사용하지 않는다. 상세 조건과 검증 경계는 [CF-307 근거](../../raw/issues/CF-307/documents/generic-calendar-selection.md)를 따른다.

읽기 전용 달력은 회사별 selector가 아니라 검증 가능한 DOM 소유권과 날짜 단위 구조를 지원 단위로 삼는다. `SELECT_DATE`와 일반 입력 승인을 분리하고, 브라우저가 원본 날짜 검증, 대상 값 계산, 실행 예산·중단, 팝업 소유권, 실제 값 유지 및 다른 필드 부수 효과를 확인한다. 월 달력에서 모델은 날짜 값·HTML·승인 정보 없이 비식별 후보 역할 ID만 선택하거나 기권한다. 기존 직접 입력·검색 경로는 유지한다.

CF-118부터 ui-datepicker 계열 연월일 달력은 월 승인과 분리된 일 단위 승인으로 처리한다. 공유 루트 달력의 소유권은 닫힌 상태에서 대상 opener를 활성화한 뒤 그 달력 하나만 표시되는지로 증명하고, 월 select는 0~11 값과 라벨이 일치할 때만 신뢰한다. 연도·월 변경 뒤 DOM을 재조회해 정확한 일자 하나만 누른다. 한 입력칸에 월 달력과 연월일 달력이 함께 감지되면 보류한다.

CF-313부터 `SELECT_DATE` 기입도 다른 기입 명령과 같은 공통 최종 확인을 거친다. settle 단계에서 대상 입력의 최종 값을 다시 읽어 승인 날짜와 대조하고, 불일치·노드 교체·분리가 있으면 `RETAINED_VALUE_UNCONFIRMED` 확인 필요로 보고한다. 상세 조건과 재현 시점은 [CF-313 근거](../../raw/issues/CF-313/documents/generic-calendar-selection.md)를 따른다.

가상화·화살표 전용 탐색, 인라인 달력과 그 밖의 날짜 위젯은 자동 추정하지 않는다. 합성 fixture 및 설치 UI 테스트의 성공은 실제 지원서 입력 검증으로 간주하지 않는다.

## 변경 이유

읽기 전용 달력은 단순 텍스트 형식 변환과 다른 UI 상태 전이가 필요하다. 회사별 고정 DOM과 무제한 클릭 실행을 피하면서 개인정보와 사용자의 개별 승인을 보존하기 위해 로컬 상태 머신 경계를 선택했다. CF-118은 의미 매핑이 입사일·종료일을 `SELECT_DATE`로 판단해도 월 달력만 조작할 수 있던 한계를, 공유 루트 연월일 달력의 소유권 증명과 정확한 일자 확인으로 보완했다. CF-307은 이 승인 경계를 유지하면서 기본 선택과 라벨 없는 동일 반복 열의 날짜 단위 근거를 보완한다. CF-313은 달력 실행기 성공만으로 입력 완료를 보고해 페이지가 값을 되돌린 경우를 놓치던 결함을 공통 최종 값 확인으로 보완한다.

## 실행이 연 달력과 드롭다운 확인

일 달력 역할 판정을 포기한 뒤 일부 팝오버는 숨긴 채 연·월 select와 열기 버튼의 `aria-controls`를 남긴다. 다음 드롭다운을 열 때 이것이 닫히면 범용 드롭다운 확인이 되돌릴 수 없는 값 변경으로 보고 실행 전체를 멈췄다. 일 달력 실행기는 연 루트와 열기 버튼을 기억하고, 범용 드롭다운 실행기는 기억된 루트 안의 칸과 열기 버튼 자체의 표시만 값 비교에서 뺀다. 다른 호출부는 제외 없이 비교한다. 포기할 때는 보이는 달력과 팝업이 사라질 때까지 기다린다. 근거는 [CF-355](../../raw/issues/CF-355/documents/generic-calendar-selection.md)를 따른다.

## 날짜 기입 뒤 다른 컨트롤이 연 층

날짜 기입 뒤 새로 보이는 층이 남으면 실행기는 뒤의 승인 칸을 보류한다. 새 층의 열기 컨트롤(aria-controls)이 대상이 아닌 다른 컨트롤이고 층과 열기 컨트롤이 대상을 감싸지 않으면, 그 층은 그 컨트롤의 것으로 보고 보류 판정에서 뺀다(다른 칸 검색 제안 목록이 늦게 보인 사례). 멈춤 판정 로그는 남은 층의 값 없는 구조를 남긴다. 근거는 [CF-358](../../raw/issues/CF-358/documents/generic-calendar-selection.md)을 따른다.
