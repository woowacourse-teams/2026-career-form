---
name: project-issue-planning
description: 사람이 만든 GitHub Project draft issue 하나의 제목을 작업 컨벤션에 맞게 보정하고 repository Issue로 승격해 In Progress로 바꾼 뒤, Issue 본문과 단일 PR의 논리적 커밋 계획을 작성해 사람 승인까지 연결한다. 사용자가 "draft issue를 이슈로 승격해줘", "Project 항목을 작업 Issue로 구체화해줘", "이슈 본문과 계획을 채워줘"처럼 구현 전 기획을 요청할 때 사용한다. draft 생성, 확정된 ready Issue의 구현, Sub-issue 생성에는 사용하지 않는다.
---

# Project Issue Planning

사람이 만든 Project draft 하나를 실행 가능한 Issue 계약으로 만든다. 하나의 Issue는 하나의 브랜치와 하나의 PR로 끝내며 draft와 Sub-issue를 만들지 않는다.

## 1. 접근 확인

1. `AGENTS.md`, `harness/policies/issue-contract.md`, `docs/conventions/commit.md`, `docs/conventions/branching.md`를 읽는다.
2. `harness/scripts/diagnose-project-access`를 실행한다.
3. 결과가 `ready`가 아니면 `github-project-onboarding`으로 전환하고 원격 변경 전에 중단한다.
4. `harness/project.json`에서 owner, Project number, repository를 읽는다.

## 2. 대상 확정

1. `gh project item-list <Project 번호> --owner <owner> --format json`으로 항목을 읽는다.
2. 사용자가 지정한 제목과 정확히 일치하는 `DraftIssue`를 찾는다.
3. 일치 항목이 없으면 사람이 draft를 만들도록 요청하고 중단한다. AI가 대신 만들지 않는다.
4. 일치 항목이 둘 이상이면 후보 제목과 Project item ID만 보여주고 사용자에게 하나를 지정받는다.
5. 같은 제목의 repository Issue가 이미 있으면 승격을 반복하지 않고 그 Issue 번호를 사용한다.

제목만 비슷하다는 이유로 대상을 추정하지 않는다. 다른 Issue와 draft는 변경하지 않는다.

## 3. 제목 보정

승격 전에 draft 제목을 `[영역] 작업명` 계약으로 검사한다.

1. 영역이 Issue 설명, Project 맥락, 사용자 요청에서 하나로 명확하면 `FE`, `BE`, `Infra`, `Harness` 중 하나를 선택한다.
2. 작업명은 한글을 포함한 명사형으로 다듬고 `한다` 종결, 마침표, Conventional Commit prefix를 제거한다.
3. 영역이 둘 이상 가능하면 제목 후보를 제시하고 사용자에게 영역을 확인받는다.
4. draft의 `content.id`를 사용해 `gh project item-edit --id <draft-content-id> --title '<보정 제목>'`로 제목을 바꾼다.
5. Project item을 다시 조회해 제목이 반영됐는지 확인한다.

이미 승격된 Issue의 제목이 계약을 어기면 `gh issue edit <번호> --title '<보정 제목>'`로 수정하고 다시 읽는다. 제목 보정은 지정된 작업 항목 하나에만 적용한다.

## 4. Issue 승격과 Project 상태

대상이 하나로 확정되면 다음 순서로 처리한다.

1. `gh api repos/<owner>/<repository> --jq .node_id`로 repository node ID를 읽는다.
2. GraphQL `convertProjectV2DraftIssueItemToIssue` mutation에 Project item ID와 repository node ID를 변수로 전달한다.
3. mutation 결과의 Issue 번호, 제목, URL을 다시 읽는다.
4. 승격된 Issue에 다른 `status:*` 라벨이 있으면 제거하고 `status:planning`을 적용한 뒤 다시 읽는다.
5. `gh project view`와 `gh project field-list`에서 Project ID, Status field ID, `In Progress` option ID를 읽는다.
6. `gh project item-edit --id <item-id> --project-id <project-id> --field-id <status-field-id> --single-select-option-id <option-id>`로 상태를 바꾼다.
7. Issue 라벨이 `status:planning`이고 Project 상태가 `In Progress`인지 함께 확인한다.

상태 확인에 실패하면 승격을 반복하지 않는다. 같은 Issue와 item을 대상으로 상태 변경부터 재시도한다.

## 5. Issue 계약 초안 작성

Issue 제목은 `[영역] 작업명` 형식으로 정리한다. 영역은 `[FE]`, `[BE]`, `[Infra]`, `[Harness]` 중 하나를 사용하고 작업명은 `한다`로 끝내지 않는다.

원격 Issue 본문을 수정하기 전에 다음 정보를 포함한 전체 본문 초안을 작성한다.

- 배경과 해결하려는 문제
- 목표와 범위
- 제외 범위
- 확인 가능한 인수 조건
- 자동 검증과 사람 수동 검증
- 위험 작업과 사람 담당 경계
- 의존성과 후속 draft 후보

현재 Issue 안에서 완료할 수 없는 큰 FE, BE, Infra 작업은 독립 draft 후보로 제안한다. 사람이 별도 Project draft로 만들며 Parent나 Sub-issue 관계를 사용하지 않는다.

## 6. 구현 계획 작성과 승인

1. Issue 범위를 한 PR 안의 논리적 커밋 단위로 나눈다.
2. 여러 세션이 필요하면 `docs/plans/<Issue 번호>-<slug>.md`에 계획을 기록한다.
3. 각 단위에 예상 파일, 실패 테스트, 구현, 검증 명령, 커밋 제목을 적는다.
4. 개별 커밋 제목은 Conventional Commit type을 유지하고 설명을 `한다`로 끝내지 않는다.
5. Issue 본문 초안과 구현 계획 전문을 사용자에게 보여주고 승인을 기다린다.
6. 승인 전에는 원격 Issue 본문을 수정하거나 `status:ready`를 붙이거나 구현 브랜치를 만들지 않는다.

승인되면 승인된 전문을 원격 Issue 본문에 게시하고 다시 읽어 일치 여부를 확인한다. 게시가 확인된 뒤 `status:planning`을 제거하고 `status:ready`를 적용해 다시 확인한다. 본문 게시 뒤 라벨 전환이 실패하면 게시를 반복하지 않고 `set_ready`부터 재시도한다. 구현은 `issue-workflow`에 넘기고 Project 상태는 이미 `In Progress`이므로 그대로 유지한다.

## 재실행

현재 상태를 `draft_matches`, `issue_number`, `title_valid`, `issue_status_label`, `project_status`, `contract_drafted`, `plan_exists`, `approved`, `contract_published`가 포함된 JSON snapshot으로 정리해 `harness/scripts/plan-project-issue <snapshot JSON>`으로 다음 action을 확인할 수 있다. boolean 필드는 JSON boolean만 사용한다. 이미 완료한 원격 변경은 반복하지 않고 반환된 첫 미완료 action부터 계속한다.
