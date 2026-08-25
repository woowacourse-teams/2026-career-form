# 지원서 분석 API 참조

## 범위와 경계

외부 API는 역할이 다른 두 POST endpoint로 분리한다. `POST /api/v1/preparation/analyze`는 DOM 준비 후보만 분석하고, `POST /api/v1/fields/analyze`는 준비가 끝난 DOM의 field만 매핑한다. 인증 방식은 이 계약 범위 밖이다.

두 요청 모두 비식별 `site`와 평평한 `sections[]`를 사용한다. `parentSectionId`는 같은 snapshot의 다른 section만 가리키며 순환할 수 없다. candidate는 자신을 포함한 section으로 소속을 표현하므로 `sectionId`를 중복하지 않고, 소속이 불분명하면 `section-root` section에 넣는다.

실제 프로필 값과 control value, HTML, 전체 URL·query·fragment, checked/selected 상태, 쿠키·세션·계정 정보, selector와 실행 코드는 요청·예시·LLM payload에 금지한다. 선택지는 실제 value 대신 `optionId`와 표시명만 보낼 수 있다. `displayName`, `domId`, `domName`, `placeholder`는 발견한 짧은 문자열만 보내며 빈 문자열과 `null`은 보내지 않는다.

## Snapshot A: preparation 분석

`POST /api/v1/preparation/analyze`는 아직 실행하지 않은 `actionCandidates`만 받는다. field candidate와 write plan은 이 endpoint에 존재하지 않는다. 응답의 `preparationPlans`는 사용자 승인 뒤에만 브라우저가 실행한다.

<!-- api-example: preparation-request -->
```json
{
  "schemaVersion": 2,
  "snapshotId": "synthetic-preparation-a",
  "site": {"host": "careers.example.test", "pathPattern": "/apply/*"},
  "sections": [
    {
      "sectionId": "section-root",
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

`POST /api/v1/fields/analyze`는 준비가 끝난 DOM의 `fields`만 받는다. action candidate와 preparation plan은 이 endpoint에 존재하지 않는다. 응답은 `candidateId`로 참조하는 최상위 `fields`와 제한된 write plan만 반환한다.

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
      "fields": [
        {
          "candidateId": "field-certificate-name",
          "element": "input",
          "control": "text",
          "visibility": "visible",
          "displayName": "자격 명칭",
          "domName": "certificateName"
        },
        {
          "candidateId": "field-certificate-issuer",
          "element": "input",
          "control": "text",
          "visibility": "visible",
          "displayName": "발급 기관"
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
      "candidateId": "field-certificate-name",
      "profileField": "testName",
      "mappingStatus": "RULE_MATCHED",
      "interactionStatus": "READY",
      "writePlan": {"command": "SET_TEXT"}
    },
    {
      "candidateId": "field-certificate-issuer",
      "profileField": "issuer",
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

일부 field만 안전하게 분석하지 못하면 확인 가능한 결과는 보존하고 `PARTIAL`과 warning을 반환한다.

<!-- api-example: fields-response -->
```json
{
  "snapshotId": "synthetic-fields-b",
  "mode": "GENERIC",
  "analysisStatus": "PARTIAL",
  "warningCodes": ["UNRESOLVED_FIELD"],
  "fields": [
    {
      "candidateId": "field-certificate-name",
      "mappingStatus": "UNKNOWN",
      "interactionStatus": "UNVERIFIED",
      "reasonCodes": ["UNKNOWN", "UNVERIFIED"]
    }
  ]
}
```

## Backend에서 LLM으로의 최소 payload

backend는 회사 어댑터와 결정 규칙을 먼저 적용한다. 미지원 사이트의 입력field와 의미 판단에 필요한 section 이름·parent 관계·label/ARIA·control type·option 표시명만 LLM에 전달한다. preparation snapshot 전체와 `actionCandidates`는 LLM에 전달하지 않는다.

LLM structured output은 `candidateId`와 allowlist profile field key 또는 `NO_MATCH`만 반환한다. LLM 결과는 `LLM_SUGGESTED`이며 사용자 확인 전 실행 근거가 아니다.

## 오류 계약

| HTTP | code | 의미 |
| --- | --- | --- |
| 400 | `INVALID_REQUEST` | schema, 금지 field, ID 관계 또는 enum 위반 |
| 413 | `SNAPSHOT_TOO_LARGE` | snapshot 크기 또는 후보 수 제한 초과 |
| 429 | `RATE_LIMITED` | 분석 요청 제한 초과 |
| 500 | `INTERNAL_ERROR` | 서버 내부 분석 실패 |
