# 실행이 연 달력의 숨은 위젯 칸과 열기 버튼을 드롭다운 확인에서 제외

## 승인한 지식

- 일 달력 역할 판정을 포기하면 실행기는 달력을 닫는다. 일부 팝오버 위젯은 숨긴 채로 연·월 select와 열기 버튼의 `aria-controls`를 남겼다가, 다음 드롭다운을 열 때 완전히 닫는다. 범용 드롭다운 확인(`frontend/src/autofill/dom/button-dropdown.ts`의 `captureDropdownProbe`)은 페이지 전체 입력칸과 트리거 표시를 비교하므로 이 분리와 표시 변화를 되돌릴 수 없는 값 변경으로 보고 실행 전체를 멈췄다.
- 일 달력 실행기(`frontend/src/autofill/interaction/day-calendar-executor.ts`)는 연 루트와 열기 버튼을 기억한다(`day-calendar-surface.ts`의 `rememberCalendarRoot`). 범용 드롭다운 실행기(`frontend/src/autofill/write/button-dropdown-executor.ts`)는 기억된 루트 안의 칸과 열기 버튼 자체의 표시를 값 비교에서 뺀다. 열기 버튼 안의 입력칸은 계속 비교한다. 문서에서 빠진 루트는 기억에서 지운다.
- 포기할 때는 보이는 달력과 팝업이 사라질 때까지 열기 대기 시간 안에서 기다린다.

## 근거와 경계

실사이트 진단 로그로 단계별로 확인했다(바뀐 칸이 select 2개 → 열기 버튼 1개). 회귀 테스트는 `button-dropdown.test.ts`, `day-calendar-role-classification.test.ts`에 있다. 다른 호출부의 `captureDropdownProbe`는 기본값(제외 없음)을 쓴다. 저장·제출은 하지 않았고 실제 값은 옮기지 않는다.
