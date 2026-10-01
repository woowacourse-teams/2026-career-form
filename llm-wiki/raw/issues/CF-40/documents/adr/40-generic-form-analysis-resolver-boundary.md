# 범용 지원서 분석 Resolver와 단순 패키지 경계

## 상태

승인됨

## 날짜

2026-08-27

## 관련 Issue

- #40

## 배경

CF-44는 preparation과 field mapping을 서로 다른 endpoint로 분리하고, 실제 값과 실행을 browser에 남기는 데이터 경계를 정했다. 현재 구현에는 회사별 정적 규칙이나 검증된 mapping 데이터가 없으므로 범용 데모는 action과 field 의미를 각각 LLM으로 분석해야 한다.

기존 CF-40 구현은 외부 계약의 모든 관계를 Backend가 방어하려고 request advice, byte limit, 여러 validator와 provider 전용 contract·configuration을 별도 파일로 만들었다. 그 결과 기능보다 파일 간 이동과 중복 검증이 먼저 보였고, API DTO와 내부 공급자 DTO도 이름만으로 구분하기 어려웠다. 데모 단계에서는 외부 성공 계약과 안전 경계를 유지하면서 Spring Boot와 Spring AI가 제공하는 기능을 직접 사용하고, 사람이 한 번에 읽을 수 있는 구조가 우선이다.

Action과 field는 서로 다른 사용자 흐름이다. preparation은 클릭 후보를 준비 계획으로 바꾸고, fields는 준비가 끝난 DOM의 필드를 77개 canonical profile key에 연결한다. 두 기능을 한 controller나 한 Resolver로 합치면 endpoint별 입력 문맥, 공급자 output과 검증 규칙이 섞인다. 반대로 각 작은 record와 enum을 모두 독립 파일로 분리할 필요도 없다.

## 검토한 대안

- 기존 계층을 유지하고 패키지만 재배치한다: 파일 수와 탐색 비용이 그대로 남는다.
- 모든 로직을 controller 또는 service 한 파일에 합친다: 파일은 줄지만 HTTP 형식, application 정책과 OpenAI 구현이 섞인다.
- standalone validator 패키지를 유지한다: 검증 클래스를 찾기는 쉽지만 Jakarta Validation 및 service 검증과 책임이 중복된다.
- Action과 field를 하나의 Resolver로 합친다: port 수는 줄지만 서로 다른 input projection과 output bucket, 안전 검증이 한 계약에 섞인다.
- API, application, infrastructure 경계를 유지하고 endpoint별 관련 타입을 묶는다: 외부 입출력, 중심 정책과 공급자 통신 방향이 드러나면서 파일 수를 줄일 수 있다.

## 결정

`com.careerform.formanalysis`은 production Java 파일 18개로 구성한다.

```text
formanalysis/
├── api/
│   ├── PreparationAnalysisController.java
│   └── FieldsAnalysisController.java
├── dto/
│   ├── PreparationAnalysisRequest.java
│   ├── PreparationAnalysisResponse.java
│   ├── FieldsAnalysisRequest.java
│   └── FieldsAnalysisResponse.java
├── application/
│   ├── PreparationAnalysisService.java
│   ├── FieldsAnalysisService.java
│   ├── FieldInteractionPolicy.java
│   ├── SupportedProfileFields.java
│   └── port/
│       ├── ActionResolver.java
│       └── FieldMappingResolver.java
├── exception/
│   ├── FormAnalysisExceptionHandler.java
│   ├── InvalidSnapshotException.java
│   └── ResolverException.java
└── infrastructure/
    └── adapter/
        └── openai/
            ├── OpenAiClient.java
            ├── OpenAiActionResolver.java
            └── OpenAiFieldMappingResolver.java
```

### 패키지 책임

- `api`: 외부 HTTP 요청을 받는 입구다. preparation과 fields는 서로 다른 사용자 동작이므로 controller 2개를 유지한다.
- `dto`: endpoint별 request와 response를 각각 한 파일로 둔다. section, item, candidate, option, 응답 항목과 enum은 사용되는 endpoint DTO 안의 중첩 타입으로 묶는다.
- `application`: 분석 흐름과 공급자 출력 안전성, 외부 응답 조립을 담당한다. `FieldInteractionPolicy`는 DOM metadata에서 interaction status와 write command를 결정하고, `SupportedProfileFields`는 77개 key와 autofill policy를 한곳에 둔다.
- `application.port`: application이 소유하는 공급자 중립 경계다. `ActionResolver`와 `FieldMappingResolver`를 분리해 서로 다른 기능과 output을 이름으로 드러낸다.
- `exception`: form analysis의 HTTP 오류 변환과 application·Resolver 예외를 모은다.
- `infrastructure.adapter.openai`: Spring AI 호출과 endpoint별 비식별 projection, provider structured output 변환을 담당한다.

standalone validator, request body advice, snapshot size guard, 별도 LLM input/output contract 패키지와 전용 provider configuration 클래스는 두지 않는다. Spring Boot의 Jakarta Validation이 request의 필수 여부, 길이, enum과 형식 같은 HTTP 입력 계약을 검사한다. Service는 candidate exact set과 action 실행 가능성처럼 분석 결과를 안전하게 조립하는 데 꼭 필요한 정합성만 검사한다. Spring AI 표준 설정은 `application.yml`에서 주입하고 `OpenAiClient`가 공통 structured output과 엄격한 역직렬화를 적용한다.

### 외부 snapshot과 관계 소유권

