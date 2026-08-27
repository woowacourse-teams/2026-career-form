# 지원서 분석 데이터 경계

> Topic: application-form-analysis-data-boundary
> Status: Current
> Current: [현재 근거](../../raw/issues/CF-61/documents/adr/61-field-mapping-provider-output-contract.md)
> History: [근거 1](../../raw/issues/CF-44/documents/adr/44-application-form-analysis-data-boundary.md), [근거 2](../../raw/issues/CF-40/documents/adr/40-generic-form-analysis-resolver-boundary.md), [근거 3](../../raw/issues/CF-57/documents/adr/57-openai-chat-completion-storage.md), [근거 4](../../raw/issues/CF-61/documents/adr/61-field-mapping-provider-output-contract.md)
> Updated: 2026-08-27

## 현재 상태

`com.careerform.formanalysis`은 production Java 18개로 구성한다. `api`는 전용 controller 2개, `dto`는 endpoint별 request/response 4개, `application`은 service·policy 4개와 독립된 `ActionResolver`·`FieldMappingResolver` port 2개, `exception`은 handler와 예외 3개, `infrastructure.adapter.openai`는 공통 client와 adapter 2개를 가진다. preparation과 field mapping은 서로 다른 사용자 기능이므로 controller와 port를 합치지 않는다.

Spring Boot의 Jakarta Validation은 필수 여부, 길이, enum과 형식 같은 HTTP 입력 계약을 담당한다. Service는 candidate exact set, action target·실행 가능성, canonical key처럼 분석 안전성에 필요한 정합성만 담당한다. standalone validator, request advice, snapshot size guard, 별도 LLM contract·provider configuration 계층은 두지 않는다. parent section graph와 item·option ID 관계는 snapshot producer인 Frontend가 책임진다.

Action OpenAI input에는 candidate 의미, section/item 문맥, visibility, `domId/domName`과 true-only 상태만 보내고, field input에는 더 작은 candidate/section/item/option 표시 문맥만 보낸다. 실제 값·HTML·URL 상세·계정/세션·selector·실행 정보는 금지한다. 공급자 output은 action의 세 bucket과 field의 확실한 `matches`만 표현하고, command·effect·policy·status·write plan은 application이 생성한다. Field adapter는 provider가 생략한 요청 candidate를 `NoMatch`로 보완해 application port에 exact-set 결과를 전달한다. 실제 action 실행·반복 횟수·효과 확인·DOM 재수집과 field 값 연결·입력은 browser 책임이다.

Field `profileFieldKey`의 provider schema는 canonical 77-key enum이며 application allowlist도 독립 방어로 유지한다. omission은 안전한 `NO_MATCH`지만 duplicate·unknown returned candidate ID와 version·snapshot 불일치는 provider 계약 위반이므로 전체 폐기한다. Action output은 기존 input exact 1:1 계약을 유지한다.

OpenAI Chat Completions 호출은 공통 Spring 설정과 요청별 옵션에 모두 `store=true`를 둔다. 공통 `application.yml`을 모든 runtime profile이 상속하고 profile overlay는 이 값을 덮어쓰지 않는다. 요청별 옵션이 공통 설정을 덮어쓸 수 있으므로 두 지점을 함께 켜서 비식별 candidate 구조와 구조화된 output의 저장·조회 가능성을 일관되게 유지한다. 이 저장 경계에도 실제 프로필 값, HTML, URL 상세, 계정·세션·인증 정보와 실행 정보 금지는 그대로 적용된다.

## 변경 이유

외부 endpoint, 성공 JSON, canonical 77-key와 개인정보 경계를 유지하면서 사람이 패키지 방향과 파일 역할을 한 번에 읽을 수 있도록 구조를 줄였다. 검증을 없애는 대신 HTTP 형식, application 안전성, provider JSON과 Frontend snapshot 관계의 소유권에 맞게 배치했다. 저장된 completion을 OpenAI Platform에서 추적할 수 있도록 같은 경계를 유지한 채 보관을 명시적으로 켰다. CF-61에서는 omission과 provider 계약 위반을 분리해 안전한 match는 보존하면서 exact-set application 경계를 유지했다. 후속 회사별 정적 구현은 같은 port를 구현하며, 검증된 회사 fingerprint가 불일치하면 `ADAPTER_STRUCTURE_MISMATCH`로 차단하고 LLM fallback하지 않는 안전 경계는 유지한다.
