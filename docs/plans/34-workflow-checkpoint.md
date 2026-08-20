# 오케스트레이션 Skill 재개와 승인 흐름 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use `cf-executing-plans` to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 같은 worktree에서 중단된 Issue 작업을 첫 미완료 단계부터 재개하고, 승인한 Issue 본문과 현재 HEAD의 검증 근거가 확인된 경우에만 다음 상태로 전환한다.

**Architecture:** 기획 상태 전이는 원격 Issue 본문의 해시로 승인 대상을 식별한다. 구현 상태는 worktree 전용 Git 디렉터리의 JSON 체크포인트에 단계 시작 전 기록하고, 재개 시 저장 기록을 현재 브랜치, HEAD, 계획 파일, Draft PR 관찰값과 대조한다. PreToolUse 훅은 현재 HEAD의 검증 완료 기록이 없는 `gh pr create`만 차단하며 다른 질문과 읽기 작업은 제한하지 않는다.

**Tech Stack:** Python 3.13, `unittest`, Git worktree metadata, JSON, Codex PreToolUse hook, GitHub CLI

## Global Constraints

- Issue #34의 포함 범위와 인수 조건을 완료 기준으로 사용한다.
- 체크포인트는 `git rev-parse --git-path`로 구한 worktree 전용 Git 디렉터리에 저장하고 Git에 커밋하지 않는다.
- 단계는 계획 확인, 구현, 검증, Draft PR 생성까지만 구분하고 구현 계획 내부 Task와 Step은 추적하지 않는다.
- 환경변수, `MEMORY.md`와 대화 내용은 완료 상태의 기준으로 사용하지 않는다.
- 삭제한 worktree, 다른 PC와 새 clone으로 체크포인트를 이전하지 않는다.
- 사용자 확인은 `status:ready` 전 한 번만 요구하고, 승인 뒤 원격 Issue 본문이 바뀌면 다시 확인한다.
- Draft PR 생성에는 현재 HEAD의 검증 완료 기록이 필요하다.
- WSL/Linux 수동 검증과 다른 팀원의 `harness-change` 리뷰는 PR에서 미완료 사람 확인 항목으로 남긴다.

---

### Task 1: 게시된 Issue 계약 승인 대상 고정

**Files:**
- Modify: `harness/lib/project_issue.py`
- Modify: `harness/scripts/plan-project-issue.py`
- Test: `harness/tests/test_project_issue.py`
- Test: `harness/tests/test_scripts.py`

**Interfaces:**
- Consumes: `approved_contract_digest: str | None`, `latest_contract_digest: str | None`가 포함된 기획 snapshot
- Produces: `publish_planning_contract`, `await_approval`, `validate_latest_contract`, `set_ready` 순서의 `PlanningAction`

- [x] **Step 1: 승인한 본문과 최신 본문이 다르면 재승인을 요구하는 실패 테스트 작성**

```python
def test_reawaits_approval_when_remote_contract_changes(self) -> None:
    action = next_planning_action(
        ProjectIssueSnapshot(
            draft_matches=0,
            issue_number=34,
            issue_status_label="status:planning",
            project_status="In Progress",
            contract_drafted=True,
            plan_exists=True,
            contract_published=True,
            approved=True,
            approved_contract_digest="approved",
            latest_contract_digest="changed",
        )
    )

    self.assertEqual("await_approval", action.code)
```

게시 전 action과 승인 뒤 검증 action도 각각 `publish_planning_contract`, `validate_latest_contract`인지 확인한다.

- [x] **Step 2: 기획 상태 전이 테스트의 예상 실패 확인**

Run: `.venv/bin/python -m unittest harness.tests.test_project_issue harness.tests.test_scripts -v`

Expected: 새 digest 필드와 action code가 없어 FAIL

- [x] **Step 3: 승인 대상 digest를 포함한 기획 상태 전이 구현**

`ProjectIssueSnapshot`과 JSON parser에 두 digest를 추가한다. 두 값이 모두 있고 일치하지 않으면 `approved=True`여도 `await_approval`을 반환한다. 이미 `status:ready`이고 유효한 계약은 이전 호환성을 위해 같은 승인을 다시 요구하지 않는다.

