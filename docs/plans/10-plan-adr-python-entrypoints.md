# PLAN 및 ADR 워크플로우와 Python 진입점 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task by task. Steps use checkbox syntax for tracking.

**Goal:** `[PLAN]` 작업 영역, 제품 기준 문서 라우팅, ADR 자산화 흐름과 `.py`가 명시된 Python 하네스 진입점을 한 Issue와 한 PR로 제공한다.

**Architecture:** 제목 영역은 `harness.lib.work_title`의 단일 허용 목록을 Issue와 PR 검증기가 공유한다. 기획 정책은 `AGENTS.md`, 프로젝트 스킬과 `docs/adr/` 규약으로 연결하고 대표 eval로 행동을 검토한다. Python 진입점은 기존 이름에 `.py`만 추가하고 모든 호출 경로를 함께 바꾼다.

**Tech Stack:** Python 3.13, unittest, GitHub Actions, Codex hooks, Git hooks, Markdown skill eval

## 전역 제약

- Issue #10의 승인된 본문을 범위와 완료 기준의 정본으로 사용한다.
- 실제 지원 정보, 계정 정보와 브라우저 상태를 기록하지 않는다.
- 모든 Python 진입점은 기존 basename을 유지하고 `.py`만 추가한다.
- 외부 스킬 원문은 변경하지 않는다.
- 변경 전 실패 테스트를 확인하고 전체 커버리지 80% 이상을 유지한다.
- PR 최종 승인과 머지는 사람이 수행한다.

---

### Task 1: PLAN 제목 영역 계약

**Files:**
- Modify: `harness/tests/test_work_title.py`
- Modify: `harness/tests/test_issue_contract.py`
- Modify: `harness/tests/test_pr_contract.py`
- Modify: `harness/tests/test_scripts.py`
- Modify: `harness/lib/work_title.py`
- Modify: `harness/policies/issue-contract.md`
- Modify: `harness/policies/workflow.md`
- Modify: `docs/conventions/commit.md`
- Modify: `docs/agents/issue-tracker.md`
- Modify: `docs/design/issue-based-ai-development-harness.md`

**Interfaces:**
- Consumes: `validate_work_title(title: str) -> ValidationResult`
- Produces: `PLAN`을 포함한 공용 작업 영역 검증

- [x] `[PLAN]` 제목의 직접 검증, Issue 계약, PR 계약과 CLI 실패 테스트를 추가한다.
- [x] 관련 unittest를 실행해 `PLAN` 미지원으로 실패하는지 확인한다.
- [x] `ALLOWED_AREAS`와 오류 메시지에 `PLAN`을 추가한다.
- [x] 관련 unittest를 다시 실행해 기존 영역과 알 수 없는 영역의 동작까지 통과하는지 확인한다.
- [x] 현재 정책과 컨벤션 문서의 작업 영역 목록을 갱신한다.

### Task 2: 제품 기준 문서 라우팅

**Files:**
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: `docs/PRODUCT_CONCEPT.md`, `docs/PROFILE_FIELDS.md`
- Produces: 프로젝트 작업 전 제품 기준을 찾는 저장소 지침

- [x] 기획, 설계, 구현과 검토 전에 두 기준 문서를 필요한 범위에서 읽는 규칙을 추가한다.
- [x] 두 제품 문서 본문이 변경되지 않았는지 diff로 확인한다.

### Task 3: ADR 자산화 흐름

**Files:**
- Create: `docs/adr/README.md`
- Create: `docs/adr/10-plan-and-adr-workflow.md`
- Create: `docs/adr/10-python-entrypoint-extensions.md`
- Modify: `.agents/skills/project-issue-planning/SKILL.md`
- Modify: `.agents/skills/project-issue-planning/evals/evals.json`
- Modify: `.agents/skills/issue-workflow/SKILL.md`
- Modify: `.agents/skills/issue-workflow/evals/evals.json`
- Modify: `harness/README.md`

**Interfaces:**
- Consumes: 승인 전 Issue 계약, 승인된 `[PLAN]` Issue와 `CF-*` 브랜치
- Produces: 장기 결정 판정, ADR 전문 사전 검토, 승인 후 `docs/adr/<issue>-<slug>.md` 작성 흐름

