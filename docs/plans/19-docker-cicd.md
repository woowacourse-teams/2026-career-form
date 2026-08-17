# Docker 기반 CI/CD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `cf-executing-plans` to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 Java 21 백엔드 이미지를 digest로 빌드·승격하고 development, staging, production에 안전하게 배포하며 readiness 실패 시 자동 롤백과 Draft revert PR을 수행하는 CI/CD를 구축한다.

**Architecture:** GitHub-hosted runner는 Gradle 검증, linux/arm64 이미지 build/push와 GitHub 메타데이터 변경만 수행한다. 환경 label이 분리된 self-hosted runner는 PR이 아닌 신뢰된 push의 정확한 commit만 checkout해 해당 commit의 배포 스크립트로 Compose 교체·readiness·rollback을 수행한다. 정상 release는 staging digest를 production에서 재사용하고 hotfix는 main merge SHA 이미지를 새로 빌드한다.

**Tech Stack:** GitHub Actions, Docker Buildx, Docker Compose v2, Bash, Python 3.13 unittest, Java 21, Gradle 9.6.1, Spring Boot Actuator

## Global Constraints

- 애플리케이션·Gradle·Actuator·MongoDB 코드와 E2E suite는 변경하지 않는다.
- 대상 이미지는 `linux/arm64`, tag는 전체 40자리 commit SHA, 배포 식별자는 registry digest다.
- development·staging은 같은 host의 별도 Compose project와 port를 사용하고 production은 별도 host를 사용한다.
- self-hosted runner는 `pull_request`에서 실행하지 않으며, 신뢰된 `develop`·`release/*`·`main` push의 정확한 commit만 checkout한다.
- production은 main merge 직후 별도 Environment 승인 없이 자동 배포한다.
- 정상 release는 staging digest를 재빌드하지 않고 사용하며 hotfix는 staging 없이 새 이미지를 production에 배포한다.
- readiness는 기존 `/actuator/health`를 최대 120초 확인하고 실패하면 이전 digest로 복원한다.
- rollback 결과와 무관하게 원래 배포 workflow는 실패한다.
- 민감 설정값은 이미지, 저장소, 로그, 서버 영구 평문 env 파일에 기록하지 않는다.
- 실제 GitHub Environment·secret·runner·EC2·Docker Hub·MongoDB 설정과 실제 배포는 사람이 수행한다.

---

### Task 1: CI/CD 계약 테스트 기반

**Files:**
- Create: `infra/tests/__init__.py`
- Create: `infra/tests/test_compose_contract.py`
- Create: `infra/tests/test_deploy.py`
- Create: `infra/tests/test_workflow_contract.py`
- Modify: `harness/scripts/verify.py`
- Modify: `harness/scripts/validate-shell-syntax.py`

**Interfaces:**
- Consumes: repository root, Docker Compose CLI, YAML workflow files
- Produces: `python -m unittest discover -s infra/tests -p 'test_*.py'` 검증 진입점

- [x] **Step 1: 검증 진입점 실패 테스트 작성**

  `harness/tests/test_repository_contract.py`에서 전체 검증이 `infra/tests`를 실행하고 shell syntax 검사가 `infra/scripts/*.sh`를 포함해야 한다는 계약을 추가한다. production 검증 코드를 제거하거나 경로를 누락하면 실패해야 한다.

- [x] **Step 2: RED 확인**

  Run: `.venv/bin/python -m unittest harness.tests.test_repository_contract -v`

  Expected: `infra/tests` 또는 `infra/scripts` 검증 연결이 없어 FAIL.

- [x] **Step 3: 최소 검증 연결 구현**

  `harness/scripts/verify.py`에 다음 명령을 coverage report 이후 추가한다.

  ```python
  (PYTHON, "-m", "unittest", "discover", "-s", "infra/tests", "-p", "test_*.py", "-v")
  ```

  `validate-shell-syntax.py`는 `.githooks/*`와 `infra/scripts/*.sh`를 합쳐 `bash -n`으로 검사한다.

