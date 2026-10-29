# 사이드 패널의 선택형 값 라벨 표시, 반복 항목 구분, 패널 열기 단축키

> Issue: CF-368
> Collected: 2026-10-29
> Approval-Digest: 0ca1b67136be3ae037b664c3398b75b7d43ff56854e386b64df2836d2e9144a5
> Source-Revision: bd1f21a776d4de1461717ac108125248f994711c

이 문서는 2026-10-29 CF-368에서 승인된 후보 5·6·7을 확장 패널 UI 관점에서 수집한 기록이다. Approval-Digest의 계산 방식과 원문은 [manifest](../manifest.md)와 [승인 후보 스냅샷](approved-candidates.md)을 따른다. 바꾸지 않은 색·텍스트 계층과 저장·승인·쓰기 동작 분리는 Supersedes가 가리키는 CF-82 근거를 따른다.

## 배경

2026-10-23 1.4.0 릴리스 QA에서 사이드 패널이 주·야간을 `attendance:day`, 학교 소재지를 `region:seoul` 같은 코드로 보여 주고 그대로 복사했다. `profile-search.ts`의 `itemsFromValues`가 필드 선택지를 보지 않고 저장값을 썼기 때문이다. 저장값이 코드인 것은 자동 기입이 쓰는 의도된 설계라 바꾸지 않는다. 같은 QA에서 학교가 여러 개면 항목 구분 없이 한 목록으로 이어졌고, 패널을 여는 단축키가 없었다.

## 결정

### 선택형 값의 라벨 표시와 복사 (후보 5)

- 페이지 안 패널, Chrome side panel, 랜딩 미리보기는 같은 `App`(`frontend/entrypoints/sidepanel/App.tsx`)을 쓰므로 세 곳이 함께 바뀐다.
- 필드 정의의 선택지(`optionsFor`가 있으면 그것을 우선, 없으면 `options`)에서 저장값과 같은 값을 찾아 라벨을 보여 주고, 복사 버튼도 라벨을 복사한다. 저장값은 코드 그대로이고, 선택지에 없는 값은 저장값 그대로 보인다.
- 값으로 검색하지 않는 기존 계약(값 검색 금지)은 유지한다. 라벨 변환은 표시와 복사에만 쓴다.
- 공통 함수는 `frontend/src/profile/field-display.ts`의 `optionLabel`·`fieldDisplayValue`다. 가져오기 검토 화면(`ImportTargetChoices.tsx`, `ImportCategoryList.tsx`)이 따로 하던 변환도 이 함수를 쓴다.

### 반복 항목 구분 (후보 6)

- 반복 항목은 프로필 관리 카드와 같은 '섹션 라벨 + 범주 안 순번'(예: 고등학교 1, 대학교 2) 소제목으로 묶고 `role=group`을 준다. 소제목 옆에 학교명·시험명·자격증명 같은 식별 값을 보여 준다.
- 반복 항목의 복사 버튼 접근 이름은 '<소제목> <필드> 복사'다.
- 소제목은 검색 대상이 아니다. 긴 기관명은 줄바꿈한다.

### 패널 열기 단축키 (후보 7)

- manifest `commands._execute_action`으로 등록하고 제안 키는 `Alt+Shift+C`다(DevTools의 Ctrl/Cmd+Shift+C와 Chrome의 Alt+Shift 기본 키를 피함). 확장에 팝업이 없어 단축키는 툴바 클릭과 같은 `action.onClicked` → 페이지 안 패널 경로를 탄다.
- 콘텐츠 스크립트에서는 `chrome.commands`를 쓸 수 없어, 페이지 안 패널이 background에 메시지로 `commands.getAll()`을 요청한다. background는 `sender.id`가 이 확장일 때만 답한다.
- 할당된 키가 있으면 패널 헤더에 그 키를, 없으면 `chrome://extensions/shortcuts`에서 지정하라는 안내를 보인다. 읽기에 실패하면 안내를 숨긴다.
- 빌드 검사 `assert-build`와 ZIP 검사 `assert-zip`이 manifest `commands`를 확인한다.

## 검증 경계

자동 테스트(`App.test.tsx`, `App.shortcut.test.tsx`, `profile-search.test.ts`, `field-display.test.ts`, `panel-shortcut.test.ts`, `InPageProfilePanel.shortcut.test.tsx`)로 고정했다. Chrome이 사용자 환경에서 제안 키를 실제로 할당하는지는 다른 확장과의 충돌에 따라 달라질 수 있어, 키가 없을 때의 안내를 함께 둔다.

## 참고 코드

- `frontend/entrypoints/sidepanel/App.tsx`, `ProfileValueList.tsx`, `PanelShortcutHint.tsx`
- `frontend/src/profile/profile-search.ts`, `frontend/src/profile/field-display.ts`
- `frontend/src/extension/panel-shortcut.ts`, `frontend/entrypoints/background.ts`, `frontend/wxt.config.ts`
- `frontend/scripts/assert-build.mjs`, `frontend/scripts/assert-zip.mjs`
