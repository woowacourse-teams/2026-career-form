# 지원서 분석 API 참조

## 범위와 정본

이 문서는 schemaVersion 2 지원서 분석의 외부 HTTP 계약과 Backend에서 OpenAI로 전달하는 내부 JSON 계약을 함께 정의한다. 기계 판독 계약은 [OpenAPI 3.1 문서](application-form-analysis.openapi.yaml)와 함께 관리한다. 인증 방식은 이 계약 범위 밖이다.

외부 API는 항상 존재하는 두 POST endpoint로 분리한다.

- `POST /api/v1/preparation/analyze`: 모든 action candidate를 범용 LLM으로 `ACTION | NO_ACTION` 분석하고 검증된 ACTION만 외부 preparation plan으로 반환한다.
- `POST /api/v1/fields/analyze`: 모든 field candidate를 범용 LLM으로 canonical 77-key allowlist의 `MATCH | NO_MATCH`로 분석하고 Backend가 deterministic interaction/write 정책을 적용한다.

현재 정상 producer는 `GENERIC` LLM route뿐이다. `ADAPTER`, `BLOCKED`, `ADAPTER_STRUCTURE_MISMATCH`, `ADAPTER_VERIFIED`, `UNRESOLVED_FIELD`와 `SYSTEM_CONTROL`은 후속 정적 Resolver 호환을 위한 예약 값이며 현재 production code는 생성하지 않는다.

## 공통 snapshot 규칙

두 요청은 `schemaVersion`, snapshot-local `snapshotId`, 비식별 `site`와 평평한 `sections[]`를 사용한다. 필수 속성의 누락이나 `null`은 400이다. 선택 속성은 생략하거나 `null`로 보낼 수 있으며 두 표현은 같은 의미다. 선택 문자열이 존재할 때 빈 문자열은 허용하지 않는다. `disabled`, `readonly`, `inert`는 `true`, `null` 또는 생략만 허용하고 `false`를 보내지 않는다.

Backend는 분석 결과를 안전하게 해석하는 데 필요한 관계만 검증한다.

- 두 endpoint 모두 snapshot 전체에서 candidate ID가 유일해야 한다.
- preparation endpoint는 action target을 판별하기 위해 section ID도 유일해야 한다.
- Resolver output은 input candidate와 duplicate, 누락 또는 unknown 없이 exact 1:1이어야 한다.
- ACTION은 실행 가능한 candidate만 대상으로 하며 `REVEAL_SECTION` target은 request에 존재하는 section이어야 한다.

`parentSectionId` graph, item ID와 option ID의 snapshot 내 정합성은 snapshot producer인 Frontend가 책임진다. fields endpoint는 같은 section ID가 반복되어도 분석할 수 있다. section에 직접 속한 candidate는 section 배열에 두고, 하나의 자격·학력·경력처럼 반복되는 논리 레코드에 속한 candidate는 snapshot-local `itemId`를 가진 `items[]` 아래에 둔다. section 소속을 알 수 없는 candidate는 합성 `section-root`에 넣는다.

| 속성 | 최대 길이 |
| --- | ---: |
| snapshot/section/item/candidate/option ID | 128자 |
| `displayName`, `domId`, `domName`, `placeholder` | 120자 |
| `site.host` | 253자 |
| `site.pathPattern` | 512자 |

애플리케이션 고유 request byte 제한은 두지 않는다. 실제 profile/control 값, HTML, 전체 URL·query·fragment, checked/selected 상태, cookie/session/account/authorization, selector·실행 코드와 DOM handle은 외부 요청, OpenAI payload, 예시와 로그에 넣지 않는다. `site.host`는 scheme과 path가 없는 host 및 선택적 port이고 `pathPattern`은 `/`로 시작하며 query와 fragment가 없는 비식별 패턴이다.

## Snapshot A: preparation 분석

preparation endpoint는 `actionCandidates`만 받고 `preparationPlans`만 반환한다. field candidate와 write plan을 섞지 않는다.

