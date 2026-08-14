# 릴리스·핫픽스 브랜치 규칙 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 릴리스, 핫픽스, 동기화, 운영 실패 되돌림 PR만 명시적으로 허용하고 작업 PR과 시스템 PR 계약을 구분한다.

**Architecture:** `harness.lib.branching`이 브랜치 형식과 병합 방향을 판정하고 `harness.lib.pr_contract`가 PR 및 연결 Issue 라벨을 결합해 hotfix 여부와 PR 종류별 계약을 검사한다. GitHub Actions는 연결 Issue 제목과 라벨을 CLI에 전달하며 문서는 자동 검증 범위와 사람이 적용할 병합 방식을 구분한다.

**Tech Stack:** Python 3.13 `unittest`, GitHub Actions YAML, Markdown

## Global Constraints

- Issue #20의 인수 조건과 제외 범위를 변경하지 않는다.
- CF 작업 PR은 Issue 하나를 닫고 `[영역]` 제목을 사용한다.
- release, main 동기화, revert 시스템 PR은 Issue를 닫지 않고 `[Release]` 제목을 사용한다.
- `CF-* → main`, `main → develop`, `main → release/*`는 hotfix 조건이 있을 때만 허용한다.
- 실제 Ruleset 변경, release 생성, PR 병합과 배포는 수행하지 않는다.

### Task 1: 릴리스와 핫픽스 계약 회귀 테스트

**Files:** `harness/tests/test_branching.py`, `harness/tests/test_pr_contract.py`, `harness/tests/test_scripts.py`

**Interfaces:** 테스트는 `validate_branch_flow(head, base)`와 `validate_pr(payload, linked_issue_title, linked_issue_labels)`의 공개 계약을 사용한다. GitHub payload의 PR·Issue 라벨은 `labels[].name` 형식을 사용한다.

- [x] 유효·무효 semantic version, CF의 develop/release/main 경로, release의 main/develop 경로, main hotfix 동기화, revert SHA의 실패 테스트를 작성한다.
- [x] CF→main의 Issue/PR hotfix 라벨, main 동기화의 PR hotfix 라벨, 시스템 제목과 close-reference 규칙의 실패 테스트를 작성한다.
- [x] validate-pr 진입점이 연결 Issue의 `title`, `labels[].name`을 모두 전달하는 실패 테스트를 작성한다.
- [x] `.venv/bin/python -m unittest harness.tests.test_branching harness.tests.test_pr_contract harness.tests.test_scripts -v`가 새 계약 부재로 실패하는지 확인한다.
- [x] `test: 릴리스와 핫픽스 브랜치 계약 회귀 검증 추가`로 커밋한다.

### Task 2: 브랜치 형식·병합 행렬과 PR 계약 구현

**Files:** `harness/lib/branching.py`, `harness/lib/pr_contract.py`, `harness/scripts/validate-pr.py`

**Interfaces:** `is_release_branch`, `is_revert_branch`, `is_system_pr`, `validate_branch_flow(head, base)`, `validate_pr(payload, linked_issue_title=None, linked_issue_labels=())`를 제공한다.

- [x] release는 숫자 세 부분, revert는 소문자 16진수 7~40자로 제한하고 정의된 병합 행렬만 허용한다.
- [x] PR·Issue 라벨을 정규화하고 CF→main과 main 동기화에 경로별 hotfix 조건을 적용한다.
- [x] 시스템 PR에는 `[Release]`와 Issue 종료 금지, 작업 PR에는 `[영역]`과 단일 Issue 종료를 적용한다.
- [x] validate-pr 진입점에서 연결 Issue 제목과 라벨을 함께 파싱한다.
- [x] 관련 테스트가 통과하는지 확인한다.
- [x] `feat: 릴리스와 핫픽스 병합 경로 허용`으로 커밋한다.

### Task 3: GitHub Actions 라벨 전달

**Files:** `.github/workflows/pr-contract.yml`, `harness/tests/test_repository_contract.py`

- [ ] workflow가 연결 Issue의 `title,labels`를 조회하고 최소 권한을 유지하는 실패 테스트를 작성한다.
- [ ] `.venv/bin/python -m unittest harness.tests.test_repository_contract -v`로 RED를 확인한다.
- [ ] 연결 Issue 수집 JSON에 labels를 추가하고 PR 라벨은 event payload에서 읽게 유지한다.
- [ ] repository contract 테스트가 통과하는지 확인한다.
- [ ] `ci: PR 계약에 연결 Issue 라벨 전달`로 커밋한다.

### Task 4: 브랜치·환경·Ruleset 문서 동기화

**Files:** `docs/conventions/branching.md`, `docs/conventions/commit.md`, `harness/policies/environments.md`, `harness/policies/github-ruleset.md`, `docs/design/issue-based-ai-development-harness.md`, `harness/tests/test_repository_contract.py`

- [ ] 정본 문서가 release·hotfix 경로를 포함하고 과거 release 없는 흐름을 제거하는 실패 테스트를 작성한다.
- [ ] repository contract 테스트로 RED를 확인한다.
- [ ] 환경, Start release 운영 규칙, 병합 방식, hotfix 승인, revert, 정적 Harness 한계를 문서화한다.
- [ ] `.venv/bin/python harness/scripts/verify.py`와 `git diff --check`를 실행한다.
- [ ] `docs: 릴리스와 핫픽스 브랜치 운영 규칙 기록`으로 커밋한다.

## 수동 확인과 보류

- 실제 Ruleset required checks, 승인 1명, 직접 push·force push·삭제 금지는 사람이 대조한다.
- 경로별 Squash/Merge Commit 방식은 사람이 병합 시 확인한다.
- 활성 release 하나 제한, 자동 branch·PR 생성과 배포는 #19에서 구현한다.
