# 범용 구조 반복 실행과 학력 행 격리

> Topic: generic-structure-loop
> Status: Current
> Current: [CF-355 줄 하나만 보이는 반복 영역의 행 추가](../../raw/issues/CF-355/documents/generic-structure-loop.md)
> History: [CF-260 구조 반복 실행](../../raw/issues/CF-260/documents/generic-structure-loop.md); [CF-307 고등학교 행 단계 검사 후속 조사](../../raw/issues/CF-307/documents/generic-structure-loop.md); [CF-312 숨은 다른 단계 control의 단계 검사 제외](../../raw/issues/CF-312/documents/generic-structure-loop.md); [CF-355 줄 하나만 보이는 반복 영역의 행 추가](../../raw/issues/CF-355/documents/generic-structure-loop.md)
> Updated: 2026-10-29

## 현재 상태

최신 범용 워크플로우에만 혼합 행 탐지를 끈 수집기와 구조 반복 실행을 주입한다. 주입을 생략한 정적, 정책, 컴포넌트 경로는 기존 수집 동작을 유지한다.

추가와 펼치기는 실행 직전 클릭 허용 경계를 다시 검사하고 기존 준비 executor의 사후 검증을 사용한다. 행 종류 선택은 문서 잠금 안에서 처리한다. 섹션별 행동 한도 10회를 공유하고 예상 밖 URL 변경 직후 중단한다. 기권, 분류 누락, 제어 소실과 단계 불일치는 해당 범위만 보류한다.

학력 행은 `ROW_KIND_OPTION`으로 확정한 로컬 기록으로 단계와 항목 인덱스를 연결한다. 캐시 키도 단계를 구분한다. 보류 매핑은 공유 계획의 중복 검사 전에 제거하고 후속 검토에도 입력 불가 상태를 다시 적용한다.

## 숨은 다른 단계 control

같은 행에 있지만 숨겨진 다른 학력 단계 control은 행을 차단하지 않는다. 단계 검사는 registry handle이 보이는 행 후보의 MATCH key만 모으므로, 숨은 대학 분기 control의 `education.university.*` 매칭이 보이는 고등학교 행을 `STAGE_KEY_MISMATCH`로 만들지 않는다. 보이는 다른 단계 key가 있으면 계속 차단한다.

묶음 후보의 가시성은 후보가 소유한 모든 native control로 판정하며, 모두 숨겨졌을 때만 숨김이다. 더 좁은 판정은 일부만 보이는 후보를 차단 검사에서 빠뜨리는 fail-open이었다. 반복 행 섹션의 등급 sibling도 같은 기준으로 숨은 후보를 제외한다. 조건과 검증 경계는 [CF-312 근거](../../raw/issues/CF-312/documents/generic-structure-loop.md)를 따른다.

## 줄 하나만 보이는 반복 영역

반복 영역이 줄 하나만 보이고 추가 버튼에 글자가 없으면 기존 반복 행 판정이 영역을 읽지 못한다. 구조 반복 실행은 `heading` 구간의 행 상자(첫 칸과 마지막 칸을 품고 다른 구간 칸은 품지 않는 가장 작은 상자)에 추가 이름이나 + 그림 버튼이 있으면 분류 후보로 삼는다. 반복 범주이고 프로필 항목이 줄보다 많으면 마지막 줄의 버튼을 `REPEAT_ADD`로 묻고 누른다. − 그림 버튼은 후보에서 뺀다. 누를 때마다 같은 배치 줄이 하나 늘었는지와 기존 값 유지를 확인하고, 다 늘린 뒤 줄 i를 프로필 i번째 항목에 묶는다. 글자 없는 아이콘 버튼 수집은 범용 수집 어댑터 전용이며 정적 어댑터는 바뀌지 않는다. 조건과 검증 경계는 [CF-355 근거](../../raw/issues/CF-355/documents/generic-structure-loop.md)를 따른다.

## 변경 이유

회사 유래 혼합 학력 규칙을 범용 준비에서 분리하면서 기본 수집과 정적 정책의 동작을 보존하기 위해서다. 한 행의 잘못된 매핑이 다른 단계의 유효한 행까지 중복 대상으로 보류하지 않게 한다.

CF-260에서는 합성 workflow의 실제 승인 쓰기와 기본 주입 생략 회귀를 검증했다. 당시 실사이트, 설치 확장과 실제 공급자는 검증 범위가 아니었다. CF-307은 기존 실사이트 분석의 미해결 행 차단 관측을 추가하며 실제 지원서 기입 검증으로 확대하지 않는다. CF-312는 그 관측을 정제 fixture로 재현해 숨은 다른 단계 control을 단계 검사와 행 등급 sibling에서 제외하되, 일부만 보이는 묶음 후보는 계속 검사해 fail-open을 막았다. [구조 행동 ADR](generic-autonomous-structural-actions.md)은 제안 상태를 유지하며, 이 문서는 구현된 경계를 기록한다.
