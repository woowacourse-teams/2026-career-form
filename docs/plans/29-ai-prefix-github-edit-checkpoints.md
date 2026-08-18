# AI 작업 영역과 GitHub 수동 편집 체크포인트 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use `cf-executing-plans` to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `[AI] 작업명` 제목을 허용하고, Issue 계약과 Draft PR을 GitHub에 게시한 뒤 사용자의 원격 수정 및 재개 요청까지 상태 전이를 멈추는 생명주기를 제공한다.

**Architecture:** `harness.lib.work_title`이 작업 영역 허용 목록을 계속 단일 강제 지점으로 유지한다. `harness.lib.project_issue`는 Issue 계약을 먼저 게시한 뒤 사람 확인과 원격 검증을 기다리고, `harness.lib.issue_lifecycle`은 기존 Draft PR이 있는 구현 상태를 수동 편집 대기와 검토 재개로 구분한다. 저장소 스킬은 상태 기계의 결정을 실제 GitHub 조회, 검증, 라벨 및 Project 상태 전환으로 연결한다.

**Tech Stack:** Python 3.13, `unittest`, GitHub CLI, GitHub Project v2, Markdown, JSON

## Global Constraints

- 작업 영역은 `FE`, `BE`, `AI`, `Infra`, `Harness`, `Plan`을 허용한다.
- `FE`, `BE`, `AI`는 전체를 대문자로 작성한다.
- `AI`는 제품의 LLM, 모델, 프롬프트, 에이전트 기능 작업에 사용한다.
- `Harness`는 개발 하네스와 개발 에이전트 워크플로우 변경에 사용한다.
- Issue 수동 편집 중에는 `status:planning`과 Project `In Progress`를 유지한다.
- Draft PR 수동 편집 중에는 Issue `status:in-progress`와 Project `In Progress`를 유지한다.
- 사용자의 재개 요청 없이 자동으로 다음 상태로 전환하지 않는다.
- 재개할 때 사용자가 수정한 원격 제목과 본문을 덮어쓰지 않는다.
- 새 상태 라벨 또는 Project Status를 만들지 않는다.
- Draft PR의 Ready for review 전환, 최종 승인과 머지는 사람이 수행한다.
- 공유 하네스 변경에는 `harness-change` 라벨과 다른 팀원 리뷰가 필요하다.

---

### Task 1: AI 작업 영역 제목 계약

**Files:**
- Modify: `harness/tests/test_work_title.py`
- Modify: `harness/tests/test_issue_contract.py`
- Modify: `harness/tests/test_pr_contract.py`
- Modify: `harness/lib/work_title.py`

**Interfaces:**
- Consumes: `validate_work_title(title: str) -> ValidationResult`
- Produces: `[AI] 작업명`을 허용하고 `[Ai]`, `[ai]`를 거부하는 Issue 및 PR 공용 제목 계약

- [x] **Step 1: AI 제목 허용과 잘못된 대소문자 거부 테스트 작성**

  `test_work_title.py`의 허용 사례에 `[AI] LLM 필드 매핑`을 추가하고 거부 사례에 `[Ai] LLM 필드 매핑`, `[ai] LLM 필드 매핑`을 추가한다. 알 수 없는 영역의 오류 기대값은 `영역은 FE, BE, AI, Infra, Harness, Plan 중 하나여야 합니다`로 변경한다.

- [x] **Step 2: Issue와 PR 통합 계약 테스트 작성**

  `test_issue_contract.py`에 `status:ready`인 `[AI] LLM 필드 매핑` Issue가 유효한 사례를 추가한다. `test_pr_contract.py`에 `CF-123`에서 같은 제목의 `[AI] LLM 필드 매핑` PR이 유효한 사례를 추가한다.

- [x] **Step 3: RED 확인**

  Run:

  ```bash
  .venv/bin/python -m unittest \
    harness.tests.test_work_title \
    harness.tests.test_issue_contract \
    harness.tests.test_pr_contract
  ```

  Expected: `[AI]`가 지원 영역이 아니어서 새 허용 테스트가 FAIL.

