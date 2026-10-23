# 범용 칸 매칭 응답의 합성 값 표현

> Topic: generic-synthetic-binding-response
> Status: Current
> Current: [CF-250 범용 칸 매칭 응답의 합성 값 표현](../../raw/issues/CF-250/documents/generic-synthetic-binding-response.md)
> History: [CF-250 범용 칸 매칭 응답의 합성 값 표현](../../raw/issues/CF-250/documents/generic-synthetic-binding-response.md)
> Updated: 2026-10-18

## 현재 상태

범용 칸 매칭 응답은 schemaVersion 3이다. 이름 레시피 칸은 키 null과 DERIVED binding, 날짜 부분 칸은 날짜 키와 DATE_PART binding을 담고, 키와 binding이 모두 없는 칸만 BLOCKED다. DATE_PART는 select 선택지 형식을 코드가 검사해 확정하고 맞지 않으면 null이다. 이름 레시피 칸의 정책은 공유 FieldInteractionPolicy 판정과 같다. 공유 endpoint 계약은 바뀌지 않는다.

## 변경 이유

공유 경로가 채우던 단일 이름 칸, 영문 전체 이름 칸, 년·월·일 select를 범용 흐름이 기권으로 놓치는 회귀를 막고, 합성 값을 JEV 선택지로 표현하되 날짜 형식은 코드가 보증하기 위해서다.