- [x] **Step 4: GREEN 확인**

  Run: `.venv/bin/python -m unittest harness.tests.test_repository_contract -v`

  Expected: PASS.

- [x] **Step 5: 커밋**

  ```bash
  git add harness infra/tests
  git commit -m "test: 배포와 이미지 승격 계약 회귀 검증 추가"
  ```

### Task 2: 환경별 Compose와 ARM64 이미지 계약

**Files:**
- Create: `infra/compose.deploy.yaml`
- Modify: `backend/Dockerfile`
- Modify: `compose.yaml`
- Modify: `infra/tests/test_compose_contract.py`
- Modify: `infra/tests/test_workflow_contract.py`

**Interfaces:**
- Consumes: `BACKEND_IMAGE`, `BACKEND_PORT`, `SPRING_PROFILES_ACTIVE`, `SPRING_MONGODB_URI`
- Produces: digest-pinned `backend` service with loopback port, healthcheck, and `json-file` rotation

- [x] **Step 1: Compose 실패 테스트 작성**

  실제 `docker compose --project-directory <root> -f compose.yaml -f infra/compose.deploy.yaml config --format json`을 비식별 dummy 환경값으로 실행한다. 렌더링 결과가 다음을 만족하지 않으면 실패한다.

  ```text
  image == registry.example/career-form@sha256:<64 hex>
  ports target 8080, host_ip 127.0.0.1
  SPRING_PROFILES_ACTIVE == staging
  logging.driver == json-file
  logging.options.max-size == 10m
  logging.options.max-file == 3
  no build section
  ```

- [x] **Step 2: RED 확인**

  Run: `.venv/bin/python -m unittest infra.tests.test_compose_contract -v`

  Expected: `infra/compose.deploy.yaml` 부재로 FAIL.

- [x] **Step 3: Compose와 runtime health 도구 구현**

  `infra/compose.deploy.yaml`은 기존 `compose.yaml`의 backend에 registry digest, 환경값, loopback port와 로그 순환만 overlay한다. `backend/Dockerfile` runtime stage에는 Compose healthcheck가 호출하는 `curl`만 `--no-install-recommends`로 설치하고 apt index를 제거한다.

- [x] **Step 4: GREEN 및 ARM64 build 확인**

  Run:

  ```bash
  .venv/bin/python -m unittest infra.tests.test_compose_contract -v
  docker buildx build --platform linux/arm64 --load -t career-form-backend:cf-19 ./backend
  ```

  Expected: Compose test PASS, Docker build exit 0.

- [x] **Step 5: 커밋**

  ```bash
  git add backend/Dockerfile compose.yaml infra/compose.deploy.yaml infra/tests/test_compose_contract.py
  git commit -m "build: ARM64 애플리케이션 배포 구성"
  ```

### Task 3: Digest 배포와 자동 롤백

**Files:**
- Create: `infra/scripts/deploy.sh`
- Modify: `infra/tests/test_deploy.py`

**Interfaces:**
- Consumes environment: `DEPLOY_ENVIRONMENT`, `BACKEND_IMAGE`, `BACKEND_PORT`, `SPRING_PROFILES_ACTIVE`, `SPRING_MONGODB_URI`, `DEPLOY_STATE_DIR`
- Produces state: `<DEPLOY_STATE_DIR>/<environment>/current-digest`, `previous-digest`
- Exit: `0` success, non-zero validation/deploy/readiness failure; rollback success never changes original failure exit

- [x] **Step 1: 입력 경계 실패 테스트 작성**

  fake `docker`와 fake `curl`을 PATH 앞에 두고 script를 실제 실행한다. digest가 `repository@sha256:<64 hex>`가 아니거나 environment/profile 조합이 다르면 Docker 호출 전 종료해야 한다.

- [x] **Step 2: RED 확인**

  Run: `.venv/bin/python -m unittest infra.tests.test_deploy -v`

  Expected: `infra/scripts/deploy.sh` 부재로 FAIL.

