---
name: project-issue-planning
description: GitHub Project의 확정된 draft issue 하나를 repository Issue로 승격하고 In Progress로 바꾼 뒤, Issue 본문과 단일 PR의 논리적 커밋 계획을 작성해 사람 승인까지 연결한다. 사용자가 "draft issue를 이슈로 승격해줘", "Project 항목을 작업 Issue로 구체화해줘", "이슈 본문과 계획을 채워줘"처럼 구현 전 기획을 요청할 때 사용한다. 확정된 ready Issue의 구현이나 Sub-issue 생성에는 사용하지 않는다.
---

# Project Issue Planning

Project draft 하나를 실행 가능한 Issue 계약으로 만든다. 하나의 Issue는 하나의 브랜치와 하나의 PR로 끝내며 Sub-issue는 만들지 않는다.

## 1. 접근 확인

1. `AGENTS.md`, `harness/policies/issue-contract.md`, `docs/conventions/commit.md`, `docs/conventions/branching.md`를 읽는다.
2. `harness/scripts/diagnose-project-access`를 실행한다.
3. 결과가 `ready`가 아니면 `github-project-onboarding`으로 전환하고 원격 변경 전에 중단한다.
4. `harness/project.json`에서 owner, Project number, repository를 읽는다.

## 2. 대상 확정

1. `gh project item-list <Project 번호> --owner <owner> --format json`으로 항목을 읽는다.
2. 사용자가 지정한 제목과 정확히 일치하는 `DraftIssue`를 찾는다.
3. 일치 항목이 없거나 둘 이상이면 후보 제목과 Project item ID만 보여주고 사용자에게 하나를 지정받는다.
4. 같은 제목의 repository Issue가 이미 있으면 승격을 반복하지 않고 그 Issue 번호를 사용한다.

제목만 비슷하다는 이유로 대상을 추정하지 않는다. 다른 Issue와 draft는 변경하지 않는다.

## 3. Issue 승격과 Project 상태

대상이 하나로 확정되면 다음 순서로 처리한다.

1. `gh api repos/<owner>/<repository> --jq .node_id`로 repository node ID를 읽는다.
2. GraphQL `convertProjectV2DraftIssueItemToIssue` mutation에 Project item ID와 repository node ID를 변수로 전달한다.
3. mutation 결과의 Issue 번호, 제목, URL을 다시 읽는다.
4. `gh project view`와 `gh project field-list`에서 Project ID, Status field ID, `In Progress` option ID를 읽는다.
5. `gh project item-edit --id <item-id> --project-id <project-id> --field-id <status-field-id> --single-select-option-id <option-id>`로 상태를 바꾼다.
6. `gh project item-list`를 다시 읽어 상태가 `In Progress`인지 확인한다.

상태 확인에 실패하면 승격을 반복하지 않는다. 같은 Issue와 item을 대상으로 상태 변경부터 재시도한다.

## 4. Issue 계약 초안 작성

Issue 제목은 `[영역] 작업명` 형식으로 정리한다. `[FE]`, `[BE]`, `[Infra]`, `[Harness]`처럼 팀이 이해하는 영역을 사용하고 작업명은 `한다`로 끝내지 않는다.

원격 Issue 본문을 수정하기 전에 다음 정보를 포함한 전체 본문 초안을 작성한다.

- 배경과 해결하려는 문제
- 목표와 범위
- 제외 범위
- 확인 가능한 인수 조건
- 자동 검증과 사람 수동 검증
- 위험 작업과 사람 담당 경계
- 의존성과 후속 draft 후보

현재 Issue 안에서 완료할 수 없는 큰 FE, BE, Infra 작업은 독립 draft 후보로 제안한다. 사용자가 승인한 경우에만 Project draft로 추가하며 Parent나 Sub-issue 관계를 만들지 않는다.

## 5. 구현 계획 작성과 승인

1. Issue 범위를 한 PR 안의 논리적 커밋 단위로 나눈다.
2. 여러 세션이 필요하면 `docs/plans/<Issue 번호>-<slug>.md`에 계획을 기록한다.
3. 각 단위에 예상 파일, 실패 테스트, 구현, 검증 명령, 커밋 제목을 적는다.
4. 개별 커밋 제목은 Conventional Commit type을 유지하고 설명을 `한다`로 끝내지 않는다.
5. Issue 본문 초안과 구현 계획 전문을 사용자에게 보여주고 승인을 기다린다.
6. 승인 전에는 원격 Issue 본문을 수정하거나 `status:ready`를 붙이거나 구현 브랜치를 만들지 않는다.

승인되면 승인된 전문을 원격 Issue 본문에 게시하고 다시 읽어 일치 여부를 확인한다. 이후 Issue에 `status:ready`를 적용하고 구현은 `issue-workflow`에 넘긴다. Project 상태는 이미 `In Progress`이므로 그대로 유지한다.

## 재실행

현재 상태를 JSON snapshot으로 정리해 `harness/scripts/plan-project-issue <snapshot JSON>`으로 다음 action을 확인할 수 있다. boolean 필드는 JSON boolean만 사용한다. 이미 완료한 원격 변경은 반복하지 않고 반환된 첫 미완료 action부터 계속한다.
