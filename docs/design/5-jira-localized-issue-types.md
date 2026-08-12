# Jira Cloud 한국어 이슈 타입 매핑

## 목표

Jira Cloud 프로젝트 `CF`가 노출하는 한국어 이슈 타입 이름으로 GitHub Issue Form 유형을 변환한다.

## 배경

`CF` 프로젝트의 create metadata에서 생성 가능한 이슈 타입은 `에픽`, `작업`, `스토리`, `버그`로 확인됐다. 기존 매퍼는 영문 `Epic`, `Task`, `Story`, `Bug`를 보내므로 Jira Cloud가 해당 이슈 타입을 찾지 못해 HTTP 400을 반환한다.

## 설계

`resolveJiraIssueType`의 입력 계약과 Jira 요청 payload 구조는 유지한다. 반환하는 이슈 타입 이름만 다음과 같이 변경한다.

| GitHub 구분 | Jira CF 이슈 타입 이름 |
| --- | --- |
| `type:bug` | `버그` |
| `type:technical` | `작업` |
| Feature `Epic` | `에픽` |
| Feature `Story` | `스토리` |

워크플로의 인증, URL, ADF 설명, 중복 방지, GitHub Issue 후처리는 변경하지 않는다. 단위 테스트는 매퍼 반환값과 생성 payload의 이슈 타입 이름이 실제 CF 값과 일치하는지 검증한다.

## 오류 처리와 검증

지원하지 않는 라벨 또는 Feature 선택값은 기존처럼 Jira 생성을 생략한다. `node --test scripts/jira_issue_payload.test.mjs`, `actionlint`, `harness/scripts/verify`로 자동 검증한다. 실제 Jira 생성은 사람이 CF 테스트 Issue를 열어 확인한다.
