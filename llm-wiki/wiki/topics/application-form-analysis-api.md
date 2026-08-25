# 지원서 분석 API

> Topic: application-form-analysis-api
> Status: Current
> Current: [현재 근거](../../raw/issues/CF-44/documents/api/application-form-analysis-api.md)
> History: [근거 1](../../raw/issues/CF-44/documents/api/application-form-analysis-api.md)
> Updated: 2026-08-25

## 현재 상태

section 중심 비식별 snapshot을 두 전용 API로 보낸다. Snapshot A는 `/api/v1/preparation/analyze`의 action candidate 전용 요청이고, Snapshot B는 `/api/v1/fields/analyze`의 field 전용 요청이다. section 직접 candidate는 section 배열에 두고, 반복되는 한 레코드의 candidate는 snapshot 로컬 `itemId`를 가진 `items[]`로 묶는다. 반복 입력 추가 plan은 action 의미와 기대 효과만 반환하며 browser가 실행 횟수와 안전 정책을 소유한다.

어댑터가 일치하면 어댑터가 field mapping을 독점하고, fingerprint 불일치는 fallback 없이 차단한다. 비어댑터 사이트에서는 Snapshot B의 모든 field candidate를 비식별 LLM input으로 보내며 결과는 candidate마다 정확히 하나의 `MATCH | NO_MATCH`다. `MATCH`는 `categoryId.sectionId.fieldId` canonical key와 자동 입력 정책을 사용한다.

## 변경 이유

서로 다른 수명주기의 candidate와 plan을 한 schema에 섞지 않는다. canonical key는 중복되는 평평한 field ID의 저장 위치 모호성을 없애고, LLM 전용 schema와 exact candidate set 검사는 전체 DOM·개인정보 전송 없이 모든 generic field를 일관된 producer가 분류하게 한다.