- [x] **Step 3: 정상 배포 최소 구현**

  script는 `set -euo pipefail`과 `umask 077`을 사용하고 secret 값을 출력하지 않는다. state directory를 만들고 이전 `current-digest`를 읽은 뒤 다음 순서를 실행한다.

  ```text
  docker pull <digest>
  docker compose --project-name career-form-<env> -f compose.yaml -f infra/compose.deploy.yaml config --quiet
  docker compose ... up --detach --no-build backend
  curl --fail --silent --show-error http://127.0.0.1:<port>/actuator/health
  ```

  readiness는 5초 간격, 최대 24회다. 성공 시 기존 current를 previous로 옮기고 새 digest를 current에 atomic rename으로 기록한다.

- [x] **Step 4: 실패 rollback 테스트 작성 및 RED 확인**

  새 digest readiness가 24회 실패하면 이전 digest로 Compose를 다시 올리고 readiness를 재확인해야 한다. 이전 digest가 없으면 복구 불가 오류를 내고 실패해야 한다. rollback이 성공해도 exit는 non-zero다.

- [x] **Step 5: rollback과 안전한 이미지 정리 구현**

  실패 시 `BACKEND_IMAGE`를 이전 digest로 바꿔 같은 Compose 명령을 실행한다. 성공 뒤 repository의 local digest 중 current·previous에 해당하지 않는 것만 `docker image rm` 대상으로 넘기고 다른 repository 이미지는 건드리지 않는다.

- [x] **Step 6: GREEN 확인**

  Run:

  ```bash
  .venv/bin/python -m unittest infra.tests.test_deploy -v
  bash -n infra/scripts/deploy.sh
  ```

  Expected: 정상, validation, readiness failure, rollback success/failure, cleanup 경계 모두 PASS.

- [x] **Step 7: 커밋**

  ```bash
  git add infra/scripts/deploy.sh infra/tests/test_deploy.py
  git commit -m "feat: 준비 상태 기반 자동 롤백 배포 구성"
  ```

### Task 4: 개발과 스테이징 배포 workflow

**Files:**
- Create: `.github/workflows/backend-ci.yml`
- Create: `.github/workflows/deploy-development.yml`
- Create: `.github/workflows/start-release.yml`
- Create: `.github/workflows/deploy-staging.yml`
- Modify: `infra/tests/test_workflow_contract.py`

**Interfaces:**
- Image tag: `${DOCKERHUB_IMAGE}:${full_commit_sha}`
- Image output: registry digest from Docker Buildx
- Runner labels: `[self-hosted, linux, ARM64, development]`, `[self-hosted, linux, ARM64, staging]`
- Environments: `development`, `staging`

- [x] **Step 1: workflow 행위 실패 테스트 작성**

  YAML을 구조적으로 파싱해 다음을 검증한다.

  ```text
  backend-ci: pull_request에서 backend Gradle clean check bootJar
  development: push develop에서 linux/arm64 build/push 후 development deploy
  start-release: workflow_dispatch version 입력, release/x.y.z 중복 차단, develop HEAD branch 생성, Draft PR to main
  staging: push release/**에서 build/push 후 staging deploy
  deploy jobs: self-hosted 환경 label, environment, concurrency 1, 현재 신뢰된 push commit checkout
  ```

- [x] **Step 2: RED 확인**

  Run: `.venv/bin/python -m unittest infra.tests.test_workflow_contract -v`

  Expected: workflow 파일 부재로 FAIL.

- [x] **Step 3: 최소 권한 workflow 구현**

  build job은 GitHub-hosted runner에서 checkout, Java 21 setup, Gradle 검증, QEMU/Buildx, Docker Hub login, `linux/arm64` push를 수행한다. deploy job은 신뢰된 push의 정확한 commit을 checkout하고 GitHub Environment secret을 process environment로 전달해 그 commit의 `deploy.sh`를 호출한다.

  Start release는 `contents: write`, `pull-requests: write`만 사용하고 version을 `^[0-9]+\.[0-9]+\.[0-9]+$`로 검증한다. 활성 `release/*`가 있으면 변경 없이 실패한다.

