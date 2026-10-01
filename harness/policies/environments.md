# 브랜치와 환경

## 하네스 실행 환경

하네스, Git 훅, Codex 에이전트 검증은 WSL/Linux를 공식 실행 환경으로 사용한다. Windows 사용자는 WSL 내부 파일시스템의 `/home/...` clone에서 WSL `git`, `python3`, `.venv/bin/python`을 사용한다. Windows PowerShell 직접 실행과 Windows 파일시스템의 `/mnt/<drive>/...` clone은 지원 대상이 아니다.

Codex는 WSL 내부 Node.js로 설치한 실행기만 사용한다. `command -v codex`가 `/mnt/<drive>/...`를 가리키면 Windows 설치가 섞인 상태이므로 하네스 검증을 시작하지 않는다.

로컬과 Linux CI는 각각 `python3 harness/scripts/ensure-environment.py`와 `python3 harness/scripts/verify.py`를 같은 검증 진입점으로 사용한다.

| 기준 | 개발 서버 | 스테이징 서버 | 운영 서버 |
|---|---|---|---|
| 소스 | `CF-*`, `develop` | `release/<MAJOR.MINOR.PATCH>` | `hotfix/CF-*`, `main` |
| 목적 | 작업·통합 검증 | 고정된 릴리스 후보 검증 | 사용자 서비스 |
| AI 배포 | 금지 | 금지 | 금지 |

Start release는 현재 `develop` HEAD에서 활성 release 브랜치 하나를 만든다. 이후
`develop` 개발은 계속 진행하고 스테이징은 release 브랜치만 검증한다. 검증 중 수정은
`CF-*` → `release/*`로 반영하고, 승인된 release를 `main`과 `develop`에 Merge
Commit으로 병합한다.

운영 hotfix는 `main`에서 분기한 `hotfix/CF-*` → `main`으로 반영한 뒤 `main` → `develop`과
활성 `release/*`에 동기화한다. 운영 배포 실패는 `revert/<main-merge-sha>` Draft
PR로 되돌린다.

하네스는 브랜치 경로와 PR 종류만 정적으로 검사한다. 활성 release 하나
유지, 서버 배포 workflow, 환경 변수, 배포 승인과 실제 되돌림은 별도 담당자가
구성하고 실행한다.
