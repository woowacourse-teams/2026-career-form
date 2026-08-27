# 지원서 분석 API

> Topic: application-form-analysis-api
> Status: Current
> Current: [현재 근거](../../raw/issues/CF-61/documents/adr/61-field-mapping-provider-output-contract.md)
> History: [근거 1](../../raw/issues/CF-44/documents/api/application-form-analysis-api.md), [근거 2](../../raw/issues/CF-40/documents/api/application-form-analysis-api.md), [근거 3](../../raw/issues/CF-61/documents/adr/61-field-mapping-provider-output-contract.md)
> Updated: 2026-08-27

## 현재 상태

schemaVersion 2의 section 중심 비식별 snapshot을 항상 존재하는 두 전용 API로 보낸다. `/api/v1/preparation/analyze`는 모든 action candidate를 범용 LLM으로 분석해 검증된 preparation plan만 반환하고, `/api/v1/fields/analyze`는 모든 field candidate를 canonical 77-key allowlist에 mapping한 뒤 Backend의 결정론적 interaction/write 정책을 적용한다. endpoint와 성공 200 JSON 구조는 CF-40 단순화 전후에 동일하다.

필수 요청 속성의 누락이나 `null`은 400이고 선택 속성의 `null`은 생략과 같다. Backend는 candidate ID, preparation section ID, Resolver candidate exact set, action target·실행 가능성과 canonical key처럼 결과를 안전하게 조립하는 데 필요한 정합성만 검증한다. parent section graph와 item·option ID 관계는 snapshot producer인 Frontend가 책임진다. 애플리케이션 고유 request byte 제한은 사용하지 않는다.

현재 정상 producer는 `GENERIC` route뿐이다. OpenAI action output은 `revealSections`, `addRepeatableGroups`, `noActions`의 exact 1:1 bucket을 유지한다. Field OpenAI output은 확실한 canonical `matches`만 반환하고 `profileFieldKey` schema는 `SupportedProfileFields.keys()`의 77-key enum으로 제한한다. Backend adapter는 반환되지 않은 요청 candidate를 `NoMatch`로 보완한 뒤 application에 exact-set 결과를 전달한다. duplicate·unknown returned candidate ID와 version·snapshot 불일치는 전체 결과를 폐기한다.

Backend가 외부 command, expected effect, autofill policy, mapping/interaction status와 write plan을 만든다. 유효한 all-no-action과 field all-omitted는 `COMPLETE`다. 외부 fields는 모든 요청 candidate를 traversal 순서로 포함하며 omission은 `NO_MATCH + LLM_SUGGESTED + BLOCKED + [NO_MATCH]`가 된다. Resolver 부재·runtime 공급자 장애·출력 계약 위반은 200 `PARTIAL + LLM_UNAVAILABLE`와 빈 결과, client 계약 위반은 400, 로컬 내부 오류는 500이다.

## 변경 이유

CF-44의 두 endpoint, 성공 JSON, canonical key와 browser 실행 경계를 유지하면서 현재 범용 LLM 데모에 필요하지 않은 65,536-byte·413 계약과 과도한 관계 검증을 제거했다. CF-61에서는 provider omission을 안전한 `NO_MATCH`로 해석해 확실한 match의 전체 폐기를 피하고, 생성 단계의 canonical enum과 application 방어 검증을 함께 유지한다.