- [x] **Step 4: 최소 제목 검증 구현**

  `harness/lib/work_title.py`의 허용 목록과 오류 안내를 다음 계약으로 변경한다.

  ```python
  ALLOWED_AREAS = frozenset(("FE", "BE", "AI", "Infra", "Harness", "Plan"))
  ```

- [x] **Step 5: GREEN 확인과 커밋**

  Step 3의 명령을 다시 실행해 통과한 뒤 다음 커밋을 만든다.

  ```text
  feat: AI 작업 영역 prefix 허용
  ```

### Task 2: Issue 계약 수동 편집 체크포인트

**Files:**
- Modify: `harness/tests/test_project_issue.py`
- Modify: `harness/tests/test_scripts.py`
- Modify: `harness/lib/project_issue.py`
- Modify: `harness/scripts/plan-project-issue.py`

**Interfaces:**
- Consumes: `ProjectIssueSnapshot`, `next_planning_action(snapshot)`
- Produces: `publish_contract -> await_approval -> validate_contract -> set_ready` 상태 순서

- [x] **Step 1: 게시 우선 순서의 실패 테스트 작성**

  `contract_drafted=True`, `plan_exists=True`, `approved=False`, `contract_published=False`인 snapshot이 `publish_contract`를 반환하는 테스트를 작성한다. 게시 뒤 `approved=False`이면 `await_approval`, 재개 뒤 `approved=True`지만 `contract_valid=False`이면 `validate_contract`, 검증 뒤 `contract_valid=True`이면 `set_ready`를 반환하는 테스트를 각각 작성한다.

- [x] **Step 2: CLI boolean 경계 테스트 작성**

  `test_scripts.py`에서 `contract_valid`에 문자열을 전달하면 `contract_valid는 boolean이어야 합니다`와 exit 2를 반환하는 사례를 추가한다. JSON boolean을 전달한 정상 snapshot은 새 상태 순서의 action을 반환해야 한다.

- [x] **Step 3: RED 확인**

  Run:

  ```bash
  .venv/bin/python -m unittest \
    harness.tests.test_project_issue \
    harness.tests.test_scripts.HarnessScriptsTest.test_project_issue_script_rejects_string_booleans
  ```

  Expected: 기존 상태 기계가 게시 전에 `await_approval`을 반환하고 `contract_valid`를 해석하지 않아 FAIL.

- [x] **Step 4: 최소 상태 기계 구현**

  `ProjectIssueSnapshot`에 `contract_valid: bool = False`를 추가한다. `PLANNING_ACTIONS`에 `validate_contract`를 추가하고, 기획 action 순서를 다음과 같이 바꾼다.

  ```text
  draft_contract
  write_plan
  publish_contract
  await_approval
  validate_contract
  set_ready
  complete
  ```

  `plan-project-issue.py`는 `contract_valid`를 기존 boolean 경계 함수로 읽는다.

- [x] **Step 5: GREEN 확인**

  Step 3의 명령과 `harness.tests.test_project_issue` 전체를 실행해 통과한다.

### Task 3: Draft PR 수동 편집 체크포인트

**Files:**
- Modify: `harness/tests/test_issue_lifecycle.py`
- Modify: `harness/tests/test_scripts.py`
- Modify: `harness/lib/issue_lifecycle.py`

**Interfaces:**
- Consumes: `LifecycleSnapshot`, `lifecycle_snapshot_from(payload)`, `next_lifecycle_action(snapshot)`
- Produces: 기존 Draft PR이 있는 `status:in-progress` 상태의 `await_pr_edit` 및 `review_draft_pr` action

- [x] **Step 1: Draft PR 편집 대기 테스트 작성**

  `issue_status="status:in-progress"`, `pull_request_state="OPEN"`, `pull_request_is_draft=True`, `pr_edit_confirmed=False`인 snapshot이 skill 없이 `await_pr_edit`를 반환하는 테스트를 작성한다.