- [x] **Step 4: GREEN 확인**

  Run:

  ```bash
  .venv/bin/python -m unittest infra.tests.test_workflow_contract -v
  .venv/bin/python harness/scripts/verify.py
  ```

  Expected: PASS.

- [x] **Step 5: 커밋**

  ```bash
  git add .github/workflows infra/tests/test_workflow_contract.py
  git commit -m "ci: 개발과 스테이징 이미지 배포 흐름 구성"
  ```

### Task 5: 운영 승격, hotfix, revert와 동기화

**Files:**
- Create: `.github/workflows/deploy-production.yml`
- Create: `.github/workflows/complete-release-sync.yml`
- Create: `infra/scripts/classify-main-merge.py`
- Create: `infra/tests/test_release_metadata.py`
- Modify: `infra/tests/test_workflow_contract.py`
- Modify: `docs/conventions/branching.md`

**Interfaces:**
- `classify-main-merge.py <event-json> <associated-prs-json>` stdout JSON: `kind`, `head_ref`, `head_sha`, optional `version`
- Kinds: `release`, `hotfix`, `revert`; any other main push is rejected. `revert` 병합은 이미 rollback된 서버를 재배포하지 않고 main 소스만 정렬한다.
- Production runner: `[self-hosted, linux, ARM64, production]`, environment `production`

- [x] **Step 1: main merge 분류 실패 테스트 작성**

  실제 GitHub push와 associated PR 구조를 완전한 비식별 fixture로 전달한다. `release/1.2.3` Merge Commit은 release, `hotfix/CF-19` Squash Merge는 hotfix로 분류하고 일반 CF, 누락 PR, 여러 matching PR은 실패해야 한다.

- [x] **Step 2: RED 확인**

  Run: `.venv/bin/python -m unittest infra.tests.test_release_metadata -v`

  Expected: 분류 script 부재로 FAIL.

- [x] **Step 3: 분류기 구현과 GREEN 확인**

  외부 JSON type을 경계에서 검증하고 release version은 branch 계약과 같은 세 부분 숫자만 허용한다. hotfix는 `hotfix/CF-<positive issue>`만 허용한다.

- [x] **Step 4: production workflow 실패 테스트 작성**

  YAML 구조로 다음을 검증한다.

  ```text
  push main only
  release: head SHA tag에서 digest inspect, build 없음
  hotfix: main merge SHA로 linux/arm64 새 build
  production deploy: 신뢰된 main commit만 checkout하는 self-hosted runner, 자동 Environment
  failure: GitHub-hosted runner가 revert/<main-sha> branch와 Draft PR 생성
  success release: v<version> tag와 release->develop PR 생성
  success hotfix: main->develop 및 active release PR 생성
  sync merged: release branch 삭제
  ```

- [x] **Step 5: production·revert·동기화 구현**

  배포 job은 `continue-on-error`로 성공을 위장하지 않는다. 후속 job은 `needs.deploy.result`를 기준으로 성공과 실패를 분리한다. revert job은 merge commit이면 `git revert -m 1`, 단일 parent이면 `git revert`를 사용해 Draft PR만 만들고 main에 직접 push하지 않는다.

  `docs/conventions/branching.md`는 운영 실패 시 CI가 Draft revert PR을 만들고 사람은 승인·머지를 담당하도록 갱신한다.

- [x] **Step 6: GREEN 확인**

  Run:

  ```bash
  .venv/bin/python -m unittest infra.tests.test_release_metadata infra.tests.test_workflow_contract -v
  .venv/bin/python harness/scripts/verify.py
  ```

  Expected: PASS.

- [x] **Step 7: 커밋**

  ```bash
  git add .github/workflows infra/scripts/classify-main-merge.py infra/tests docs/conventions/branching.md
  git commit -m "ci: 운영 이미지 승격과 복구 흐름 구성"
  ```

### Task 6: 서버 초기화와 운영 문서

**Files:**
- Create: `infra/scripts/bootstrap-app-host.sh`
- Create: `infra/scripts/bootstrap-mongodb-host.sh`
- Create: `infra/tests/test_bootstrap_scripts.py`
- Create: `docs/operations/cicd-setup.md`
- Create: `docs/operations/deployment-runbook.md`
- Modify: `backend/README.md`