<!-- api-example: preparation-request -->
```json
{
  "schemaVersion": 2,
  "snapshotId": "synthetic-preparation-v2",
  "site": {"host": "careers.example.test", "pathPattern": "/apply/*"},
  "sections": [
    {
      "sectionId": "section-root",
      "displayName": "지원서",
      "actionCandidates": [
        {
          "candidateId": "action-reveal-qualification",
          "element": "button",
          "control": "button",
          "visibility": "visible",
          "displayName": "자격 영역 열기",
          "domId": "qualification-open"
        },
        {
          "candidateId": "action-hidden-template",
          "element": "button",
          "control": "button",
          "visibility": "hidden",
          "displayName": "숨김 template action",
          "inert": true
        }
      ]
    },
    {
      "sectionId": "section-qualification",
      "parentSectionId": "section-root",
      "displayName": "자격",
      "actionCandidates": [],
      "items": [
        {
          "itemId": "qualification-item-01",
          "actionCandidates": [
            {
              "candidateId": "action-add-qualification",
              "element": "button",
              "control": "button",
              "visibility": "visible",
              "displayName": "자격 항목 추가",
              "domName": "qualificationAdd"
            }
          ]
        }
      ]
    }
  ]
}
```

<!-- api-example: preparation-response -->
```json
{
  "snapshotId": "synthetic-preparation-v2",
  "mode": "GENERIC",
  "analysisStatus": "COMPLETE",
  "preparationPlans": [
    {
      "actionCandidateId": "action-reveal-qualification",
      "command": "REVEAL_SECTION",
      "expectedEffect": "TARGET_VISIBLE",
      "targetSectionId": "section-qualification"
    },
    {
      "actionCandidateId": "action-add-qualification",
      "command": "ADD_REPEATABLE_GROUP",
      "expectedEffect": "GROUP_COUNT_INCREMENT"
    }
  ]
}
```

유효한 all-`NO_ACTION`은 빈 `preparationPlans`를 가진 `COMPLETE`다. 외부 응답은 LLM의 `NO_ACTION`을 노출하지 않는다.

Resolver 부재, runtime 공급자 장애 또는 LLM output 전체 계약 위반은 일부 plan을 보존하지 않고 다음 exact partial 응답이 된다.

<!-- api-example: preparation-response -->
```json
{
  "snapshotId": "synthetic-preparation-v2",
  "mode": "GENERIC",
  "analysisStatus": "PARTIAL",
  "warningCodes": ["LLM_UNAVAILABLE"],
  "preparationPlans": []
}
```

실제 클릭, 반복 횟수 계산, 사용자 승인, 실행, 기대 효과 확인, 같은 action target 재탐색, 기존 DOM handle 폐기와 새 DOM 수집은 browser 책임이다. Backend와 LLM은 클릭하거나 효과가 이미 발생했다고 주장하지 않는다.

## Snapshot B: field 분석

fields endpoint는 준비가 끝난 DOM의 `fields`만 받고 action candidate와 preparation plan을 받지 않는다. 외부 응답은 모든 요청 candidate를 snapshot traversal 순서로 정확히 한 번 포함한다.

<!-- api-example: fields-request -->
```json
{
  "schemaVersion": 2,
  "snapshotId": "synthetic-fields-v2",
  "site": {"host": "careers.example.test", "pathPattern": "/apply/*"},
  "sections": [
    {
      "sectionId": "section-qualification",
      "displayName": "자격",
      "fields": [],
      "items": [
        {
          "itemId": "qualification-item-01",
          "fields": [
            {
              "candidateId": "field-certificate-name-01",
              "element": "input",
              "control": "text",
              "visibility": "visible",
              "displayName": "자격 명칭",
              "domName": "certificateName"
            },
            {
              "candidateId": "field-certificate-issuer-01",
              "element": "input",
              "control": "text",
              "visibility": "visible",
              "displayName": "발급 기관"
            }
          ]
        },
        {
          "itemId": "qualification-item-02",
          "fields": [
            {
              "candidateId": "field-certificate-name-02",
              "element": "input",
              "control": "text",
              "visibility": "visible",
              "displayName": "자격 명칭",
              "domName": "certificateName"
            },
            {
              "candidateId": "field-certificate-issuer-02",
              "element": "input",
              "control": "text",
              "visibility": "visible",
              "displayName": "발급 기관"
            }
          ]
        }
      ]
    }
  ]
}
```

