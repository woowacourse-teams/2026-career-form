# 필드 매핑 provider output 계약 안전화

## 상태

승인됨

## 날짜

2026-08-27

## 관련 Issue

- #61

## 배경

Field OpenAI Structured Output은 모든 요청 candidate를 `matches` 또는 `noMatches`에
명시하는 exact 1:1 계약이었다. provider가 유효한 JSON을 완성해도 확신하지 못한
candidate의 `noMatches` 항목 하나를 생략하면 Backend가 전체 결과를 계약 위반으로
폐기했다. 이때 안전하게 사용할 수 있었던 다른 canonical match도 외부에서
`PARTIAL + LLM_UNAVAILABLE`와 빈 fields로 바뀌었다.

`profileFieldKey`는 prompt의 허용 목록과 application allowlist로 검사했지만 provider
JSON Schema에서는 일반 문자열이었다. 따라서 provider가 미지원 canonical 형태를 생성한
뒤에야 Backend가 전체 결과를 거부할 수 있었다.

## 검토한 대안

- `matches + noMatches` exact 1:1 provider 계약을 유지한다: 명시성은 높지만 omission
  하나가 확실한 match까지 폐기하는 문제를 유지한다.
- 불완전한 provider 결과를 application에서 부분 채택한다: provider adapter와 정적
  Resolver가 공유하는 exact-set port 계약을 약화하고 외부 조립 책임을 application에
  섞는다.
- provider output은 확실한 `matches`만 받고 adapter가 omission을 `NoMatch`로 채운다:
  application의 exact-set 계약을 유지하면서 확실한 match를 보존한다.

## 결정

Field OpenAI output은 `schemaVersion`, `snapshotId`, `matches[]`만 반환한다. 각 match는
`candidateId`와 `profileFieldKey`만 가진다. provider가 반환하지 않은 요청 candidate는
`OpenAiFieldMappingResolver`가 요청 traversal을 기준으로 결정론적 `NoMatch`로 보완한다.
application은 기존처럼 모든 요청 candidate가 정확히 한 번 존재하는 Resolver 결과를
받고 외부 fields를 요청 traversal 순서로 조립한다.

provider-native Structured Output의 `profileFieldKey` JSON Schema에는
`SupportedProfileFields.keys()`의 canonical 77-key string enum을 적용한다. strict Jackson
decoding은 unknown, missing, explicit null, scalar coercion과 trailing token을 계속
거부한다.

omission과 provider 계약 위반은 구분한다. omission은
`NO_MATCH + LLM_SUGGESTED + BLOCKED + [NO_MATCH]`로 처리하지만 duplicate 또는 unknown returned candidate ID,
`schemaVersion` 또는 `snapshotId` 불일치와 application 미지원 key는 전체 결과를
fail-closed로 거부한다.

## 결과

provider가 확신하지 못한 candidate를 생략해도 확실한 canonical match는 보존되고 외부
fields에는 모든 요청 candidate가 나타난다. all-omitted output은 장애가 아니라 모든
candidate가 차단된 `COMPLETE` 결과다. 모델이 놓친 실제 지원 가능 필드도 입력 불가가 될
수 있지만, 잘못된 자동 입력보다 누락을 우선하는 제품 원칙에 맞는다.

외부 `/api/v1/fields/analyze` URL, request/response JSON, warning code, preparation/action
계약과 interaction/write 정책은 바뀌지 않는다. 실제 프로필 값, HTML, URL 상세,
계정·세션·selector·실행 정보는 provider payload와 진단에 추가하지 않는다.
