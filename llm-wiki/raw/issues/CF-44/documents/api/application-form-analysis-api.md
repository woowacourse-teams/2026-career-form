# 지원서 분석 API 참조

## 범위와 경계

외부 API는 역할이 다른 두 POST endpoint로 분리한다. `POST /api/v1/preparation/analyze`는 DOM 준비 후보만 분석하고, `POST /api/v1/fields/analyze`는 준비가 끝난 DOM의 field만 매핑한다. 인증 방식은 이 계약 범위 밖이다.

두 요청 모두 비식별 `site`와 평평한 `sections[]`를 사용한다. `parentSectionId`는 같은 snapshot의 다른 section만 가리키며 순환할 수 없다. candidate는 자신을 포함한 section 또는 `items[]`로 소속을 표현하므로 `sectionId`와 `itemId`를 중복하지 않는다. section 소속이 불분명한 candidate는 `section-root` section에 넣는다.

반복되는 자격·학력·경력처럼 한 레코드에 여러 field가 함께 속하면 `items[]`로 한 번 더 묶는다. `itemId`는 snapshot 안에서만 유일한 불투명 ID이며 DOM class 이름이나 순번을 장기 locator로 사용하지 않는다. section에 직접 속한 단일 field는 `sections[].fields[]`, 반복 레코드의 field는 `sections[].items[].fields[]`에 둔다. DOM 복제용 template과 비활성 원본은 item으로 수집하지 않는다.

실제 프로필 값과 control value, HTML, 전체 URL·query·fragment, checked/selected 상태, 쿠키·세션·계정 정보, selector와 실행 코드는 요청·예시·LLM payload에 금지한다. 선택지는 실제 value 대신 `optionId`와 표시명만 보낼 수 있다. `displayName`, `domId`, `domName`, `placeholder`는 발견한 짧은 문자열만 보내며 빈 문자열과 `null`은 보내지 않는다.

`site.host`는 scheme·path·query·fragment가 없는 host와 선택적 port만 허용한다. `site.pathPattern`은 `/`로 시작하고 query·fragment를 포함하지 않는 비식별 경로 패턴이다.

## Snapshot A: preparation 분석

`POST /api/v1/preparation/analyze`는 아직 실행하지 않은 `actionCandidates`만 받는다. section 전체에 영향을 주는 후보는 `sections[].actionCandidates[]`, 반복 item 내부에 실제로 속한 후보는 `sections[].items[].actionCandidates[]`에 둔다. field candidate와 write plan은 이 endpoint에 존재하지 않는다. 응답의 `preparationPlans`는 사용자 승인 뒤에만 브라우저가 실행한다.

<!-- api-example: preparation-request -->
```json
{
  "schemaVersion": 2,
  "snapshotId": "synthetic-preparation-a",
  "site": {"host": "careers.example.test", "pathPattern": "/apply/*"},
  "sections": [
    {
      "sectionId": "section-qualification",
      "displayName": "자격",
      "actionCandidates": [],
      "items": [
        {
          "itemId": "qualification-item-01",
          "actionCandidates": [
            {
              "candidateId": "action-certification-add",
              "element": "button",
              "control": "button",
              "visibility": "visible",
              "displayName": "자격 항목 추가"
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
  "snapshotId": "synthetic-preparation-a",
  "mode": "ADAPTER",
  "analysisStatus": "COMPLETE",
  "preparationPlans": [
    {
      "actionCandidateId": "action-certification-add",
      "command": "ADD_REPEATABLE_GROUP",
      "expectedEffect": "GROUP_COUNT_INCREMENT"
    }
  ]
}
```

backend는 action의 의미와 실행 후 확인할 효과만 반환한다. 실행 횟수, 프로필 항목 수와 실제 프로필 값은 요청과 응답에 넣지 않고 브라우저 로컬에 둔다. 브라우저는 현재 DOM의 반복 행 수를 관측하고 필요한 추가 횟수를 계산한다.

```text
requiredAdditions = max(0, localItemCount - currentDomGroupCount)
```