<!-- api-example: fields-response -->
```json
{
  "snapshotId": "synthetic-fields-v2",
  "mode": "GENERIC",
  "analysisStatus": "COMPLETE",
  "fields": [
    {
      "candidateId": "field-certificate-name-01",
      "matchType": "MATCH",
      "profileFieldKey": "certifications.certificate.name",
      "autofillPolicy": "CONDITIONAL",
      "mappingStatus": "LLM_SUGGESTED",
      "interactionStatus": "READY",
      "writePlan": {"command": "SET_TEXT"}
    },
    {
      "candidateId": "field-certificate-issuer-01",
      "matchType": "MATCH",
      "profileFieldKey": "certifications.certificate.issuer",
      "autofillPolicy": "CONDITIONAL",
      "mappingStatus": "LLM_SUGGESTED",
      "interactionStatus": "READY",
      "writePlan": {"command": "SET_TEXT"}
    },
    {
      "candidateId": "field-certificate-name-02",
      "matchType": "MATCH",
      "profileFieldKey": "certifications.certificate.name",
      "autofillPolicy": "CONDITIONAL",
      "mappingStatus": "LLM_SUGGESTED",
      "interactionStatus": "READY",
      "writePlan": {"command": "SET_TEXT"}
    },
    {
      "candidateId": "field-certificate-issuer-02",
      "matchType": "NO_MATCH",
      "mappingStatus": "LLM_SUGGESTED",
      "interactionStatus": "BLOCKED",
      "reasonCodes": ["NO_MATCH"]
    }
  ]
}
```

유효한 all-`NO_MATCH`도 장애가 아니라 `COMPLETE`이며 각 candidate를 `NO_MATCH + BLOCKED + [NO_MATCH]`로 보존한다. Resolver 장애 또는 output 계약 위반은 다음 exact partial 응답이 된다.

<!-- api-example: fields-response -->
```json
{
  "snapshotId": "synthetic-fields-v2",
  "mode": "GENERIC",
  "analysisStatus": "PARTIAL",
  "warningCodes": ["LLM_UNAVAILABLE"],
  "fields": []
}
```

## Backend ↔ OpenAI 내부 계약

외부 request를 공급자에게 그대로 보내지 않는다. `OpenAiActionResolver`와 `OpenAiFieldMappingResolver`가 각각 목적에 필요한 최소 JSON으로 투영한다. `OpenAiClient`는 Spring AI의 provider-native structured output과 엄격한 Jackson 역직렬화를 공통 적용한다. provider-side 저장과 prompt/completion/error logging은 끈다.

### Action LLM input

Action LLM에는 `site`와 실행 정보를 제외하고 candidate 의미, section/item 문맥과 현재 실행 가능성 판단에 필요한 metadata만 보낸다.

<!-- llm-example: action-input -->
```json
{
  "schemaVersion": 2,
  "snapshotId": "synthetic-preparation-v2",
  "sections": [
    {
      "sectionId": "section-root",
      "displayName": "지원서",
      "actionCandidates": [
        {
          "candidateId": "action-reveal-qualification",
          "displayName": "자격 영역 열기",
          "element": "button",
          "control": "button",
          "visibility": "visible",
          "domId": "qualification-open"
        },
        {
          "candidateId": "action-hidden-template",
          "displayName": "숨김 template action",
          "element": "button",
          "control": "button",
          "visibility": "hidden",
          "inert": true
        }
      ]
    },
    {
      "sectionId": "section-qualification",
      "parentSectionId": "section-root",
      "displayName": "자격",
      "actionCandidates": [],
      "items": [
        {
          "itemId": "qualification-item-01",
          "actionCandidates": [
            {
              "candidateId": "action-add-qualification",
              "displayName": "자격 항목 추가",
              "element": "button",
              "control": "button",
              "visibility": "visible",
              "domName": "qualificationAdd"
            }
          ]
        }
      ]
    }
  ]
}
```

### Action LLM output

<!-- llm-example: action-output -->
```json
{
  "schemaVersion": 2,
  "snapshotId": "synthetic-preparation-v2",
  "revealSections": [
    {
      "candidateId": "action-reveal-qualification",
      "targetSectionId": "section-qualification"
    }
  ],
  "addRepeatableGroups": [
    {
      "candidateId": "action-add-qualification"
    }
  ],
  "noActions": [
    {
      "candidateId": "action-hidden-template"
    }
  ]
}
```

OpenAI output은 판단에 필요한 bucket만 반환한다. `command`와 `expectedEffect`는 공급자 출력에 포함하지 않고 `PreparationAnalysisService`가 bucket 종류로부터 생성한다.

### Field LLM input

Field LLM에는 `site`, visibility, `domId`, `domName`, placeholder, state flag와 option ID를 보내지 않는다. 같은 item의 field는 함께 유지한다.