- [x] **Step 2: 사용자 재개 후 검토 action 테스트 작성**

  같은 snapshot에서 `pr_edit_confirmed=True`이면 `review_draft_pr`와 `cf-issue-workflow`를 반환하는 테스트를 작성한다. PR이 없는 `status:in-progress`는 기존 `deliver_issue`를 유지하고, `status:review`인 열린 PR은 기존 `await_merge`를 유지한다.

- [x] **Step 3: CLI 입력 검증 테스트 작성**

  `pull_request_is_draft`와 `pr_edit_confirmed`가 문자열이면 `boolean이어야 합니다`와 exit 2를 반환하는 사례를 추가한다. 유효한 Draft PR 대기 snapshot은 `await_pr_edit`, 재개 snapshot은 `review_draft_pr` JSON을 반환해야 한다.

- [x] **Step 4: RED 확인**

  Run:

  ```bash
  .venv/bin/python -m unittest \
    harness.tests.test_issue_lifecycle \
    harness.tests.test_scripts.HarnessScriptsTest.test_issue_lifecycle_script_selects_ready_issue_delivery
  ```

  Expected: 기존 snapshot이 Draft 여부와 사용자 재개 신호를 받지 않아 FAIL.

- [x] **Step 5: 최소 생명주기 구현**

  `LifecycleSnapshot`에 다음 필드를 추가하고 `lifecycle_snapshot_from`에서 실제 JSON boolean만 허용한다.

  ```python
  pull_request_is_draft: bool = False
  pr_edit_confirmed: bool = False
  ```

  `status:in-progress`이고 열린 Draft PR이 있으면 확인 전에는 `await_pr_edit`, 확인 뒤에는 `review_draft_pr`을 반환한다. 두 action 모두 PR 생성과 구분되며 `review_draft_pr`만 `cf-issue-workflow`를 호출한다.

- [x] **Step 6: GREEN 확인과 커밋**

  Task 2와 Task 3 관련 테스트 전체를 실행해 통과한 뒤 다음 커밋을 만든다.

  ```text
  feat: GitHub 수동 편집 체크포인트 추가
  ```

### Task 4: 스킬, 정책과 ADR 동기화

**Files:**
- Modify: `.agents/skills/cf-project-issue-planning/SKILL.md`
- Modify: `.agents/skills/cf-project-issue-planning/evals/evals.json`
- Modify: `.agents/skills/cf-issue-workflow/SKILL.md`
- Modify: `.agents/skills/cf-issue-workflow/evals/evals.json`
- Modify: `.agents/skills/cf-issue-lifecycle/SKILL.md`
- Modify: `.agents/skills/cf-issue-lifecycle/evals/evals.json`
- Modify: `harness/policies/issue-contract.md`
- Modify: `harness/policies/workflow.md`
- Modify: `harness/policies/approval-matrix.md`
- Modify: `harness/README.md`
- Modify: `docs/conventions/commit.md`
- Modify: `docs/agents/issue-tracker.md`
- Modify: `docs/design/issue-based-ai-development-harness.md`
- Modify: `docs/adr/14-shared-harness-lifecycle.md`
- Create: `docs/adr/29-ai-work-title-area.md`
- Create: `docs/adr/29-github-edit-checkpoints.md`

**Interfaces:**
- Consumes: Task 1부터 Task 3까지의 제목 및 상태 action
- Produces: AI 영역과 두 GitHub 편집 체크포인트를 같은 의미로 실행하는 저장소 정책과 스킬

- [x] **Step 1: 기획 스킬의 Issue 체크포인트 변경**

  기획 스킬은 계약과 계획을 렌더링해 GitHub Issue에 게시하고 `status:planning`에서 중단한다. 재개 시 원격 제목과 본문을 다시 읽어 검증하며, 오류가 있으면 사용자 변경을 덮어쓰지 않고 planning 상태에서 보고하고, 통과하면 `status:ready`로 전환한다.

- [x] **Step 2: 구현 스킬의 PR 체크포인트 변경**

  구현 스킬은 Draft PR을 하나 만든 뒤 Issue `status:in-progress`와 Project `In Progress`를 유지하고 중단한다. 재개 시 기존 Draft PR을 다시 읽어 중복 생성을 피하고, 제목과 본문 검증이 통과한 경우에만 Issue `status:review`와 Project `On Review`로 전환한다.

