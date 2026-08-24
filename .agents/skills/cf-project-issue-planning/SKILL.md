---
name: cf-project-issue-planning
description: 사람이 만든 GitHub Project draft issue 하나를 실행 가능한 작업 계약으로 구체화한다. 제목 보정, Issue 승격, In Progress 전환, 요구사항 인터뷰, Plan 및 ADR 판단, Issue 초안 게시, 사람의 GitHub 수정과 재개 후 검증까지 연결한다. 사용자가 "draft issue를 이슈로 승격해줘", "Project 항목을 작업 Issue로 구체화해줘", "이슈 본문과 계획을 채워줘"처럼 구현 전 기획을 요청하거나 목표, 정책, 범위와 완료 기준을 함께 결정해야 할 때 사용한다. draft 생성, 확정된 ready Issue의 구현, Sub-issue 생성에는 사용하지 않는다.
metadata:
  calls:
    - cf-github-project-onboarding
    - cf-deep-interview
    - cf-grill-me
    - cf-issue-workflow
  portable: true
  external_dependencies: []
---

# Project Issue Planning

사람이 만든 Project draft 하나를 실행 가능한 Issue 계약으로 만든다. 하나의 Issue는 하나의 브랜치와 하나의 PR로 끝내며 draft와 Sub-issue를 만들지 않는다.

## 1. 접근 확인

1. `AGENTS.md`, `llm-wiki/wiki/topics/product-concept.md`, `llm-wiki/wiki/topics/profile-fields.md`, `llm-wiki/wiki/topics/project-conventions.md`, `harness/policies/issue-contract.md`를 읽는다.
2. 선택한 Python으로 `harness/scripts/diagnose-project-access.py`를 실행한다.
3. 결과가 `ready`가 아니면 `cf-github-project-onboarding`으로 전환하고 원격 변경 전에 중단한다.
4. `harness/project.json`에서 owner, Project number, repository를 읽는다.

## 2. 대상 확정

1. `gh project item-list <Project 번호> --owner <owner> --format json --limit 1000`으로 항목을 읽는다.
2. 응답의 `totalCount`와 `items` 개수를 비교한다. 일부만 조회됐으면 대상 부재를 확정하지 않고 조회가 불완전하다고 보고한다.
3. 사용자가 지정한 제목과 정확히 일치하는 `DraftIssue`를 찾는다.
4. 일치 항목이 없으면 사람이 draft를 만들도록 요청하고 중단한다. AI가 대신 만들지 않는다.
5. 일치 항목이 둘 이상이면 후보 제목과 Project item ID만 보여주고 사용자에게 하나를 지정받는다.
6. 같은 제목의 repository Issue가 이미 있으면 승격을 반복하지 않고 그 Issue 번호를 사용한다.

제목만 비슷하다는 이유로 대상을 추정하지 않는다. 다른 Issue와 draft는 변경하지 않는다.

## 3. 제목 보정

승격 전에 draft 제목을 `[영역] 작업명` 계약으로 검사한다.

1. 영역이 Issue 설명, Project 맥락, 사용자 요청에서 하나로 명확하면 `FE`, `BE`, `AI`, `Infra`, `Harness`, `Plan` 중 하나를 선택한다. `FE`, `BE`, `AI`만 전체를 대문자로 쓴다. `AI`는 제품의 LLM, 모델, 프롬프트, 에이전트 기능 작업에 사용하고 `Harness`는 개발 하네스와 워크플로우 변경에 사용한다. `Plan`은 조사, 요구사항 정리와 문서 기획 같은 구현 전 작업에 사용한다.
2. 작업명은 한글을 포함한 명사형으로 다듬고 `한다` 종결, 마침표, Conventional Commit prefix를 제거한다.
3. 영역이 둘 이상 가능하면 제목 후보를 제시하고 사용자에게 영역을 확인받는다.
4. draft의 `content.id`인 DraftIssue ID를 사용해 `gh project item-edit --id <draft-content-id> --title '<보정 제목>'`로 제목을 바꾼다. Project item ID는 제목 변경에 사용하지 않는다.
5. Project item을 다시 조회해 제목이 반영됐는지 확인한다.

이미 승격된 Issue의 제목이 계약을 어기면 `gh issue edit <번호> --title '<보정 제목>'`로 수정하고 다시 읽는다. 제목 보정은 지정된 작업 항목 하나에만 적용한다.

