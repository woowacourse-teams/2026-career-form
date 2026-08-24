# 지원서 분석 API 참조

## 범위와 경계

외부 API는 `POST /api/v1/application-forms/analyze` 하나다. 인증 방식은 이 계약 범위 밖이며 임의로 정하지 않는다. 브라우저는 현재 DOM에서 값 없는 구조 snapshot만 전송하고, 프로필 값 연결·사용자 승인·입력 실행·기존 값 보호는 브라우저 로컬 책임이다.

요청은 `sections[]` 중심이다. field와 action candidate는 자신을 포함한 section으로 소속을 표현하므로 `sectionId`를 중복하지 않는다. 어느 section에도 자연스럽게 속하지 않는 후보는 `sectionId`가 `section-root`인 section에 넣는다. section 배열은 평평하며 `parentSectionId`는 같은 snapshot의 다른 section만 가리키고 순환할 수 없다. 모든 `candidateId`는 field와 action candidate를 합친 snapshot 범위에서 유일해야 한다.

`displayName`, `domId`, `domName`, `placeholder`는 발견한 짧은 문자열만 보낸다. 빈 문자열과 `null`은 보내지 않는다. `disabled`, `readonly`, `inert`도 `true`일 때만 보낸다.

다음은 요청·예시·LLM payload에서 금지한다: 실제 프로필 값과 control value, HTML, 전체 URL·query·fragment, checked/selected 상태, 쿠키·세션·계정 정보, selector와 실행 코드. option도 실제 value 대신 `optionId`와 표시명만 사용할 수 있다.

## Snapshot A: 준비 후보 분석

브라우저는 아직 실행하지 않은 후보만 `actionCandidates`로 보낸다. 응답은 `preparationPlans`만 반환하고 같은 응답에 `writePlan`을 반환하지 않는다.

<!-- api-example: request -->
```json
{
  "schemaVersion": 1,
  "snapshotId": "synthetic-snapshot-a",
  "site": {"host": "careers.example.test", "pathPattern": "/apply/*"},
  "sections": [
    {
      "sectionId": "section-root",
      "fields": [],
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

<!-- api-example: response -->
```json
{
  "snapshotId": "synthetic-snapshot-a",
  "mode": "ADAPTER",
  "analysisStatus": "COMPLETE",
  "fields": [],
  "preparationPlans": [
    {
      "actionCandidateId": "action-certification-add",
      "command": "ADD_REPEATABLE_GROUP",
      "expectedEffect": "GROUP_COUNT_INCREMENT",
      "maxExecutions": 1
    }
  ]
}
```

브라우저는 사용자가 승인한 plan만 실행하고 효과를 관측한 뒤 기존 DOM handle을 폐기한다. 새 DOM을 Snapshot B로 다시 수집한다.

## Snapshot B: field 분석

추가 준비가 없으면 section별 `actionCandidates`를 생략한다. response는 candidateId로 참조하므로 `fields`를 최상위에 평평하게 반환한다.

<!-- api-example: request -->
```json
{
  "schemaVersion": 1,
  "snapshotId": "synthetic-snapshot-b",
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

<!-- api-example: response -->
```json
{
  "snapshotId": "synthetic-snapshot-b",
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

어댑터 후보가 있는데 fingerprint가 불일치하면 generic 규칙이나 LLM으로 우회하지 않는다.

<!-- api-example: response -->
```json
{
  "snapshotId": "synthetic-snapshot-b",
  "mode": "ADAPTER",
  "analysisStatus": "BLOCKED",
  "blockCode": "ADAPTER_STRUCTURE_MISMATCH",
  "fields": []
}
```

일부 field만 안전하게 분석하지 못하면 확인 가능한 결과는 보존하고 `PARTIAL`과 warning을 반환한다.

<!-- api-example: response -->
```json
{
  "snapshotId": "synthetic-snapshot-b",
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

backend는 어댑터와 결정 규칙을 먼저 적용한다. 미지원 사이트에서 규칙으로 확정하지 못한 field와 그 의미 판단에 필요한 section 이름·parent 관계·label/ARIA·control type·option 표시명만 LLM에 전달한다. browser snapshot 전체와 `actionCandidates`는 LLM에 전달하지 않는다.

LLM structured output은 `candidateId`와 allowlist profile field key 또는 `NO_MATCH`만 반환한다. LLM 결과는 `LLM_SUGGESTED`이며 사용자 확인 전 실행 근거가 아니다.

## 오류 계약

| HTTP | code | 의미 |
| --- | --- | --- |
| 400 | `INVALID_REQUEST` | schema, 금지 field, ID 관계 또는 enum 위반 |
| 413 | `SNAPSHOT_TOO_LARGE` | snapshot 크기 또는 후보 수 제한 초과 |
| 429 | `RATE_LIMITED` | 분석 요청 제한 초과 |
| 500 | `INTERNAL_ERROR` | 서버 내부 분석 실패 |
