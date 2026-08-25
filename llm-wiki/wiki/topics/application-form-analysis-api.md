# 지원서 분석 API

> Topic: application-form-analysis-api
> Status: Current
> Current: [현재 근거](../../raw/issues/CF-44/documents/api/application-form-analysis-api.md)
> History: [근거 1](../../raw/issues/CF-44/documents/api/application-form-analysis-api.md)
> Updated: 2026-08-25

## 현재 상태

section 중심 비식별 snapshot을 두 전용 API로 보낸다. Snapshot A는 `/api/v1/preparation/analyze`의 action candidate 전용 요청이고, Snapshot B는 `/api/v1/fields/analyze`의 field 전용 요청이다. 반복 입력 추가 plan의 `maxExecutions`는 backend 안전 상한이며, browser가 로컬 목표 항목 수와 현재 DOM 행 수로 실제 실행 횟수를 계산하고 클릭별 행 증가를 검증한다. 상한을 넘거나 안전한 재탐색에 실패하면 새 Snapshot A로 되돌아간다.

## 변경 이유

서로 다른 수명주기의 candidate와 plan을 한 schema에 섞지 않고, OpenAPI에서 cross-endpoint property와 `REVEAL_SECTION` 반복 실행을 거부한다. 프로필 항목 개수를 backend에 보내지 않으면서 반복 행을 한 승인 plan으로 준비한다.