## 4. Issue 승격과 Project 상태

대상이 하나로 확정되면 다음 순서로 처리한다.

1. `gh api repos/<owner>/<repository> --jq .node_id`로 repository node ID를 읽는다.
2. GraphQL `convertProjectV2DraftIssueItemToIssue` mutation에 Project item ID와 repository node ID를 변수로 전달한다. 현재 mutation 입력에 없는 Project ID를 전달하지 않는다.
3. mutation 결과의 Issue 번호, 제목, URL을 다시 읽는다.
4. 승격된 Issue에 다른 `status:*` 라벨이 있으면 제거하고 `status:planning`을 적용한 뒤 다시 읽는다.
5. `gh project view`와 `gh project field-list`에서 Project ID, Status field ID, `In Progress` option ID를 읽는다.
6. `gh project item-edit --id <item-id> --project-id <project-id> --field-id <status-field-id> --single-select-option-id <option-id>`로 상태를 바꾼다.
7. Issue 라벨이 `status:planning`이고 Project 상태가 `In Progress`인지 함께 확인한다.

상태 확인에 실패하면 승격을 반복하지 않는다. 같은 Issue와 item을 대상으로 상태 변경부터 재시도한다.

## 5. 요구사항과 ADR 판단

1. 저장소와 Project에서 확인할 수 있는 사실은 사용자에게 묻지 않고 직접 확인한다.
2. 요청이 항목별로 구체적이어도 정책의 의미, 적용 시점, 범위와 완료 기준을 AI가 대신 결정해야 하면 `cf-deep-interview`를 사용한다.
3. 한 번에 가장 중요한 질문 하나만 하고 목표, 포함 및 제외 범위, 제약과 완료 기준이 정리될 때까지 Issue 계약을 확정하지 않는다.
4. 정책, 보안, 데이터, 공용 워크플로우처럼 실패 비용이 크거나 대안 간 장단점을 압박 검토할 가치가 있으면 `cf-grill-me`를 사용한다. 작고 되돌리기 쉬운 결정에는 강제하지 않는다.
5. `[Plan]`은 기획 자산만 반영하는 작업을 기본으로 한다. 처음 승인할 Issue 계약에 구현이 포함돼 있으면 같은 Issue와 PR에서 구현까지 진행할 수 있다.
6. 여러 대안을 검토했고 결과가 후속 작업, 제품 정책, 아키텍처, 보안, 데이터 또는 공용 워크플로우에 지속적으로 영향을 주는지 판단한다.
7. 장기 결정이 없으면 Issue 본문에 ADR이 필요하지 않은 이유를 기록한다.
8. 장기 결정이 있으면 `llm-wiki/wiki/topics/adr-authoring.md`를 기준으로 ADR 전문과 구현 뒤 예상 raw 경로 `llm-wiki/raw/issues/CF-<Issue 번호>/documents/adr/<Issue 번호>-<slug>.md`를 Issue 계약과 함께 제안한다. 승인 전에는 raw 파일을 만들지 않는다.

## 6. Issue 계약 초안 작성

Issue 제목은 `[영역] 작업명` 형식으로 정리한다. 영역은 `[FE]`, `[BE]`, `[AI]`, `[Infra]`, `[Harness]`, `[Plan]` 중 하나를 사용한다. `FE`, `BE`, `AI`만 전체를 대문자로 쓰고 나머지 영역은 첫 문자만 대문자로 작성한다. 작업명은 `한다`로 끝내지 않는다.

선택한 `.github/ISSUE_TEMPLATE/*.yml`의 실제 `body`를 원본으로 사용한다. 각 입력 응답을 JSON으로 준비하고 선택한 Python으로 `harness/scripts/render-template-body.py issue`를 실행해 OS 임시 UTF-8 Markdown 파일을 만든다. 다음 정보를 포함한 전체 본문 초안을 작성한다.

- 배경에는 현재 문제와 필요한 맥락, 목표에는 완료 후 달라지는 상태
- 포함 범위에는 실제 변경 대상, 제외 범위에는 포함으로 오해할 항목
- 인수 조건에는 확인 가능한 결과
- 자동 검증에는 실행할 명령, 수동 검증에는 자동화할 수 없는 확인과 사람 담당 작업
- 위험 작업에는 실제 위험과 금지 작업의 경계
- 참고 문서에는 판단에 사용한 정본, 의존성과 후속 draft 후보, 필요한 ADR 전문

