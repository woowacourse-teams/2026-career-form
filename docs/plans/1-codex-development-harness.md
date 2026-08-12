# Codex Development Harness Implementation Plan

> **For agentic workers:** `test-driven-development`로 각 행동의 실패를 먼저 확인하고, 커밋 단위마다 관련 테스트를 통과시킨다. 완료 전 `verification-before-completion`과 `code-review`를 적용한다.

**Goal:** GitHub Project draft에서 시작해 하나의 Issue, `CF-<Issue 번호>` 브랜치, 하나의 PR로 끝나는 Codex 개발 하네스를 제공한다.

**Architecture:** Issue 본문은 범위와 완료 기준의 정본이고 이 문서는 같은 Issue 안의 논리적 커밋 단위를 기록한다. Python의 순수 검증 모듈이 제목, 브랜치, 상태와 Project 접근 결과를 판정하고, 프로젝트 스킬이 `gh`를 사용한 원격 변경 순서와 사람 승인 경계를 연결한다.

**Tech Stack:** Python `unittest`, PyYAML, GitHub CLI, GitHub Actions, GitHub Projects V2, Markdown

## Global Constraints

- 작업 Issue는 #1 하나이며 기능 PR도 하나만 만든다.
- Sub-issue를 생성하거나 Parent 관계를 요구하지 않는다.
- 작업 브랜치는 `CF-1`이다.
- Issue와 PR 제목은 `[Harness] Codex 개발 하네스 구축`이다.
- 개별 커밋은 Conventional Commit type을 유지하고 설명 끝에 `한다`를 사용하지 않는다.
- PR 제목에는 Conventional Commit type을 붙이지 않는다.
- PR 최종 승인, Squash Merge와 최종 커밋 제목 입력은 사람이 수행한다.
- AI는 파일 삭제, 시크릿 조회와 삭제, 배포와 마이그레이션을 수행하지 않는다.
- 스킬 eval 결과는 정적 HTML로 만들지 않고 저장된 eval 산출물과 대화 요약으로 검토한다.

---

### Task 1: 단일 Issue 작업 계약과 네이밍 규칙