- [x] 대표 eval에 일반 기획 작업과 장기 결정이 있는 기획 작업을 구분하는 기대 행동을 추가한다.
- [x] 승인 전 ADR 파일을 만들지 않고 전문을 Issue 계약과 함께 제안하는 기대 행동을 추가한다.
- [x] 승인된 `[PLAN]` Issue가 ADR을 같은 PR에 반영하는 기대 행동을 추가한다.
- [x] ADR 규약에 상태, 날짜, 관련 Issue, 배경, 대안, 결정과 결과를 정의한다.
- [x] Issue #10의 PLAN 및 ADR 흐름 결정을 첫 ADR로 작성한다.
- [x] Issue #10의 Python 진입점 확장자 결정을 별도 ADR로 작성한다.
- [x] `project-issue-planning`과 `issue-workflow`를 규약과 eval에 맞게 갱신한다.
- [x] `validate-skills`와 JSON 파싱으로 스킬 형식과 eval 문법을 확인한다.

### Task 4: Python 하네스 진입점 확장자

**Files:**
- Rename: `harness/scripts/bootstrap` to `harness/scripts/bootstrap.py`
- Rename: `harness/scripts/diagnose-project-access` to `harness/scripts/diagnose-project-access.py`
- Rename: `harness/scripts/doctor` to `harness/scripts/doctor.py`
- Rename: `harness/scripts/ensure-environment` to `harness/scripts/ensure-environment.py`
- Rename: `harness/scripts/guard-tool-use` to `harness/scripts/guard-tool-use.py`
- Rename: `harness/scripts/plan-project-issue` to `harness/scripts/plan-project-issue.py`
- Rename: `harness/scripts/validate-branch` to `harness/scripts/validate-branch.py`
- Rename: `harness/scripts/validate-commit-message` to `harness/scripts/validate-commit-message.py`
- Rename: `harness/scripts/validate-execpolicy` to `harness/scripts/validate-execpolicy.py`
- Rename: `harness/scripts/validate-issue` to `harness/scripts/validate-issue.py`
- Rename: `harness/scripts/validate-pr` to `harness/scripts/validate-pr.py`
- Rename: `harness/scripts/validate-shared-files` to `harness/scripts/validate-shared-files.py`
- Rename: `harness/scripts/validate-shell-syntax` to `harness/scripts/validate-shell-syntax.py`
- Rename: `harness/scripts/validate-skills` to `harness/scripts/validate-skills.py`
- Rename: `harness/scripts/verify` to `harness/scripts/verify.py`
- Modify: `harness/tests/test_repository_contract.py`
- Modify: `harness/tests/test_environment_setup.py`
- Modify: `harness/tests/test_scripts.py`
- Modify: `harness/lib/environment_setup.py`
- Modify: `.github/workflows/*.yml`
- Modify: `.codex/hooks.json`
- Modify: `.githooks/commit-msg`
- Modify: `.githooks/pre-push`
- Modify: repository Markdown references returned by `rg "harness/scripts/"`

**Interfaces:**
- Consumes: 기존 executable Python entrypoints
- Produces: 같은 동작과 실행 권한을 유지하는 `harness/scripts/*.py` entrypoints

- [x] Python shebang을 가진 확장자 없는 진입점이 있으면 실패하는 저장소 계약 테스트를 추가한다.
- [x] 테스트를 실행해 현재 15개 파일 때문에 실패하는지 확인한다.
- [x] 15개 파일을 `git mv`로 이름만 변경하고 실행 권한을 유지한다.
- [x] 내부 호출, 테스트 helper, Actions, hooks, 스킬과 문서 참조를 `.py` 경로로 갱신한다.
- [x] 저장소 계약 테스트와 환경 구성 테스트를 통과시킨다.
- [x] 모든 `harness/scripts/*.py`의 Python 문법과 주요 진입점 직접 실행을 확인한다.

### Task 5: 전체 검증과 전달

**Files:**
- Verify: Issue #10 범위의 전체 diff

**Interfaces:**
- Consumes: Tasks 1-4의 결과
- Produces: 검증된 `CF-10` 브랜치와 Draft PR

- [x] `git diff --check`를 실행한다.
- [x] `harness/scripts/verify.py`를 실행한다.
- [x] `origin/develop...HEAD` 기준 Standards와 Issue #10 Spec 코드 리뷰를 수행한다.
- [x] 발견 사항을 수정하고 전체 검증을 다시 실행한다.
- [x] 논리적 변경별 커밋을 만들고 `CF-10`을 push한다.
- [x] Issue와 같은 제목의 Draft PR을 만들고 `Closes #10`을 하나만 포함한다.
- [x] PR에 `harness-change`를 적용하고 Issue와 Project를 review 상태로 전환한다.
