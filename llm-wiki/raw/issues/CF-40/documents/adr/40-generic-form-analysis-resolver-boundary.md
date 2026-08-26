# 범용 지원서 분석 Resolver와 Action LLM 경계

## 상태

승인됨

## 날짜

2026-08-26

## 관련 Issue

- #40

## 배경

CF-44는 preparation과 field mapping을 서로 다른 endpoint로 분리하고, 실제 값과 실행을 browser에 남기는 데이터 경계를 정했다. 당시에는 action candidate를 LLM에 보내지 않는다고 결정했지만, 현재 구현에는 회사별 정적 규칙이나 검증된 mapping 데이터가 없다. 범용 기능이 모든 채용 사이트에서 동작 가능한지를 먼저 확인하려면 field 의미뿐 아니라 준비 action의 의미도 범용 LLM이 분석해야 한다.

한편 후속 기능에서는 SK, 삼성 등 검증된 회사 mapping을 데이터베이스와 연결해 LLM 호출 없이 처리할 예정이다. 현재 범용 LLM 구현이 외부 HTTP 계약과 직접 결합되면 정적 구현을 추가할 때 controller와 응답 계약까지 다시 바꿔야 한다. Action과 field는 입력 문맥, 출력 규칙과 실패 검증이 달라 하나의 mapper 인터페이스로 합칠 수도 없다.

LLM에 browser snapshot 전체를 전달하면 실제 값, HTML, URL 상세, 계정·세션과 실행 정보가 공급자 경계를 넘어갈 위험이 있다. 반대로 action의 visibility와 식별 문맥을 모두 제거하면 모델이 실행 불가능한 candidate에 ACTION을 반환하거나 어느 section을 드러내는지 판단할 근거가 부족하다.

## 검토한 대안

- 외부 API service가 OpenAI를 직접 호출한다: 구현은 짧지만 provider 코드와 HTTP 계약이 결합되고 후속 정적 구현을 같은 경계에 추가하기 어렵다.
- action과 field를 하나의 Resolver로 합친다: port 수는 줄지만 서로 다른 input projection, output union과 검증 책임이 섞인다.
- action candidate는 LLM에 보내지 않는다: 외부 공급자 경계는 가장 작지만 현재 정적 producer가 없으므로 preparation API의 범용 데모를 완성할 수 없다.
- 외부 snapshot을 그대로 LLM에 보낸다: 변환은 단순하지만 `site`, field 상호작용 상태와 불필요한 DOM metadata까지 전달한다.
- Action과 field 전용 port를 두고 각 LLM Resolver가 최소 payload로 투영한다: 현재 범용 세로 단면을 완성하면서 후속 정적 Resolver가 외부 API 변경 없이 같은 port를 구현할 수 있다.

## 결정

`com.careerform.formanalysis`이 외부 API, application use case, domain 계약과 두 독립 port를 소유한다.

```text
POST /api/v1/preparation/analyze
  -> PreparationAnalysisService
  -> ActionResolver
  -> 현재 LlmActionResolver

POST /api/v1/fields/analyze
  -> FieldsAnalysisService
  -> FieldMappingResolver
  -> 현재 LlmFieldMappingResolver
```

현재 production 구현은 `LlmActionResolver`와 `LlmFieldMappingResolver`뿐이다. 회사별 정적 Resolver, DB mapping, fingerprint 수집, registry/router와 fallback 골격은 이번 범위에 만들지 않는다. 두 endpoint는 LLM 활성화 여부와 관계없이 항상 존재한다.

### Action LLM 경계

preparation request의 모든 action candidate를 section 직접 배열과 `items[]`의 traversal 순서로 `LlmActionInput`에 투영한다. 다음 속성만 허용한다.

- root: `schemaVersion`, `snapshotId`, `sections`
- section/item 문맥: `sectionId`, 선택적 `parentSectionId`, `displayName`, snapshot-local `itemId`
- candidate: `candidateId`, 선택적 `displayName`, `element`, `control`, `visibility`, 선택적 `domId`, `domName`, true일 때만 존재하는 `disabled`, `readonly`, `inert`

LLM은 각 input candidate마다 정확히 하나의 결과를 반환한다. 허용 결과는 다음 세 형태뿐이다.

- `ACTION + REVEAL_SECTION + TARGET_VISIBLE + targetSectionId`
- `ACTION + ADD_REPEATABLE_GROUP + GROUP_COUNT_INCREMENT`
- command, effect와 target 속성이 없는 `NO_ACTION`