**Commit:** `feat: 단일 Issue 작업 계약 도입`

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/conventions/branching.md`
- Modify: `docs/conventions/commit.md`
- Modify: `docs/design/issue-based-ai-development-harness.md`
- Modify: `harness/policies/issue-contract.md`
- Modify: `harness/policies/workflow.md`
- Modify: `harness/policies/environments.md`
- Modify: `harness/policies/github-ruleset.md`
- Modify: `harness/lib/branching.py`
- Modify: `harness/lib/commit_message.py`
- Create: `harness/lib/work_title.py`
- Modify: `harness/lib/issue_contract.py`
- Modify: `harness/lib/pr_contract.py`
- Modify: `harness/tests/test_branching.py`
- Modify: `harness/tests/test_commit_message.py`
- Modify: `harness/tests/test_issue_contract.py`
- Modify: `harness/tests/test_pr_contract.py`
- Modify: `harness/tests/test_scripts.py`
- Modify: `harness/tests/test_tool_guard.py`

**Interfaces:**
- `issue_number_from_branch("CF-1") -> "1"`
- `validate_work_title("[Harness] Codex 개발 하네스 구축") -> ValidationResult`
- `validate_commit_message("feat: GitHub Project 접근 진단 추가") -> ValidationResult`

- [x] **Step 1: 새 브랜치와 제목 계약의 실패 테스트 작성**

  `CF-123`에서 `develop`으로 병합할 수 있고, `main` 직접 병합과 `feature/123-slug`는 거부되는 테스트를 작성한다. `develop`에서 `main`으로 보내는 배포 PR은 허용한다. Issue와 PR 제목은 `[FE]`, `[BE]`, `[Infra]`, `[Harness]` 영역을 허용하고 Conventional Commit prefix와 `한다` 종결을 거부한다.

- [x] **Step 2: RED 확인**

  Run: `.venv/bin/python -m unittest harness.tests.test_branching harness.tests.test_commit_message harness.tests.test_issue_contract harness.tests.test_pr_contract -v`

  Expected: 기존 `feature/*`, Conventional PR 제목과 서술형 커밋 설명을 허용하므로 새 테스트가 FAIL.

- [x] **Step 3: 최소 계약 구현**

  `WORK_BRANCH_PATTERN = re.compile(r"^CF-(?P<issue>[1-9][0-9]*)$")`로 교체한다. 공용 제목 검증 함수는 확정된 네 영역 prefix와 한글 작업명을 요구한다. 커밋 검증은 type을 유지하고 설명이 `한다`로 끝나면 오류를 반환한다.

- [x] **Step 4: 정책 문서 동기화**

  하나의 Issue, 하나의 PR, 별도 draft 분리 기준, `CF-<Issue 번호>`, 개별 커밋과 PR 제목의 차이를 문서화한다. Parent와 Sub-issue 흐름을 제거한다.

- [x] **Step 5: GREEN 확인과 커밋**

  Run: `.venv/bin/python -m unittest harness.tests.test_branching harness.tests.test_commit_message harness.tests.test_issue_contract harness.tests.test_pr_contract -v`

  Commit: `feat: 단일 Issue 작업 계약 도입`

### Task 2: PR 리뷰 템플릿과 계약

**Commit:** `feat: PR 리뷰 템플릿 개편`

**Files:**
- Modify: `.github/pull_request_template.md`
- Modify: `harness/lib/pr_contract.py`
- Modify: `harness/tests/test_pr_contract.py`
- Modify: `harness/tests/test_repository_contract.py`

**Interfaces:**
- `REQUIRED_SECTIONS`는 회의에서 확정한 여덟 개 제목을 순서와 무관하게 검증한다.
- PR 본문은 `Closes #<Issue 번호>`를 계속 요구한다.

- [x] **Step 1: 여덟 섹션 계약 테스트 작성**

  다음 섹션 중 하나가 없거나 비어 있으면 실패하고 모두 채워지면 통과하도록 테스트한다.

  ```text
  해결하려는 문제가 무엇인가요?
  왜 해야 하나요?
  어떻게 해결했나요?
  이 PR의 한계 & 트레이드오프
  기존 기능에 미치는 영향
  Edge Case & 실패 시나리오
  검토한 대안과 선택 이유
  리뷰 포인트 (파일/영역별 Risk 🔴🟡🟢)
  ```

- [x] **Step 2: RED 확인**

  Run: `.venv/bin/python -m unittest harness.tests.test_pr_contract harness.tests.test_repository_contract -v`

  Expected: 기존 여섯 섹션을 요구하므로 FAIL.

- [x] **Step 3: 템플릿과 검증기 교체**

  각 섹션에 작성 안내와 예시 체크리스트를 제공하고 마지막에 `Closes #`를 둔다. Markdown 산문 문구는 검사하지 않고 파서가 소비하는 섹션 존재와 비어 있지 않은 값만 검증한다.

- [x] **Step 4: GREEN 확인과 커밋**

  Run: `.venv/bin/python -m unittest harness.tests.test_pr_contract harness.tests.test_repository_contract -v`

  Commit: `feat: PR 리뷰 템플릿 개편`

### Task 3: GitHub Project 접근 진단

**Commit:** `feat: GitHub Project 접근 진단 추가`

**Files:**
- Create: `harness/project.json`
- Create: `harness/lib/project_config.py`
- Create: `harness/lib/project_access.py`
- Create: `harness/scripts/diagnose-project-access`
- Create: `harness/tests/test_project_config.py`
- Create: `harness/tests/test_project_access.py`
- Create: `.agents/skills/github-project-onboarding/SKILL.md`
- Create: `.agents/skills/github-project-onboarding/evals/evals.json`
- Modify: `harness/README.md`
- Modify: `harness/lib/skill_inventory.py`
- Modify: `harness/tests/test_skill_inventory.py`

**Interfaces:**
- `load_project_config(path) -> ProjectConfig`
- `diagnose_project_access(gh_available, auth_exit_code, project_exit_code, project_error) -> AccessDiagnosis`
- 진단 code: `gh_missing`, `unauthenticated`, `project_scope_missing`, `project_unavailable`, `ready`

- [x] **Step 1: 설정과 진단 분기 테스트 작성**

  Project `149`, owner `woowacourse-teams`, repository `2026-career-form`을 파싱한다. `gh` 미설치, 미로그인, project scope 누락, 조직 접근 실패와 성공을 서로 다른 결과로 판정한다.

- [x] **Step 2: RED 확인**

  Run: `.venv/bin/python -m unittest harness.tests.test_project_config harness.tests.test_project_access -v`

  Expected: 모듈이 없어 ERROR.

- [x] **Step 3: 진단 모듈과 CLI 구현**

  CLI는 `gh auth status`와 `gh project view`의 종료 코드만 분류하고 토큰이나 원문 인증 출력을 반환하지 않는다. scope 누락 결과에는 `gh auth refresh -s project`만 해결 명령으로 제공한다.

- [x] **Step 4: 온보딩 스킬과 eval 추가**

  스킬은 로컬 설치 진단과 온라인 접근 진단을 분리하고 사용자 인증이 끝나기 전에 원격 변경을 수행하지 않는다. eval은 권한 누락, 조직 접근 실패와 성공 프롬프트를 포함한다.

- [x] **Step 5: GREEN 확인과 커밋**

  Run: `.venv/bin/python -m unittest harness.tests.test_project_config harness.tests.test_project_access -v`

  Commit: `feat: GitHub Project 접근 진단 추가`

### Task 4: Project Issue 기획 흐름

**Commit:** `feat: Project Issue 기획 흐름 추가`

**Files:**
- Create: `harness/lib/project_issue.py`
- Create: `harness/scripts/plan-project-issue`
- Create: `harness/tests/test_project_issue.py`
- Create: `.agents/skills/project-issue-planning/SKILL.md`
- Create: `.agents/skills/project-issue-planning/evals/evals.json`
- Modify: `harness/README.md`
- Modify: `harness/lib/skill_inventory.py`
- Modify: `harness/tests/test_skill_inventory.py`

**Interfaces:**
- `next_planning_action(snapshot: ProjectIssueSnapshot) -> PlanningAction`
- action: `await_draft`, `select_draft`, `fix_title`, `promote_draft`, `set_planning`, `set_in_progress`, `draft_contract`, `write_plan`, `await_approval`, `publish_contract`, `set_ready`, `complete`

- [x] **Step 1: 재실행 가능한 상태 전이 테스트 작성**

  사람이 만든 draft 없음, 같은 제목 여러 개, 제목 계약 위반, 단일 draft, 이미 승격된 Issue, In Progress 변경 실패 뒤 재실행, 계약과 계획 작성 완료를 각각 검증한다. 어떤 분기에서도 draft나 Sub-issue 생성 action은 반환하지 않는다.

- [x] **Step 2: RED 확인**

  Run: `.venv/bin/python -m unittest harness.tests.test_project_issue -v`

  Expected: 모듈이 없어 ERROR.

- [x] **Step 3: 순수 상태 전이와 CLI 구현**

  `ProjectIssueSnapshot`은 draft 일치 수, Issue 번호, 제목 계약 충족 여부, Issue 상태 라벨, Project Status, 계약 초안, 계획 파일, 승인과 원격 게시 여부를 보유한다. 이미 Issue 번호가 있으면 다시 승격하지 않고 다음 미완료 action을 반환한다. CLI는 외부 JSON의 boolean 타입을 엄격하게 검증한다.

- [x] **Step 4: 기획 스킬 작성**

  스킬은 접근 진단, 사람이 만든 대상 식별, 제목 보정, Issue 승격, In Progress 전환, Issue 계약과 구현 계획 전문 제안, 사람 승인, 원격 게시 순서로 동작한다. AI는 draft를 만들지 않고 큰 FE, BE, Infra 영역은 사람이 만들 별도 draft 후보로만 제안하며 현재 Issue의 Sub-issue로 연결하지 않는다.

- [x] **Step 5: GREEN 확인과 커밋**

  Run: `.venv/bin/python -m unittest harness.tests.test_project_issue -v`

  Commit: `feat: Project Issue 기획 흐름 추가`

### Task 4A: 사람 작성 draft의 제목 보정

**Commit:** `fix: 사람이 만든 Draft 제목 보정`

**Files:**
- Modify: `harness/lib/project_issue.py`
- Modify: `harness/scripts/plan-project-issue`
- Modify: `harness/tests/test_project_issue.py`
- Modify: `.agents/skills/project-issue-planning/SKILL.md`
- Modify: `.agents/skills/project-issue-planning/evals/evals.json`
- Modify: `.agents/skills/issue-workflow/SKILL.md`
- Modify: `harness/policies/workflow.md`
- Modify: `harness/README.md`
- Modify: `docs/agents/issue-tracker.md`

- [x] 사람이 만든 draft가 없으면 `await_draft`에서 멈추고 AI 생성 action을 노출하지 않는다.
- [x] draft 또는 승격된 Issue 제목이 계약을 어기면 `fix_title`을 먼저 반환한다.
- [x] 영역이 명확하면 `[영역] 작업명`으로 보정하고, 모호하면 사용자 확인을 받도록 스킬을 수정한다.
- [x] 관련 테스트와 스킬 구조 검증을 통과시킨다.

### Task 5: Issue 작업 흐름 개편

**Commit:** `feat: Issue 작업 흐름 개편`

**Files:**
- Create: `harness/lib/project_status.py`
- Create: `harness/tests/test_project_status.py`
- Create: `docs/agents/issue-tracker.md`
- Modify: `.agents/skills/issue-workflow/SKILL.md`
- Modify: `.agents/skills/issue-workflow/agents/openai.yaml`
- Create: `.agents/skills/issue-workflow/evals/evals.json`
- Modify: `harness/policies/workflow.md`
- Modify: `harness/README.md`
- Modify: `harness/lib/pr_contract.py`
- Modify: `harness/tests/test_pr_contract.py`
- Modify: `docs/conventions/branching.md`

**Interfaces:**
- `project_status_for_label("status:in-progress") -> "In Progress"`
- `project_status_for_label("status:review") -> "On Review"`

- [x] **Step 1: 상태 매핑과 단일 PR 테스트 작성**

  planning, ready, in-progress와 blocked는 In Progress, review는 On Review로 매핑한다. `CF-<Issue 번호>` 브랜치가 GitHub 종료 키워드 전체를 기준으로 같은 번호의 Issue 하나만 종료하는 PR과 연결되는 계약을 검증한다.

- [x] **Step 2: RED 확인**

  Run: `.venv/bin/python -m unittest harness.tests.test_project_status harness.tests.test_pr_contract -v`

  Expected: 상태 모듈이 없어 ERROR.

- [x] **Step 3: issue-workflow 수정**

  ready Issue 하나를 읽고 `CF-<번호>` 워크트리에서 구현한다. 시작 시 Issue `status:in-progress`와 Project `In Progress`, Draft PR 생성 시 `status:review`와 `On Review`를 함께 적용한다. 범위 밖 작업은 독립 draft 후보로 제안한다.

- [x] **Step 4: GitHub Issue tracker 문서와 eval 추가**

  Issue 본문을 spec 정본으로 읽고 현재 Issue 하나만 종료하는 방법을 문서화한다. Parent와 Sub-issue 요구를 거부하는 eval을 포함한다.

- [x] **Step 5: GREEN 확인과 커밋**

  Run: `.venv/bin/python -m unittest harness.tests.test_project_status harness.tests.test_pr_contract -v`

  Commit: `feat: Issue 작업 흐름 개편`

### Task 6: Jira 연동 제거

**Commit:** `chore: Jira 연동 제거`

**Files:**
- Modify: `.github/ISSUE_TEMPLATE/feature.yml`
- Modify: `harness/policies/github-setup.md`
- Modify: `harness/tests/test_repository_contract.py`
- Delete by human: `.github/workflows/create-jira-issue.yml`
- Delete by human: `scripts/jira_issue_payload.mjs`
- Delete by human: `scripts/jira_issue_payload.test.mjs`
- Delete by human: `docs/design/5-jira-localized-issue-types.md`
- Delete by human: `docs/plans/5-jira-issue-autocreate.md`
- Delete by human: `docs/plans/5-jira-localized-issue-types.md`

**Interfaces:**
- Feature Form은 Jira 입력을 노출하지 않는다.
- 활성 workflow와 runtime 경로에는 Jira 호출이 없다.

- [x] **Step 1: Jira 입력과 runtime 부재 테스트 작성**

  Feature Form의 machine-consumed id 집합에 `jira_issue_type`이 없어야 하고 알려진 Jira runtime 경로가 없어야 한다.

- [x] **Step 2: RED 확인**

  Run: `.venv/bin/python -m unittest harness.tests.test_repository_contract.RepositoryContractTest.test_feature_form_has_no_jira_specific_input harness.tests.test_repository_contract.RepositoryContractTest.test_jira_runtime_files_are_absent -v`

  Expected: 입력과 세 runtime 파일이 존재하므로 FAIL.

- [x] **Step 3: 삭제가 아닌 수정 범위 구현**

  Feature Form dropdown과 GitHub 초기 설정의 Jira 안내를 제거한다.

- [x] **Step 4: 사람 파일 삭제 게이트**

  사용자가 위 여섯 파일을 삭제한 뒤 `git status --short`로 정확한 삭제 범위를 확인한다.

- [x] **Step 5: GREEN 확인과 커밋**

  Run: `.venv/bin/python -m unittest harness.tests.test_repository_contract -v`

  Commit: `chore: Jira 연동 제거`