실제 변경 대상, 범위 경계, 인수 조건, 자동 및 수동 검증, 위험 작업과 사람 담당
경계는 생략하지 않는다. 같은 정보는 역할에 맞는 섹션 한 곳에만 작성한다. 문장을
제거해도 계약 판단이 달라지지 않으면 제거하며 글자 수나 항목 수로 제한하지 않는다.

현재 Issue 안에서 완료할 수 없는 큰 FE, BE, Infra 작업은 독립 draft 후보로 제안한다. 사람이 별도 Project draft로 만들며 Parent나 Sub-issue 관계를 사용하지 않는다.

## 7. 구현 계획과 GitHub 편집 체크포인트

1. Issue 범위를 한 PR 안의 논리적 커밋 단위로 나눈다.
2. 기획 중 논리적 커밋 계획은 Issue 본문에 둔다. 구현 세션의 상세 계획은 worktree가 만들어진 뒤 `git rev-parse --git-path cf-workflow/plan.md` 경로에 기록한다.
3. 각 단위에 예상 파일, 실패 테스트, 구현, 검증 명령, 커밋 제목을 적는다.
4. 개별 커밋 제목은 Conventional Commit type을 유지하고 설명을 `한다`로 끝내지 않는다.
5. `publish_planning_contract`에서 `gh issue edit --body-file <임시 파일>`로 초안을 원격 Issue에 게시하고 `gh issue view`로 게시 결과를 확인한다. 인라인 `--body`를 사용하지 않는다.
6. 게시한 원격 제목과 본문을 UTF-8로 직렬화한 SHA-256 digest를 계산한다. 이 값은 게시 여부를 확인하는 근거이며 사람 승인으로 간주하지 않는다.
7. Issue는 `status:planning`, Project는 `In Progress`로 유지하고 `await_approval`에서 사람이 GitHub 제목과 본문을 수정한 뒤 재개를 명시할 때까지 중단한다.
8. 이 체크포인트에서는 `status:ready`를 붙이거나 구현 브랜치를 만들거나 ADR 파일을 만들지 않는다.

사용자가 최신 원격 계약의 수정 완료나 승인을 알리면 AI가 `gh issue view`로 제목과 본문을 다시 읽고 그 SHA-256 digest를 `approved_contract_digest`로 사용한다. 사용자 변경을 로컬 초안으로 덮어쓰지 않고 `validate_latest_contract`에서 선택한 Python으로 `harness/scripts/validate-issue.py`를 실행한다. 검증에 실패하면 오류를 보고하고 `status:planning`과 Project `In Progress`를 유지한다.

검증 통과 뒤 `set_ready` 직전에 원격 제목과 본문을 다시 읽어 `latest_contract_digest`를 계산한다. 두 digest가 다르면 그 사이에 본문이 바뀐 것이므로 ready로 전환하지 않고 `await_approval`로 돌아간다. 같으면 `status:planning`을 제거하고 `status:ready`를 적용해 다시 확인한다. 라벨 전환이 실패하면 본문 게시와 승인을 반복하지 않고 `set_ready`부터 재시도한다. 이미 `status:ready`인 Issue에는 같은 승인을 다시 요구하지 않는다. ADR 파일은 만들지 않고 구현을 `cf-issue-workflow`에 넘긴다.

## 재실행

현재 상태를 `draft_matches`, `issue_number`, `title_valid`, `issue_status_label`, `project_status`, `contract_drafted`, `plan_exists`, `approved`, `contract_published`, `contract_valid`, `approved_contract_digest`, `latest_contract_digest`가 포함된 JSON snapshot으로 정리해 선택한 Python으로 `harness/scripts/plan-project-issue.py <snapshot 파일>`을 실행한다. action은 `publish_planning_contract`, `await_approval`, `validate_latest_contract`, `set_ready` 순서를 유지한다. `approved`는 사용자가 최신 원격 계약의 수정 완료나 승인을 알렸다는 뜻이고 `contract_valid`는 그 계약의 검증 결과다. boolean 필드는 JSON boolean만 사용한다. 이미 완료한 원격 변경은 반복하지 않고 반환된 첫 미완료 action부터 계속한다.

Issue가 `status:blocked`면 `await_unblock`에서 멈춘다. 제목, 라벨, Project 상태, 계약을 수정하지 않고 사람이 차단을 해제할 때까지 현재 상태를 보존한다.