두 endpoint는 schemaVersion 2, 기존 URL과 성공 JSON 구조를 유지한다. 선택 속성의 명시적 `null`은 생략과 같고 필수 속성의 `null`은 400이다. 애플리케이션 고유 65,536-byte 제한과 `SNAPSHOT_TOO_LARGE` 응답은 제거한다.

Backend가 소유하는 관계 검증은 다음으로 제한한다.

- 두 endpoint의 candidate ID는 snapshot 전체에서 유일하다.
- preparation section ID는 action target 확인을 위해 유일하다.
- Resolver output의 schemaVersion과 snapshotId가 input과 같고 candidate가 exact 1:1이다.
- ACTION candidate는 visible하고 disabled, readonly, inert가 아니며 reveal target은 request section에 존재한다.
- MATCH key는 canonical 77-key allowlist에 존재한다.

`parentSectionId` graph와 item·option ID 관계는 snapshot producer인 Frontend가 책임진다. fields endpoint는 동일한 section ID가 반복되어도 candidate를 traversal 순서로 분석한다.

### Action OpenAI 경계

Action input에는 `schemaVersion`, `snapshotId`, section/item 문맥과 candidate의 `candidateId`, 표시명, element/control, visibility, 선택적 `domId/domName`, true-only disabled/readonly/inert만 보낸다. `site`와 실행 정보는 보내지 않는다.

OpenAI output은 다음 세 필수 bucket이다.

- `revealSections[]`: `candidateId`, `targetSectionId`
- `addRepeatableGroups[]`: `candidateId`
- `noActions[]`: `candidateId`

OpenAI는 command, expected effect, selector, 실행 횟수와 실행 결과를 만들지 않는다. `PreparationAnalysisService`가 bucket 종류를 `REVEAL_SECTION + TARGET_VISIBLE` 또는 `ADD_REPEATABLE_GROUP + GROUP_COUNT_INCREMENT` 외부 plan으로 변환한다.

### Field OpenAI 경계

Field input에는 `schemaVersion`, `snapshotId`, section/item 문맥, candidate의 `candidateId`, 표시명, element/control과 option 표시명만 보낸다. `site`, visibility, DOM id/name, placeholder, state flag와 option ID는 보내지 않는다.

OpenAI output은 다음 두 필수 bucket이다.

- `matches[]`: `candidateId`, canonical `profileFieldKey`
- `noMatches[]`: `candidateId`

OpenAI는 profile 값, confidence, autofill policy, mapping/interaction status와 write plan을 만들지 않는다. `FieldsAnalysisService`, `SupportedProfileFields`와 `FieldInteractionPolicy`가 외부 `matchType`, policy, status, reason과 write command를 결정한다.

### 공통 출력 검증과 장애 처리

각 bucket entry를 합친 candidate ID는 input candidate와 duplicate, 누락 또는 unknown 없이 exact 1:1이어야 한다. provider structured output과 엄격한 역직렬화는 unknown, missing, explicit null과 trailing token을 거부한다. 하나라도 위반하면 일부 결과를 채택하지 않고 전체 output을 폐기한다.

Resolver 부재, runtime provider 장애, 빈 응답, 역직렬화 실패와 output 계약 위반은 외부 응답에서 `GENERIC + PARTIAL + [LLM_UNAVAILABLE]`와 빈 결과가 된다. 유효한 all-`NO_ACTION`과 all-`NO_MATCH`는 장애가 아니라 `COMPLETE`다. 잘못된 client request는 400, 예기치 않은 로컬 버그는 500이다.

### 금지 데이터와 실행 책임

두 OpenAI payload에는 실제 프로필/control 값, HTML, 전체 URL·query·fragment, cookie/session/account/authorization, selector·실행 코드, DOM handle을 넣지 않는다.

실제 action 클릭, 반복 횟수 계산, 사용자 승인, 효과 확인, target 재탐색, 기존 DOM handle 폐기와 새 DOM 수집은 browser 책임이다. 실제 profile 값 연결, 기존 값 충돌 판단, 민감정보 확인과 field 입력도 browser 책임이다.

### 후속 정적 Resolver

후속 회사별 정적 구현은 같은 `ActionResolver` 또는 `FieldMappingResolver` port를 구현할 수 있다. 검증된 회사 adapter의 fingerprint가 불일치하면 `ADAPTER_STRUCTURE_MISMATCH`로 차단하고 범용 LLM으로 조용히 fallback하지 않는다. `ADAPTER`, `BLOCKED`, `ADAPTER_STRUCTURE_MISMATCH`, `ADAPTER_VERIFIED`, `UNRESOLVED_FIELD`와 `SYSTEM_CONTROL`은 외부 호환을 위해 예약하지만 현재 producer는 생성하지 않는다.

## 결과

외부 endpoint, 성공 JSON과 canonical 77-key 계약을 유지하면서 production Java 파일을 18개로 줄였다. 패키지 이름만 보고 HTTP 입구, application 중심 정책, 공급자 port와 OpenAI adapter 방향을 따라갈 수 있고, endpoint별 관련 record와 enum은 네 DTO 파일 안에서 함께 읽을 수 있다.

이번 단순화는 검증을 없앤 것이 아니라 소유권에 맞게 배치한 것이다. HTTP 형식은 Jakarta Validation, 분석 안전성은 Service, provider JSON 형식은 Spring AI와 엄격한 decoder, snapshot graph 정합성은 Frontend가 맡는다. 정적 회사 기능을 추가할 때는 식별, fingerprint, mapping 저장소와 routing 정책을 별도 Issue에서 결정한다.