<!-- llm-example: mapping-input -->
```json
{
  "schemaVersion": 2,
  "snapshotId": "synthetic-fields-v2",
  "sections": [
    {
      "sectionId": "section-qualification",
      "displayName": "자격",
      "fields": [],
      "items": [
        {
          "itemId": "qualification-item-01",
          "fields": [
            {
              "candidateId": "field-certificate-name-01",
              "displayName": "자격 명칭",
              "element": "input",
              "control": "text"
            },
            {
              "candidateId": "field-certificate-issuer-01",
              "displayName": "발급 기관",
              "element": "input",
              "control": "text"
            }
          ]
        },
        {
          "itemId": "qualification-item-02",
          "fields": [
            {
              "candidateId": "field-certificate-name-02",
              "displayName": "자격 명칭",
              "element": "input",
              "control": "text"
            },
            {
              "candidateId": "field-certificate-issuer-02",
              "displayName": "발급 기관",
              "element": "input",
              "control": "text"
            }
          ]
        }
      ]
    }
  ]
}
```

### Field LLM output

<!-- llm-example: mapping-output -->
```json
{
  "schemaVersion": 2,
  "snapshotId": "synthetic-fields-v2",
  "matches": [
    {
      "candidateId": "field-certificate-name-01",
      "profileFieldKey": "certifications.certificate.name"
    },
    {
      "candidateId": "field-certificate-issuer-01",
      "profileFieldKey": "certifications.certificate.issuer"
    },
    {
      "candidateId": "field-certificate-name-02",
      "profileFieldKey": "certifications.certificate.name"
    }
  ],
  "noMatches": [
    {
      "candidateId": "field-certificate-issuer-02"
    }
  ]
}
```

두 output은 input과 같은 `schemaVersion`, `snapshotId`를 가지며 모든 bucket을 합친 candidate ID가 duplicate, 누락 또는 unknown 없이 exact 1:1이어야 한다. 각 bucket entry는 필요한 속성만 가지며 unknown, missing, explicit null과 trailing token을 거부한다. 위반 하나라도 있으면 전체 output을 폐기한다.

OpenAI adapter는 Spring AI 표준 설정에서 model, timeout, retry와 completion token 수를 주입받고 reasoning effort `none`, `store=false`를 사용한다. 별도 provider 설정 클래스나 중복 LLM contract 계층은 두지 않으며 provider 선택 자체는 외부 HTTP 계약에 노출하지 않는다.

## Field interaction/write 정책

LLM은 의미 mapping만 반환한다. Backend는 아래 순서대로 deterministic policy를 적용한다.

| 조건 | `interactionStatus` | `reasonCodes` | `writePlan.command` |
| --- | --- | --- | --- |
| `NO_MATCH` | `BLOCKED` | `[NO_MATCH]` | 없음 |
| disabled, readonly 또는 inert | `BLOCKED` | 생략 | 없음 |
| hidden | `MANUAL_REVEAL_REQUIRED` | 생략 | 없음 |
| custom 또는 element/control mismatch | `UNVERIFIED` | 생략 | 없음 |
| visible `input + text` | `READY` | 생략 | `SET_TEXT` |
| visible `textarea + textarea` | `READY` | 생략 | `SET_TEXT` |
| visible `select + select` | `READY` | 생략 | `SELECT_OPTION` |
| visible `input + radio` | `READY` | 생략 | `CHECK_RADIO` |
| visible `input + checkbox` | `READY` | 생략 | `CHECK_CHECKBOX` |

실제 profile 값 연결, 기존 값 충돌 판단, 민감정보 확인과 입력은 browser가 수행한다. `MATCH`는 값이나 자동 실행 승인이 아니라 canonical 의미 분류다.

## 정적 Resolver 확장 경계

후속 회사별 정적 Resolver는 동일한 `ActionResolver` 또는 `FieldMappingResolver` port를 구현한다. 검증된 회사 adapter의 fingerprint가 불일치하면 `ADAPTER_STRUCTURE_MISMATCH`로 차단하고 LLM으로 fallback하지 않는다. 이번 구현에는 정적 Resolver, DB mapping, fingerprint 수집, registry/router가 없다.

## 오류 계약

| HTTP | code | 의미 |
| --- | --- | --- |
| 400 | `INVALID_REQUEST` | schema, 필수 속성, 금지 field, Backend 소유 ID 관계 또는 enum 위반 |
| 500 | `INTERNAL_ERROR` | 예상하지 않은 로컬 서버 오류 |

선택 속성의 `null`은 생략과 같으므로 오류가 아니다. Resolver 부재와 runtime 공급자 장애는 5xx가 아니라 위에서 정의한 200 partial 응답이다. 애플리케이션 고유 413 응답은 없으며 현재 구현하지 않는 429와 502도 operation 계약에 없다.
