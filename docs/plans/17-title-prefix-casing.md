# Issue와 PR 영역 prefix 표기 통일 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use `cf-executing-plans` to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Issue와 PR 영역 prefix를 `FE`, `BE`, `Infra`, `Harness`, `Plan`, `Release`로 통일한다.

**Architecture:** `harness/lib/work_title.py`를 제목 표기의 단일 강제 지점으로 유지한다. 단위 테스트와 Issue 및 PR 계약 통합 테스트가 허용과 거부 경계를 증명하고, 정책, 스킬, eval, ADR과 예시는 같은 표기를 안내한다.

**Tech Stack:** Python 3.13, `unittest`, GitHub Actions, Markdown, JSON

## Global Constraints

- `FE`, `BE`만 전체를 대문자로 작성한다.
- 나머지 영역 prefix는 `Infra`, `Harness`, `Plan`, `Release`처럼 첫 문자만 대문자로 작성한다.
- Issue와 연결 PR의 제목 일치, 명사형 작업명과 브랜치 계약은 유지한다.
- Git 커밋 기록과 이미 생성된 squash commit 제목은 재작성하지 않는다.
- 공유 하네스 변경에는 `harness-change` 라벨과 사람 리뷰가 필요하다.

---

### Task 1: 제목 검증 계약

**Files:**
- Modify: `harness/tests/test_work_title.py`
- Modify: `harness/tests/test_pr_contract.py`
- Modify: `harness/tests/test_issue_contract.py`
- Modify: `harness/tests/test_scripts.py`
- Modify: `harness/tests/test_template_body.py`
- Modify: `harness/lib/work_title.py`

**Interfaces:**
- Consumes: `validate_work_title(title: str) -> ValidationResult`, `validate_release_title(title: str) -> ValidationResult`
- Produces: 새 영역 표기를 허용하고 이전 대문자 및 잘못된 혼합 표기를 거부하는 제목 계약

- [x] **Step 1: 새 허용 표기와 이전 표기 거부 테스트 작성**

  `test_work_title.py`에서 `[Infra]`, `[Harness]`, `[Plan]`을 유효 사례로 두고 `[INFRA]`, `[HARNESS]`, `[PLAN]`을 거부 사례로 둔다. `FE`, `BE`는 기존 표기를 유지하며 소문자와 혼합 표기를 거부한다.

- [x] **Step 2: 배포 PR의 새 표기 테스트 작성**

  `test_pr_contract.py`에서 `[Release]`를 허용하고 `[RELEASE]`를 거부하며 오류 메시지가 새 표기를 안내하도록 기대값을 변경한다.

- [x] **Step 3: 관련 계약 fixture를 새 표기로 변경**

  Issue, PR, CLI와 템플릿 렌더링 fixture의 `[PLAN]`, `[HARNESS]`를 각각 `[Plan]`, `[Harness]`로 바꾼다.

- [x] **Step 4: RED 확인**

  Run:

  ```bash
  .venv/bin/python -m unittest \
    harness.tests.test_work_title \
    harness.tests.test_issue_contract \
    harness.tests.test_pr_contract \
    harness.tests.test_scripts \
    harness.tests.test_template_body
  ```

  Expected: 기존 검증기가 `[Infra]`, `[Harness]`, `[Plan]`, `[Release]`를 거부하고 이전 대문자를 허용해 FAIL.

- [x] **Step 5: 최소 검증 구현**

  `ALLOWED_AREAS`를 `("FE", "BE", "Infra", "Harness", "Plan")`으로 바꾸고 배포 제목 패턴과 오류 메시지를 `[Release]`로 변경한다.

- [x] **Step 6: GREEN 확인**

  Step 4의 명령을 다시 실행해 모든 관련 테스트가 통과하는지 확인한다.

### Task 2: 정책과 사용 안내 동기화

