# 지원서 분석 API

> Topic: application-form-analysis-api
> Status: Current
> Current: [현재 근거](../../raw/issues/CF-40/documents/api/application-form-analysis-api.md)
> History: [근거 1](../../raw/issues/CF-44/documents/api/application-form-analysis-api.md), [근거 2](../../raw/issues/CF-40/documents/api/application-form-analysis-api.md)
> Updated: 2026-08-26

## 현재 상태

schemaVersion 2의 section 중심 비식별 snapshot을 항상 존재하는 두 전용 API로 보낸다. `/api/v1/preparation/analyze`는 모든 action candidate를 범용 LLM으로 `ACTION | NO_ACTION` 분석해 검증된 ACTION만 반환하고, `/api/v1/fields/analyze`는 모든 field candidate를 canonical 77-key allowlist의 `MATCH | NO_MATCH`로 분석한 뒤 Backend의 결정론적 interaction/write 정책을 적용한다.

현재 정상 producer는 `GENERIC` LLM route뿐이다. 두 LLM output은 input candidate와 exact 1:1이어야 하고 일부 결과를 채택하지 않는다. 유효한 all-`NO_ACTION`과 all-`NO_MATCH`는 `COMPLETE`다. Resolver 부재·runtime 공급자 장애·출력 계약 위반은 200 `PARTIAL + LLM_UNAVAILABLE`와 빈 결과, client 계약 위반은 400, raw/canonical 65,536-byte 초과는 413, 로컬 내부 오류는 500이다.

## 변경 이유

CF-44의 두 endpoint, canonical key와 browser 실행 경계는 유지하면서 정적 producer가 없는 현재 단계에서 action까지 범용 LLM 세로 단면으로 완성했다. 후속 정적 Resolver 호환 enum은 예약하되 현재 외부 결과는 GENERIC route만 생성한다.