**Interfaces:**
- Bootstrap scripts: 설치 계획을 `--check`로 검증하며 secret이나 runner registration token을 받지 않음
- Runbook: GitHub Environment vars/secrets 이름, Docker Hub push/pull 계정 경계, 최초 배포·재실행·rollback 절차

- [x] **Step 1: bootstrap 안전 경계 실패 테스트 작성**

  scripts의 `--check`를 실제 실행해 지원 OS, 필수 명령, 2GiB swap·Docker·host service 상태를 읽기 전용으로 보고하는지 검증한다. 인자 없이 실행하면 관리자 확인 없이는 설치를 시작하지 않아야 하고 secret 값을 인자로 받지 않아야 한다.

- [x] **Step 2: RED 확인**

  Run: `.venv/bin/python -m unittest infra.tests.test_bootstrap_scripts -v`

  Expected: bootstrap script 부재로 FAIL.

- [x] **Step 3: scripts와 운영 문서 구현**

  설치 script는 재현 가능한 명령과 systemd unit 예시를 제공하되 이 작업에서 실행하지 않는다. 문서는 다음 사람 작업을 체크리스트로 분리한다.

  ```text
  GitHub Environments와 runner labels
  Docker Hub push/pull-only accounts
  Nginx/cloudflared/swap/MongoDB systemd
  환경별 DB와 readWrite 계정
  신뢰된 push commit checkout과 비민감 state directory
  최초 배포, 재실행, readiness rollback, Draft revert PR 확인
  secret·실제 URI·registration token 기록 금지
  ```

- [x] **Step 4: 전체 GREEN 확인**

  Run:

  ```bash
  .venv/bin/python -m unittest discover -s infra/tests -p 'test_*.py' -v
  cd backend && ./gradlew clean check bootJar
  .venv/bin/python harness/scripts/verify.py
  git diff --check
  ```

  Expected: 전부 exit 0, harness coverage 80% 이상.

- [x] **Step 5: 커밋**

  ```bash
  git add infra/scripts infra/tests docs/operations backend/README.md docs/plans/19-docker-cicd.md
  git commit -m "docs: 서버 초기화와 배포 운영 절차 기록"
  ```

## 독립 리뷰 반영

- [x] Start release가 `GITHUB_TOKEN` push에 의존하지 않고 staging workflow를 명시적으로 dispatch한다.
- [x] Start release 동시 실행을 직렬화해 활성 release 중복 생성 경쟁을 막는다.
- [x] runner 공용 group이 배포 digest 상태를 읽고 쓸 수 있도록 디렉터리와 파일 권한을 제한한다.
- [x] 운영 revert PR은 image job 실패가 아니라 실제 deploy step 실패에만 생성한다.
- [x] readiness 요청별 timeout과 전체 120초 deadline을 적용한다.
- [x] rollback 성공 뒤 실패 digest와 stale image를 정리한다.
- [x] release 운영 배포 전에 main merge tree 일치와 Gradle source 검증을 수행한다.
- [x] Nginx, Cloudflare Tunnel, MongoDB 인증·계정 격리 절차를 비밀값 없는 예제로 보강한다.
- [x] Cloudflare APT source가 내려받은 signing key를 명시적으로 사용한다.
- [x] release의 모든 변경을 staging에 배포해 release HEAD SHA digest를 보장한다.
- [x] 이전 digest가 없는 최초 실패에서도 실패 container와 image를 정리한다.

## 수동 확인과 사람 담당

- GitHub Environment, variables, secrets와 self-hosted runner label 생성
- Docker Hub private repository, push account와 host별 pull-only account 생성
- EC2·MongoDB·Nginx·cloudflared·swap 실제 설치와 권한 설정
- development, Start release, staging 수동 E2E, production 자동 배포 실행
- readiness 실패를 유도한 rollback과 Draft revert PR 확인
- PR Ready 전환, 승인, 병합과 release 동기화 PR 병합