**Files:**
- Modify: `docs/conventions/commit.md`
- Modify: `docs/agents/issue-tracker.md`
- Modify: `harness/policies/issue-contract.md`
- Modify: `harness/policies/workflow.md`
- Modify: `harness/README.md`
- Modify: `.agents/skills/cf-project-issue-planning/SKILL.md`
- Modify: `.agents/skills/cf-issue-workflow/SKILL.md`
- Modify: `.agents/skills/cf-project-issue-planning/evals/evals.json`
- Modify: `.agents/skills/cf-issue-workflow/evals/evals.json`
- Modify: `docs/design/issue-based-ai-development-harness.md`
- Modify: `docs/adr/README.md`
- Modify: `docs/adr/10-plan-and-adr-workflow.md`
- Modify: `docs/adr/14-shared-harness-lifecycle.md`
- Modify: `docs/plans/1-codex-development-harness.md`
- Modify: `docs/plans/10-plan-adr-python-entrypoints.md`
- Modify: `docs/plans/14-shared-harness-lifecycle.md`

**Interfaces:**
- Consumes: Task 1의 허용 영역 목록
- Produces: 사람이 읽는 정책과 에이전트 행동 지침에서 동일한 prefix 표기

- [x] **Step 1: 현행 정책과 스킬 갱신**

  모든 현행 문서와 스킬에서 영역 목록을 `FE`, `BE`, `Infra`, `Harness`, `Plan`으로, 배포 prefix를 `Release`로 안내한다. `Plan`의 의미와 기존 승인 게이트는 유지한다.

- [x] **Step 2: eval과 예시 갱신**

  eval prompt와 저장소 예시를 새 표기로 변경한다. 산문 문구 자체를 검사하는 테스트는 추가하지 않고 기존 구조 및 라우팅 검증을 사용한다.

- [x] **Step 3: ADR 결정 갱신**

  ADR #14의 관련 Issue에 #17을 추가하고 prefix 대소문자 결정을 명시한다. 과거 계획 문서는 새 결정이 이전 대문자 규칙을 대체했음을 드러내도록 갱신한다.

- [x] **Step 4: 문서 및 스킬 검증**

  Run:

  ```bash
  .venv/bin/python harness/scripts/validate-skills.py
  .venv/bin/python harness/scripts/validate-skill-routing-evals.py
  git diff --check
  ```

  Expected: 모든 명령 exit 0.

### Task 3: 전체 검증, 원격 제목과 Draft PR

**Files:**
- Verify: `.github/ISSUE_TEMPLATE/feature.yml`
- Verify: `.github/ISSUE_TEMPLATE/bug.yml`
- Verify: `.github/ISSUE_TEMPLATE/technical-task.yml`
- Verify: repository 전체 diff

**Interfaces:**
- Consumes: Task 1과 Task 2의 코드 및 문서 변경
- Produces: 검증된 `CF-17` 브랜치와 Issue #17을 종료하는 Draft PR

- [x] **Step 1: Issue Form 제목 기본값 확인**

  세 Issue Form에 `title` 기본값이 없고 새 prefix를 방해하는 생성 설정이 없는지 저장소 계약 테스트로 확인한다.

- [x] **Step 2: 전체 검증**

  Run:

  ```bash
  .venv/bin/python harness/scripts/verify.py
  git diff --check
  ```

  Expected: 0 failures, 전체 커버리지 80% 이상, exit 0.

- [x] **Step 3: 두 축 코드 리뷰**

  `origin/develop...HEAD`를 저장소 Standards와 Issue #17 Spec 기준으로 각각 검토한다. 발견한 치명적 문제와 높은 위험 문제를 수정하고 전체 검증을 다시 실행한다.

- [x] **Step 4: GitHub 제목 정리**

  현재 GitHub Issue와 PR을 조회해 `INFRA`, `HARNESS`, `PLAN`, `RELEASE` prefix가 남은 제목만 새 표기로 바꾼다. Issue #17은 `[Harness] Issue와 PR 영역 prefix 표기 통일`로 바꾸고 결과를 다시 조회한다.

- [x] **Step 5: 커밋과 Draft PR 생성**

  논리적 변경을 커밋하고 `CF-17`을 push한다. PR 템플릿을 렌더링해 `[Harness] Issue와 PR 영역 prefix 표기 통일` 제목의 Draft PR을 만들고 `Closes #17`을 정확히 하나 포함한다.
