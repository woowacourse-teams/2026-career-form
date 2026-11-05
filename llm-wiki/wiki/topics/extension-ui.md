# 확장 프로그램 프로필·지원서 패널 UI

> Topic: extension-ui
> Status: Current
> Current: [CF-368 사이드 패널의 선택형 값 라벨 표시, 반복 항목 구분, 패널 열기 단축키](../../raw/issues/CF-368/documents/side-panel-labels-entries-and-shortcut.md)
> History: [CF-82 확장 프로그램 프로필·지원서 패널 UI](../../raw/issues/CF-82/documents/extension/extension-ui.md); [CF-368 사이드 패널의 선택형 값 라벨 표시, 반복 항목 구분, 패널 열기 단축키](../../raw/issues/CF-368/documents/side-panel-labels-entries-and-shortcut.md)
> Updated: 2026-10-29

## 현재 상태

프로필 탐색과 지원서 패널은 하늘색 바탕, 카라멜 동작 강조, 코코아 계열 텍스트 계층을 공유한다. 이 UI 계층은 저장·승인·쓰기 동작과 분리된다(CF-82).

자동 기입의 단일 패널 실행, 로딩과 종료 흐름은 [지원서 패널 안 자동 기입 흐름](autofill-panel-workflow.md)을 따른다.

## 사이드 패널의 값 표시, 반복 항목, 단축키 (2026-10-29)

페이지 안 패널, Chrome side panel, 랜딩 미리보기는 같은 `App`을 쓴다. 패널은 필드 정의의 선택지(`optionsFor` 우선)로 코드형 저장값(`region:seoul`, `attendance:day` 등)을 라벨로 보여 주고 라벨을 복사한다. 저장값은 코드 그대로이고 선택지에 없는 값은 그대로 보인다. 값으로 검색하지 않는 계약은 유지한다. 공통 함수는 `frontend/src/profile/field-display.ts`의 `optionLabel`·`fieldDisplayValue`이고 가져오기 검토 화면도 이를 쓴다.

반복 항목은 프로필 관리 카드와 같은 '섹션 라벨 + 범주 안 순번'(고등학교 1, 대학교 2) 소제목과 `role=group`으로 묶고, 옆에 학교명·시험명·자격증명 같은 식별 값을 보여 준다. 반복 항목 복사 버튼 이름은 '<소제목> <필드> 복사'다. 소제목은 검색 대상이 아니며 긴 기관명은 줄바꿈한다.

패널 열기·닫기 단축키는 manifest `commands._execute_action`(제안 키 `Alt+Shift+C`)이다. 팝업이 없어 툴바 클릭과 같은 `action.onClicked` 경로를 타며, 이 경로에서만 토글 메시지를 보내 페이지 안 패널이 열려 있으면 닫기 버튼과 같이 닫고 닫혀 있으면 연다. 런처 버튼 등 다른 경로의 열기 메시지는 계속 열기만 한다. 페이지 안 패널은 background에 메시지로 `commands.getAll()`을 요청하고 background는 `sender.id`를 확인한다. 할당 키가 있으면 헤더에 키를, 없으면 `chrome://extensions/shortcuts` 안내를 보이고, 읽기에 실패하면 안내를 숨긴다. `assert-build`와 `assert-zip`이 `commands`를 검사한다. 근거는 [CF-368 근거](../../raw/issues/CF-368/documents/side-panel-labels-entries-and-shortcut.md)를 따른다.

## 변경 이유

마스코트의 색감을 반영하되 갈색이 화면을 지배하지 않도록 하고, 일반 확장 화면과 Shadow DOM 패널의 시각적 일관성을 유지한다(CF-82).

1.4.0 QA에서 패널이 선택형 값을 코드로 보여 주고 복사했고, 학교가 여러 개면 항목 구분 없이 이어졌으며, 패널을 여는 단축키가 없었다. 이후 같은 단축키와 툴바 아이콘으로 패널을 닫을 수도 있게 해 달라는 요청에 따라 토글로 바꿨다. 자동 기입이 쓰는 코드 저장값은 그대로 두고 표시와 복사만 라벨로 바꿨고, 반복 항목은 프로필 관리 화면과 같은 소제목으로 맞췄다(CF-368).
