# 지원서 분석 API

> Topic: application-form-analysis-api
> Status: Current
> Current: [현재 근거](../../raw/issues/CF-44/documents/api/application-form-analysis-api.md)
> History: [근거 1](../../raw/issues/CF-44/documents/api/application-form-analysis-api.md)
> Updated: 2026-08-25

## 현재 상태

section 중심 비식별 snapshot을 두 전용 API로 보낸다. Snapshot A는 `/api/v1/preparation/analyze`의 action candidate 전용 요청이고, Snapshot B는 `/api/v1/fields/analyze`의 field 전용 요청이다. 반복 입력 추가 plan은 action 의미와 기대 효과만 반환한다. browser가 로컬 목표 항목 수와 현재 DOM 행 수로 실행 횟수를 계산하고 로컬 안전 정책과 클릭별 행 증가 검증을 적용한다. 효과 확인이나 안전한 재탐색에 실패하면 새 Snapshot A로 되돌아간다.

## 변경 이유

서로 다른 수명주기의 candidate와 plan을 한 schema에 섞지 않고, OpenAPI에서 cross-endpoint property와 실행 횟수 속성을 거부한다. 프로필 항목 개수를 backend에 보내지 않으면서 반복 행을 한 승인 plan으로 준비하고, 실행 시점 상태를 아는 browser가 횟수와 과다 실행 방지를 책임진다.
