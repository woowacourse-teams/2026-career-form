# 줄 하나만 보이는 반복 영역의 행 추가와 아이콘 버튼 범위

## 승인한 지식

- 페이지가 반복 영역을 줄 하나로만 보여 주고 추가 버튼에 "추가" 글자가 없으면(글자 없는 + 아이콘), 기존 반복 행 판정(`frontend/src/autofill/dom/implicit-repeat-rows.ts`)은 그 영역을 반복 행으로 읽지 못한다. 구간은 `heading` 경계가 되어 구조 반복 실행의 분류 후보에서 빠지고 `ADD_ROW`가 생기지 않는다.
- 범용 구조 반복 실행(`frontend/src/autofill/generic/structure-loop.ts`)은 `heading` 구간의 "행 상자"를 찾는다. 행 상자는 첫 칸에서 위로 올라가 마지막 칸을 품고 다른 구간 칸은 품지 않는 가장 작은 상자다. 그 상자에 추가 이름(`ADD_LABEL`, 금지 이름 제외)이나 + 그림 버튼이 있으면 분류 후보로 삼는다.
- 분류가 반복 범주이고 프로필 항목이 줄보다 많으면 마지막 줄의 버튼을 `REPEAT_ADD`로 묻고 누른다. − 그림 버튼은 후보에서 뺀다. 누를 때마다 같은 배치 줄이 정확히 하나 늘었는지, 기존 줄 값이 그대로인지 확인한다. 기권, 줄 미증가, 상한 도달은 그 영역만 보류한다.
- 다 늘린 뒤 줄 i를 프로필 i번째 항목에 묶는다(`frontend/src/autofill/generic/structure-context.ts`의 `repeatRows`, `bindGenericStructureRows`가 itemIndex와 항목 수를 붙인다). 학력 목록 상자 단계도 같은 줄 추가 단계를 쓴다.
- 글자 없는 아이콘 버튼을 행동 후보로 수집하고 이름을 붙이는 것(`frontend/src/autofill/dom/collect.ts`, `icon-glyph.ts`)은 범용 수집 어댑터에서만 한다. 정적 어댑터의 준비 스냅샷은 바뀌지 않는다.

## 근거와 경계

회귀 테스트는 `structure-loop.single-row-repeat.test.ts`(5건), `structure-loop.listbox-kind.test.ts`, `collect.icon-glyph-scope.test.ts`(정적 호스트에서 아이콘 버튼 미수집)에 있다. 실사이트 확인은 결과 패널의 구조 기록(자격사항·어학사항 줄 추가 완료)까지이며, 저장·제출은 하지 않았다. 추가 글자가 있는 버튼 하나와 같은 모양 줄을 가진 영역은 기존 반복 행 판정이 처리한다. 실제 지원값, 계정, 세션과 페이지 주소는 옮기지 않는다.