- [x] **Step 4: 기획 상태 전이 테스트 통과 확인**

Run: `.venv/bin/python -m unittest harness.tests.test_project_issue harness.tests.test_scripts -v`

Expected: PASS

- [x] **Step 5: 기획 승인 전이 커밋**

```bash
git add harness/lib/project_issue.py harness/scripts/plan-project-issue.py harness/tests/test_project_issue.py harness/tests/test_scripts.py docs/plans/34-workflow-checkpoint.md
git commit -m "feat: Issue 계약 승인 대상 검증 강화"
```

---

### Task 2: worktree별 단계 체크포인트

**Files:**
- Create: `harness/lib/workflow_checkpoint.py`
- Create: `harness/scripts/manage-workflow-checkpoint.py`
- Test: `harness/tests/test_workflow_checkpoint.py`
- Test: `harness/tests/test_scripts.py`

**Interfaces:**
- Produces: `WorkflowCheckpoint`, `StageCheckpoint`, `load_checkpoint()`, `initialize_checkpoint()`, `begin_stage()`, `complete_stage()`
- Persists: `<git-path>/cf-workflow/checkpoint.json`의 schema version, Issue 번호, 브랜치, 현재 단계, 단계 상태, 시작 HEAD, 완료 HEAD와 완료 근거

- [x] **Step 1: 저장, 중단, 손상, worktree 격리 실패 테스트 작성**

다음 실제 동작을 독립 테스트로 작성한다.

- 초기화하면 `plan` 단계가 `running`으로 시작되고 시작 HEAD가 저장된다.
- 완료 기록 없이 다시 읽으면 같은 단계와 시작 HEAD가 유지된다.
- 완료한 단계의 근거와 완료 HEAD가 저장되고 다음 단계만 시작할 수 있다.
- 잘못된 schema, 단계, 상태와 손상된 JSON은 `CheckpointError`로 거부된다.
- linked worktree 두 곳에 같은 Issue 번호를 기록해도 서로 다른 경로와 내용이 사용된다.
- 갱신 뒤 임시 파일은 남지 않고 완성된 JSON만 읽힌다.

- [x] **Step 2: 체크포인트 테스트의 예상 실패 확인**

Run: `.venv/bin/python -m unittest harness.tests.test_workflow_checkpoint -v`

Expected: `harness.lib.workflow_checkpoint`가 없어 ERROR

- [x] **Step 3: 불변 모델과 원자적 저장 구현**

`WORKFLOW_STAGES = ("plan", "implementation", "verification", "draft_pr")` 순서를 사용한다. 저장 경로는 대상 worktree에서 `git rev-parse --git-path cf-workflow/checkpoint.json`으로 구한다. 같은 디렉터리의 임시 파일에 UTF-8 JSON을 쓰고 `os.replace()`로 교체한다. 필수 필드와 단계 순서를 읽을 때마다 검증한다.

- [x] **Step 4: 체크포인트 관리 CLI 구현**

`manage-workflow-checkpoint.py`에 `init`, `show`, `begin`, `complete` 명령을 둔다. `init`은 현재 브랜치와 HEAD를 읽어 계획 단계를 먼저 기록한다. `begin`은 앞 단계 완료 없이는 다음 단계로 진행하지 않는다. `complete`는 현재 단계의 완료 HEAD와 `--evidence key=value` 값을 저장한다.

- [x] **Step 5: 체크포인트와 CLI 테스트 통과 확인**

Run: `.venv/bin/python -m unittest harness.tests.test_workflow_checkpoint harness.tests.test_scripts -v`

Expected: PASS

- [x] **Step 6: 체크포인트 저장 커밋**

```bash
git add harness/lib/workflow_checkpoint.py harness/scripts/manage-workflow-checkpoint.py harness/tests/test_workflow_checkpoint.py harness/tests/test_scripts.py docs/plans/34-workflow-checkpoint.md
git commit -m "feat: worktree 워크플로우 체크포인트 추가"
```

---

### Task 3: 실제 상태 대조와 Draft PR 전이 차단

