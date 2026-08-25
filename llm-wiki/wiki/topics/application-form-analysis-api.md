# 지원서 분석 API

> Topic: application-form-analysis-api
> Status: Current
> Current: [현재 근거](../../raw/issues/CF-44/documents/api/application-form-analysis-api.md)
> History: [근거 1](../../raw/issues/CF-44/documents/api/application-form-analysis-api.md)
> Updated: 2026-08-25

## 현재 상태

section 중심 비식별 snapshot을 두 전용 API로 보낸다. Snapshot A는 `/api/v1/preparation/analyze`의 action candidate 전용 요청이고, Snapshot B는 `/api/v1/fields/analyze`의 field 전용 요청이다. 추가 준비가 필요하면 새 Snapshot A로 되돌아간다.

## 변경 이유

서로 다른 수명주기의 candidate와 plan을 한 schema에 섞지 않고, OpenAPI에서 cross-endpoint property를 거부하게 한다.
