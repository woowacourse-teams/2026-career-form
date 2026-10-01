# Issue 26 WSL/Linux 하네스 실행 환경 정비 구현 계획

**목표:** 하네스·Git 훅·Codex 검증의 공식 실행 경로를 WSL/Linux로 고정하고, WSL 내부 새 clone에서 동일한 검증을 실행한다.

**구조:** 실행 선택기와 훅은 POSIX `python3`·`.venv/bin/python`·`sh`만 사용한다. 저장소 속성·계약 테스트가 Git 훅의 LF와 절대 경로 없는 셸 실행을 검증하며, 문서와 Linux CI가 같은 명령을 안내한다.

## 1. WSL/Linux 계약을 실패 테스트로 고정

- `harness/tests/test_shell_runtime.py`에서 셸 선택 결과가 `sh`임을 검증하고 Windows Git 경로 fixture를 제거한다.
- `harness/tests/test_python_runtime.py`에서 `.venv/bin/python` 선택과 fallback을 검증하고 Windows `Scripts/python.exe` fixture를 제거한다.
- `harness/tests/test_codex_runtime.py`에서 PATH로 찾은 `codex` 명령만 검증하고 Windows `.cmd` 경로 fixture를 제거한다.
- `harness/tests/test_codex_runtime.py`에서 `/mnt/<drive>/...` Windows Codex wrapper를 거부하는 회귀 사례를 추가한다.
- `harness/tests/test_repository_contract.py`에 다음 계약을 추가한다.
  - Codex 훅은 `python3`으로 Python 스크립트를 실행한다.
  - `.gitattributes`가 `.githooks/**`와 `*.sh`에 `text eol=lf`를 지정한다.
  - 추적된 `.githooks` 파일의 바이트에 CRLF가 없다.
  - PR 계약 workflow의 셸 실행은 `shutil.which("bash")`로 찾은 실행기를 사용하며 `/bin/bash` 상수를 사용하지 않는다.
  - `harness/README.md`와 `AGENTS.md`에 WSL/Linux, `/home/`, Windows PowerShell 비지원이 명시된다.
- 관련 테스트를 먼저 실행해 기존 Windows 경로·문서·LF 계약 때문에 실패함을 확인한다.

## 2. 실행기와 Git 훅을 POSIX 기준으로 전환

- `harness/lib/shell_runtime.py`를 `sh` 선택으로 단순화한다.
- `harness/lib/python_runtime.py`에서 OS 분기와 Windows 가상환경 경로를 제거하고 `.venv/bin/python`만 선택한다.
- `.githooks/python-runtime.sh`에서 `.venv/Scripts/python.exe` fallback을 제거하고 `.venv/bin/python`, `python3`, `python` 순서를 유지한다.
- `.codex/hooks.json`의 guard 실행기를 `python3`으로 바꾼다.
- `harness/lib/codex_runtime.py`와 `doctor.py`가 WSL 내부 Codex 실행기만 허용하도록 한다.
- `.gitattributes`를 추가해 Git 훅과 `.sh` 파일의 LF checkout을 강제한다.
- `.github/workflows/quality-gate.yml`에서 로컬 문서와 같은 `python3 harness/scripts/verify.py` 진입점을 사용한다.
- Task 1의 단위 테스트를 다시 실행해 통과를 확인한다.

## 3. 문서와 CI 계약을 동기화

- `AGENTS.md`에 하네스·Git 훅·에이전트 검증의 공식 실행 환경이 WSL/Linux임을 기록한다. Windows 사용자의 `/home/...` clone, WSL `git`·`python3`, VS Code Remote WSL 흐름과 PowerShell 직접 검증 비지원을 적는다.
- `harness/README.md`의 Windows/POSIX 병렬 명령을 WSL/Linux 단일 절차로 바꾸고, bootstrap·ensure·verify와 새 clone 확인 순서를 기록한다.
- WSL 내부 Node.js와 Codex 설치 확인, `/mnt/<drive>/...` Codex wrapper 거부 이유를 기록한다.
- `harness/policies/environments.md`에 이 실행 환경 계약과 CI 동일 진입점을 추가한다.
- 문서 계약 테스트와 YAML 계약 테스트를 실행한다.

## 4. WSL 새 clone과 전체 검증

- `/home/dbsghwns1209/2026-career-form-CF-26`에서 `python3 harness/scripts/ensure-environment.py`를 실행한다.
- 같은 clone에서 `.venv/bin/python harness/scripts/verify.py`와 `git diff --check`를 실행한다.
- `git ls-files --eol .githooks`로 모든 Git 훅의 index·worktree 줄바꿈이 LF인지 확인한다.
- 변경을 논리적 커밋으로 나누고, 마지막 전체 검증 뒤 `origin/develop...HEAD`를 두 축으로 검토한다.
