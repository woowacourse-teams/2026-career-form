# 지원서 분석 API

> Topic: application-form-analysis-api
> Status: Current
> Current: [현재 근거](../../raw/issues/CF-44/documents/api/application-form-analysis-api.md)
> History: [근거 1](../../raw/issues/CF-44/documents/api/application-form-analysis-api.md)
> Updated: 2026-08-24

## 현재 상태

section 중심 비식별 snapshot을 단일 분석 API로 보내고, Snapshot A preparation과 Snapshot B field analysis를 분리하는 계약을 사용한다.

## 변경 이유

field와 action candidate의 소속·ID 관계, 금지 데이터, 오류·상태 enum을 OpenAPI와 한국어 참조에서 같은 방식으로 검증할 수 있게 한다.