- [x] **Step 3: 생명주기와 대표 eval 변경**

  생명주기 스킬은 `await_pr_edit`와 `review_draft_pr` action을 설명한다. 기획 및 구현 eval에는 GitHub 게시 직후 중단, 사용자 재개 후 원격 정본 검증, 중복 생성 방지 사례를 추가한다. 산문 문구 자체를 고정하는 테스트는 만들지 않는다.

- [x] **Step 4: 현행 정책과 컨벤션 동기화**

  현행 문서의 영역 목록에 `AI`를 추가하고 의미 경계를 기록한다. workflow, approval matrix, README와 issue tracker는 Issue 및 PR 게시 뒤 수동 편집 대기 상태와 재개 후 검증 순서를 같은 의미로 설명한다. 완료된 과거 구현 계획의 역사적 목록은 일괄 수정하지 않는다.

- [x] **Step 5: 두 ADR 작성**

  `docs/adr/29-ai-work-title-area.md`에는 단일 `[AI]` 영역, 대문자 표기, 제품 AI와 Harness 경계를 기록한다. `docs/adr/29-github-edit-checkpoints.md`에는 GitHub 게시 우선, 사용자 재개 신호, planning 및 in-progress 상태 유지, 원격 정본 재검증, 중복 원격 쓰기 금지를 기록한다. `docs/adr/14-shared-harness-lifecycle.md`는 관련 Issue #29와 새 결정으로 확장됐음을 표시한다.

- [x] **Step 6: 문서와 스킬 검증 및 커밋**

  Run:

  ```bash
  .venv/bin/python harness/scripts/validate-skills.py
  .venv/bin/python harness/scripts/validate-skill-routing-evals.py
  git diff --check
  ```

  Expected: 모든 명령 exit 0.

  Commit:

  ```text
  docs: AI 영역과 수동 편집 생명주기 문서화
  ```

### Task 5: 전체 검증, 두 축 리뷰와 Draft PR 체크포인트

**Files:**
- Verify: repository 전체 diff
- Verify: Issue #29 원격 계약
- Verify: `CF-29` 커밋 이력

**Interfaces:**
- Consumes: Task 1부터 Task 4까지의 구현과 문서
- Produces: 검증된 `CF-29` 브랜치와 사용자가 직접 수정할 Draft PR 하나

- [ ] **Step 1: 관련 테스트와 전체 검증**

  Run:

  ```bash
  .venv/bin/python -m unittest \
    harness.tests.test_work_title \
    harness.tests.test_issue_contract \
    harness.tests.test_pr_contract \
    harness.tests.test_project_issue \
    harness.tests.test_issue_lifecycle \
    harness.tests.test_scripts
  .venv/bin/python harness/scripts/verify.py
  git diff --check
  ```

  Expected: 0 failures, 전체 커버리지 80% 이상, 모든 명령 exit 0.

- [ ] **Step 2: Standards와 Issue Spec 두 축 리뷰**

  `origin/develop...HEAD`를 저장소 Standards와 Issue #29 계약 기준으로 각각 검토한다. 치명적 문제와 높은 위험 문제를 수정한 뒤 전체 검증을 다시 실행한다.

- [ ] **Step 3: 브랜치 push와 Draft PR 생성**

  `CF-29`만 push하고 Issue와 같은 `[Harness] AI 작업 영역과 GitHub 수동 편집 체크포인트 추가` 제목으로 Draft PR 하나를 만든다. PR 본문은 템플릿 렌더러를 사용하고 `Closes #29`를 정확히 하나 포함한다.

- [ ] **Step 4: 사용자 편집 체크포인트에서 중단**

  Draft PR이 원격에 하나만 존재하는지 확인한 뒤 Issue `status:in-progress`와 Project `In Progress`를 유지한다. `status:review` 또는 Project `On Review`로 전환하지 않고 사용자가 GitHub에서 PR을 수정한 뒤 재개를 요청할 때까지 중단한다.