예를 들어 로컬 자격 항목이 3개이고 화면에 빈 자격 행이 처음부터 1개 있으면 `requiredAdditions`는 2이다. 브라우저는 이 횟수를 사용자에게 제시해 승인받고, 검증된 같은 `ADD_REPEATABLE_GROUP` plan을 한 번씩 순차 실행한다. 매 실행 직후 `GROUP_COUNT_INCREMENT`를 확인하고 행이 증가하지 않거나 같은 action target을 안전하게 다시 찾을 수 없으면 즉시 중단한다.

반복 실행은 검증된 `ADD_REPEATABLE_GROUP`과 `GROUP_COUNT_INCREMENT` 조합에만 허용한다. 과도한 실행을 막는 횟수 제한은 backend가 추측해 반환하지 않고 browser executor의 로컬 안전 정책으로 둔다. 검증되지 않은 범용 후보는 임의 횟수로 반복하지 않고 한 번 실행하거나 차단·수동 처리한다. `REVEAL_SECTION`은 `TARGET_VISIBLE`, `targetSectionId`를 사용하며 명령 의미상 한 번만 실행한다. 브라우저는 승인된 실행이 끝나면 이전 DOM handle을 폐기하고 새 DOM을 수집한다. 효과 확인 또는 안전한 재탐색에 실패하면 즉시 중단하고 이 endpoint를 새 Snapshot A로 다시 호출한다. preparation request에 field나 프로필 유래 목표 개수를 섞거나 preparation response에 write plan을 넣지 않는다.

## Snapshot B: field 분석

`POST /api/v1/fields/analyze`는 준비가 끝난 DOM의 `fields`만 받는다. section 직접 field와 반복 item field를 함께 허용하지만 한 candidate를 두 위치에 중복하지 않는다. action candidate와 preparation plan은 이 endpoint에 존재하지 않는다. 응답은 중첩 위치와 무관하게 `candidateId`로 참조하는 최상위 `fields`와 제한된 write plan만 반환한다.

<!-- api-example: fields-request -->
```json
{
  "schemaVersion": 2,
  "snapshotId": "synthetic-fields-b",
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
  "snapshotId": "synthetic-fields-b",
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
      "matchType": "MATCH",
      "profileFieldKey": "certifications.certificate.issuer",
      "autofillPolicy": "CONDITIONAL",
      "mappingStatus": "LLM_SUGGESTED",
      "interactionStatus": "READY",
      "writePlan": {"command": "SET_TEXT"}
    }
  ]
}
```

## Blocked와 partial 응답

어댑터 후보가 있는데 fingerprint가 불일치하면 두 endpoint 모두 generic 규칙이나 LLM으로 우회하지 않는다. fields endpoint의 blocked 응답은 field analysis만 담는다.

<!-- api-example: fields-response -->
```json
{
  "snapshotId": "synthetic-fields-b",
  "mode": "ADAPTER",
  "analysisStatus": "BLOCKED",
  "blockCode": "ADAPTER_STRUCTURE_MISMATCH",
  "fields": []
}
```

LLM 호출 실패처럼 일부 field의 결과를 만들 수 없으면 확인 가능한 결과만 보존하고 `PARTIAL`과 warning을 반환한다. 이때 결과가 없는 candidate를 `UNKNOWN` mapping으로 꾸미지 않는다. LLM 호출이 정상 완료된 경우에는 아래 LLM output의 candidate 1:1 규칙을 적용한다.

<!-- api-example: fields-response -->
```json
{
  "snapshotId": "synthetic-fields-b",
  "mode": "GENERIC",
  "analysisStatus": "PARTIAL",
  "warningCodes": ["LLM_UNAVAILABLE"],
  "fields": []
}
```

## Backend에서 LLM으로의 최소 payload

회사 전용 어댑터가 존재하고 fingerprint가 일치하면 어댑터가 모든 field mapping을 독점하며 field candidate를 LLM에 보내지 않는다. fingerprint가 불일치하면 `ADAPTER_STRUCTURE_MISMATCH`로 차단하고 generic 또는 LLM으로 우회하지 않는다.