hidden, disabled, readonly 또는 inert candidate에는 `ACTION`을 허용하지 않는다. `REVEAL_SECTION`의 target은 같은 input의 section이어야 한다. LLM이 버튼을 클릭했거나 기대 효과가 이미 발생했다고 표현할 수 없고 실행 횟수도 반환하지 않는다.

### Field LLM 경계

fields request의 모든 field candidate를 `LlmMappingInput`에 투영한다. CF-44에서 정한 더 작은 payload를 유지한다.

- root: `schemaVersion`, `snapshotId`, `sections`
- section/item 문맥: `sectionId`, 선택적 `parentSectionId`, `displayName`, snapshot-local `itemId`
- candidate: `candidateId`, 선택적 `displayName`, `element`, `control`, option 표시명

LLM은 각 input candidate마다 정확히 하나의 `MATCH | NO_MATCH`를 반환한다. `MATCH`만 canonical 77-key allowlist의 `profileFieldKey`를 가진다. LLM은 profile 값, confidence, autofill policy, interaction status와 write plan을 만들지 않는다. Backend가 allowlist와 deterministic `FieldInteractionPolicy`를 적용한다.

### 공통 출력 검증과 장애 처리

두 LLM output은 input과 `schemaVersion`, `snapshotId`가 같아야 하고 candidate ID가 duplicate, 누락 또는 unknown 없이 exact 1:1이어야 한다. strict JSON Schema와 역직렬화가 unknown, missing, explicit null과 trailing token을 거부한다. 하나라도 위반하면 일부 결과를 채택하지 않고 전체 output을 폐기한다.

Resolver 부재, runtime provider 장애, 빈 응답, 역직렬화 실패와 output 계약 위반은 외부 응답에서 `GENERIC + PARTIAL + [LLM_UNAVAILABLE]`와 빈 결과가 된다. 유효한 all-`NO_ACTION`과 all-`NO_MATCH`는 장애가 아니라 `COMPLETE`다. 잘못된 client snapshot은 400, 원문 또는 canonical JSON 65,536-byte 초과는 413, 예기치 않은 로컬 버그는 500이다.

### 금지 데이터와 실행 책임

두 LLM payload에는 실제 프로필/control 값, HTML, 전체 URL·query·fragment, cookie/session/account/authorization, selector·실행 코드, DOM handle을 넣지 않는다. field LLM에는 `site`, visibility, DOM id/name, placeholder, option ID와 state flag도 보내지 않는다. action LLM에는 실행 코드, locator와 실행 결과를 보내지 않는다.

실제 action 클릭, 반복 횟수 계산, 사용자 승인, 효과 확인, target 재탐색, 기존 DOM handle 폐기와 새 DOM 수집은 browser 책임이다. 실제 profile 값 연결, 기존 값 충돌 판단, 민감정보 확인과 field 입력도 browser 책임이다.

### 후속 정적 Resolver

후속 회사별 정적 구현은 같은 `ActionResolver` 또는 `FieldMappingResolver` port를 구현할 수 있다. 검증된 회사 adapter의 fingerprint가 불일치하면 `ADAPTER_STRUCTURE_MISMATCH`로 차단하고 범용 LLM으로 조용히 fallback하지 않는다. `ADAPTER`, `BLOCKED`, `ADAPTER_STRUCTURE_MISMATCH`, `ADAPTER_VERIFIED`, `UNRESOLVED_FIELD`와 `SYSTEM_CONTROL`은 외부 호환을 위해 예약하지만 현재 producer는 생성하지 않는다.

## 결과

외부 API는 Resolver 종류와 provider를 알지 않고, 현재 범용 LLM 세로 단면과 후속 정적 구현이 같은 application port를 공유한다. Action과 field가 각자의 최소 데이터 경계와 output union을 가지므로 한 경로의 규칙 변경이 다른 경로를 넓히지 않는다.

현재 데모는 모든 사이트를 GENERIC LLM route로 분석한다. 정적 회사 기능을 추가할 때는 식별, fingerprint, mapping 저장소와 routing 정책을 별도 Issue에서 결정해야 한다. 그때도 이 ADR의 개인정보 경계, exact output 검증, browser 실행 책임과 fingerprint mismatch 차단은 유지한다.