**Files:**
- Modify: `harness/lib/workflow_checkpoint.py`
- Create: `harness/lib/issue_delivery.py`
- Modify: `harness/scripts/manage-workflow-checkpoint.py`
- Create: `harness/scripts/plan-issue-delivery.py`
- Modify: `harness/lib/tool_guard.py`
- Modify: `harness/scripts/guard-tool-use.py`
- Test: `harness/tests/test_issue_delivery.py`
- Test: `harness/tests/test_tool_guard.py`
- Test: `harness/tests/test_scripts.py`

**Interfaces:**
- Consumes: 체크포인트와 현재 `branch`, `head`, `plan_exists`, `worktree_clean`, `pull_request_number`, `pull_request_head`
- Produces: `resume_plan`, `resume_implementation`, `resume_verification`, `create_draft_pr`, `record_draft_pr`, `complete` 중 하나인 `DeliveryAction`
- Guards: Issue 브랜치의 `gh pr create`는 같은 브랜치와 현재 HEAD의 완료된 verification 기록이 있을 때만 허용

- [x] **Step 1: 첫 미완료 단계와 상태 불일치 실패 테스트 작성**

다음 분기를 각각 검증한다.

- 실행 중인 단계는 중단 후 같은 단계로 돌아간다.
- 계획 완료 근거의 파일이 없으면 계획 단계로 돌아간다.
- 구현과 검증이 완료됐고 현재 HEAD가 검증 HEAD와 같으면 Draft PR 단계로 간다.
- 검증 뒤 HEAD가 바뀌면 검증 단계로 돌아간다.
- Draft PR 생성 중 실제 PR이 발견되면 다시 만들지 않고 완료 기록 action을 반환한다.
- 체크포인트가 없거나 손상됐거나 Issue, 브랜치가 다르면 진행 action을 반환하지 않는다.

- [x] **Step 2: Draft PR 훅 차단 실패 테스트 작성**

`gh pr create --draft --body-file ...`에 대해 체크포인트 없음, 다른 HEAD, 실행 중 verification은 차단하고 현재 HEAD의 verification 완료는 허용하는 테스트를 작성한다. 일반 테스트 명령과 읽기 명령은 체크포인트가 없어도 허용되는지 함께 확인한다.

- [x] **Step 3: 재개와 훅 테스트의 예상 실패 확인**

Run: `.venv/bin/python -m unittest harness.tests.test_issue_delivery harness.tests.test_tool_guard harness.tests.test_scripts -v`

Expected: delivery planner가 없고 Draft PR 명령이 허용돼 FAIL

- [x] **Step 4: 순수 재개 판정과 JSON CLI 구현**

`next_delivery_action()`은 저장 기록을 관찰값과 대조해 첫 미완료 단계를 반환한다. `plan-issue-delivery.py`는 checkpoint 경로와 snapshot 파일을 받아 JSON action을 출력하며, 체크포인트 부재와 손상은 종료 코드 2로 보고한다.

- [x] **Step 5: 현재 HEAD 검증 기반 Draft PR 훅 구현**

`guard-tool-use.py`는 Issue 브랜치에서 Draft PR 생성 명령을 볼 때만 현재 HEAD와 체크포인트를 읽는다. `tool_guard.evaluate_tool_use()`는 완료된 verification의 완료 HEAD가 현재 HEAD와 같은지 확인하고, 다르면 거부 이유를 반환한다. 다른 도구와 질문은 기존 동작을 유지한다.

- [x] **Step 6: 재개 planner와 훅 테스트 통과 확인**

Run: `.venv/bin/python -m unittest harness.tests.test_issue_delivery harness.tests.test_tool_guard harness.tests.test_scripts -v`

Expected: PASS

- [x] **Step 7: 재개 및 전이 차단 커밋**

```bash
git add harness/lib/issue_delivery.py harness/scripts/plan-issue-delivery.py harness/lib/tool_guard.py harness/scripts/guard-tool-use.py harness/tests/test_issue_delivery.py harness/tests/test_tool_guard.py harness/tests/test_scripts.py docs/plans/34-workflow-checkpoint.md
git commit -m "feat: 검증 기반 Draft PR 전이 차단"
```

---

### Task 4: Skill 실행 계약과 결정 기록