회사 전용 어댑터가 없는 사이트에서는 Snapshot B의 일부가 아니라 모든 field candidate의 의미 매핑을 LLM이 담당한다. backend는 외부 fields request를 그대로 전달하지 않고 LLM 전용 `LlmMappingInput`을 만든다. 이 payload에는 `candidateId`, section 이름과 parent 관계, snapshot-local `itemId`, label/ARIA에서 정규화한 선택적 `displayName`, element/control type과 option 표시명만 포함한다. 같은 `itemId`의 field는 하나의 반복 레코드 문맥으로 유지한다.

다음은 위 Snapshot B의 네 field를 모두 포함한 LLM input이다. `site`, visibility, DOM id/name, placeholder, option ID는 의미 추론에 불필요하므로 제거된다.

<!-- llm-example: mapping-input -->
```json
{
  "schemaVersion": 2,
  "snapshotId": "synthetic-fields-b",
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
              "displayName": "자격 명칭"
            },
            {
              "candidateId": "field-certificate-issuer-01",
              "element": "input",
              "control": "text",
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
              "displayName": "자격 명칭"
            },
            {
              "candidateId": "field-certificate-issuer-02",
              "element": "input",
              "control": "text",
              "displayName": "발급 기관"
            }
          ]
        }
      ]
    }
  ]
}
```

<!-- llm-example: mapping-output -->
```json
{
  "schemaVersion": 2,
  "snapshotId": "synthetic-fields-b",
  "results": [
    {
      "candidateId": "field-certificate-name-01",
      "matchType": "MATCH",
      "profileFieldKey": "certifications.certificate.name"
    },
    {
      "candidateId": "field-certificate-issuer-01",
      "matchType": "MATCH",
      "profileFieldKey": "certifications.certificate.issuer"
    },
    {
      "candidateId": "field-certificate-name-02",
      "matchType": "MATCH",
      "profileFieldKey": "certifications.certificate.name"
    },
    {
      "candidateId": "field-certificate-issuer-02",
      "matchType": "MATCH",
      "profileFieldKey": "certifications.certificate.issuer"
    }
  ]
}
```

LLM output은 input의 각 `candidateId`마다 정확히 하나의 결과를 반환한다. 결과는 canonical `ProfileFieldKey`를 가진 `MATCH` 또는 `profileFieldKey`가 없는 `NO_MATCH` 중 하나다. duplicate, 누락, input에 없던 candidate ID는 backend가 거부한다. `NO_MATCH`는 profile field enum에 섞인 문자열이 아니다.

canonical key는 현재 로컬 저장 위치를 완전히 표현하는 `categoryId.sectionId.fieldId` 형식이다. 예를 들어 어학 시험명은 `languages.languageTest.testName`, 자격 명칭은 `certifications.certificate.name`, 대학교 입학일은 `education.university.startDate`, 프로젝트 시작일은 `projects.project.startDate`다. 평평한 `testName`, `startDate`, `grade`는 결과로 반환할 수 없다.

OpenAPI의 단일 `ProfileFieldKey` allowlist는 현재 `PROFILE_FIELDS.md`와 UI field 선언을 따른다. 파일을 읽거나 업로드하지 않는 `evidenceDocumentPath`는 제외한다. `MATCH`인 외부 field analysis에는 `ALLOWED`, `CONDITIONAL`, `SENSITIVE_CONFIRMATION` 중 하나의 `autofillPolicy`를 함께 반환한다. 민감 field의 의미 분류는 가능하지만 실제 프로필 값 연결과 입력은 browser가 지원 건마다 별도 확인한다.

LLM 결과를 외부 field analysis로 변환할 때 `mappingStatus`는 `LLM_SUGGESTED`다. `RULE_MATCHED`는 비어댑터 route의 producer가 없으므로 계약에서 제거한다. LLM 결과는 사용자 확인 전 자동 실행의 단독 근거가 아니다.

## 오류 계약

| HTTP | code | 의미 |
| --- | --- | --- |
| 400 | `INVALID_REQUEST` | schema, 금지 field, ID 관계 또는 enum 위반 |
| 413 | `SNAPSHOT_TOO_LARGE` | 직렬화된 snapshot request 크기 제한 초과 |
| 429 | `RATE_LIMITED` | 분석 요청 제한 초과 |
| 500 | `INTERNAL_ERROR` | 서버 내부 분석 실패 |