**Files:**
- Modify: `.agents/skills/cf-project-issue-planning/SKILL.md`
- Modify: `.agents/skills/cf-project-issue-planning/evals/evals.json`
- Modify: `.agents/skills/cf-issue-lifecycle/SKILL.md`
- Modify: `.agents/skills/cf-issue-lifecycle/evals/evals.json`
- Modify: `.agents/skills/cf-issue-workflow/SKILL.md`
- Modify: `.agents/skills/cf-issue-workflow/evals/evals.json`
- Create: `docs/adr/34-worktree-workflow-checkpoint.md`
- Modify: `harness/README.md`
- Modify: `docs/design/issue-based-ai-development-harness.md`
- Modify: `docs/plans/34-workflow-checkpoint.md`

**Interfaces:**
- Consumes: 기획 action CLI, 체크포인트 관리 CLI, delivery action CLI와 PreToolUse 결과
- Produces: 게시 후 승인, 단계 시작 전 기록, 실제 상태 대조 재개, 검증 후 Draft PR 생성 순서의 저장소 Skill 계약

- [x] **Step 1: Skill eval에 중단과 재개 시나리오 추가**

다음 행동을 구별하는 eval을 추가한다.

- Issue 본문 게시 뒤 사용자가 승인하기 전에 ready로 전환하지 않는다.
- 승인한 본문과 최신 원격 본문이 다르면 재승인을 기다린다.
- 구현 또는 검증 중 ESC 뒤 같은 worktree에서 재개하면 delivery planner 결과를 따른다.
- 중단 중 다른 질문을 처리해도 체크포인트를 지우거나 질문을 거부하지 않는다.
- 현재 HEAD가 검증 HEAD와 다르면 Draft PR 대신 검증을 다시 수행한다.

- [x] **Step 2: 세 Skill의 실행 순서 갱신**

기획 Skill은 `publish_planning_contract`, `await_approval`, `validate_latest_contract`, `set_ready` 순서를 사용하고 승인 대상 digest를 비교한다. Lifecycle Skill은 `status:ready`의 새 작업에서는 체크포인트를 초기화하고 `status:in-progress` 재개에서는 기존 체크포인트와 실제 상태를 조회한다. Workflow Skill은 각 단계 실행 전에 `begin`, 완료 뒤 근거를 포함한 `complete`를 호출하고 delivery action이 지시한 단계만 실행한다.

- [x] **Step 3: ADR과 하네스 안내 작성**

ADR에는 환경변수, `MEMORY.md`, worktree Git 디렉터리 체크포인트 대안을 비교하고 선택 이유, 같은 worktree만 지원하는 비용, 실제 상태 대조와 단계 단위 복구 경계를 기록한다. `harness/README.md`에는 관리 및 재개 CLI와 손상 시 중단 원칙을 설명한다.

- [x] **Step 4: Skill 구조와 routing eval 검증**

Run: `.venv/bin/python harness/scripts/validate-skills.py`

Run: `.venv/bin/python harness/scripts/validate-skill-routing-evals.py`

Expected: PASS

- [x] **Step 5: 전체 자동 검증**

Run: `.venv/bin/python harness/scripts/verify.py`

Expected: 전체 테스트 PASS, 커버리지 80% 이상

Run: `git diff --check`

Expected: 출력 없음

- [ ] **Step 6: 두 축 코드 리뷰와 수동 검증 상태 기록**

`origin/develop...HEAD`를 저장소 Standards와 Issue #34 Spec으로 나눠 검토한다. macOS에서 자동 검증 결과를 기록하고, WSL/Linux ESC 재개와 GitHub 원격 수정 흐름, 다른 팀원 리뷰는 사람 확인 항목으로 남긴다.

- [x] **Step 7: 문서와 Skill 커밋**

```bash
git add .agents/skills/cf-project-issue-planning .agents/skills/cf-issue-lifecycle .agents/skills/cf-issue-workflow docs/adr/34-worktree-workflow-checkpoint.md docs/adr/README.md harness/README.md docs/plans/34-workflow-checkpoint.md
git commit -m "docs: 재개 가능한 Issue 워크플로우 반영"
```
