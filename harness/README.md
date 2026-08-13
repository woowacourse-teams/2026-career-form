# 개발 하네스

이 폴더는 팀의 작업 계약을 실행 가능한 검사로 연결한다. `policies/`는 사람이 읽는 정책이고, `lib/`와 `scripts/`는 Codex 훅, Git 훅, GitHub Actions가 호출하는 강제 장치다. `tests/`는 강제 장치의 동작을 검증한다.

## 로컬 설치

사람이 저장소를 직접 clone해 사용하는 경우 한 번 실행한다.

```bash
# Windows PowerShell
python harness/scripts/bootstrap.py

# POSIX shell
python3 harness/scripts/bootstrap.py
```

`bootstrap.py`는 `.venv`에 하네스 의존성을 설치하고 현재 저장소의 `core.hooksPath`만 `.githooks`로 설정한다. 사용자 전역 Git 설정은 바꾸지 않는다.

AI가 `cf-issue-workflow`로 작업할 때는 별도 수동 설치가 필요하지 않다. AI는 실제 작업 clone 또는 worktree에 들어온 직후 다음 진입점을 실행한다.

```bash
# Windows PowerShell
python harness/scripts/ensure-environment.py

# POSIX shell
python3 harness/scripts/ensure-environment.py
```

`ensure-environment.py`는 먼저 `doctor.py`로 설치 상태를 확인한다. 준비되지 않았을 때만 `bootstrap.py`를 실행하고 `doctor.py`로 다시 검증한다. 자동 구성에 실패하면 AI는 파일 수정과 Issue 상태 변경 전에 멈추고 원인을 보고한다.

## 단일 검증 명령

```bash
# Windows PowerShell
.venv/Scripts/python.exe harness/scripts/verify.py

# POSIX shell
.venv/bin/python harness/scripts/verify.py
```

이 명령은 하네스 테스트, 하네스 코드 커버리지 80%, Git 공백 오류를 검사한다. 애플리케이션 스택이 확정되면 포맷, 린트, 애플리케이션 테스트, 빌드 명령을 이 진입점에 추가한다.

## Project Issue 기획

`cf-project-issue-planning` 스킬은 사람이 만든 Project draft 하나의 제목을 `[영역] 작업명`으로 보정하고 repository Issue로 승격한 뒤 `status:planning`과 같은 item의 `In Progress`를 함께 적용한다. `[PLAN]`은 조사, 요구사항 정리, 문서 기획처럼 구현에 선행하는 작업에 사용한다. 기본값은 기획 산출물만 다루는 것이지만 처음 승인한 범위에 구현이 명시되어 있으면 같은 Issue에서 함께 진행할 수 있다. draft가 없으면 AI가 만들지 않고 사람 생성에서 멈춘다.

기획 중 대안을 비교한 장기 결정이 제품, 아키텍처, 보안, 데이터 또는 공용 워크플로우에 영향을 주면 `docs/adr/`의 ADR 대상으로 판단한다. 승인 전에는 Issue 계약에 전체 ADR 초안과 저장 경로만 제안하고 파일을 만들지 않는다. 승인 뒤 `cf-issue-workflow`가 `CF-*` 브랜치에서 ADR 파일을 작성해 같은 PR에 포함한다. 일반 조사 결과나 쉽게 되돌릴 수 있는 선택에는 ADR을 강제하지 않는다. 상태 전이를 재개할 때는 선택한 Python으로 `harness/scripts/plan-project-issue.py <snapshot 파일>`을 실행해 첫 미완료 action을 확인한다.

확정된 Issue 구현은 `cf-issue-workflow` 스킬이 이어받는다. Issue label과 Project Status의 대응, 브랜치와 PR 연결 계약은 `docs/agents/issue-tracker.md`에서 확인한다.

전체 흐름은 `cf-issue-lifecycle`이 기획, 구현, 사람 머지 대기와 `cf-post-merge-cleanup`을 연결한다. 재개할 때는 GitHub Issue와 PR 상태를 다시 읽고 첫 미완료 단계부터 진행한다. 공용 흐름은 Orca와 개인 플러그인에 의존하지 않는다.

Issue와 PR 본문은 각각 선택한 `.github/ISSUE_TEMPLATE/*.yml`과 `.github/pull_request_template.md`를 원본으로 `render-template-body.py`가 OS 임시 UTF-8 Markdown 파일에 만든다. GitHub CLI에는 `--body-file`로 전달하고 원격 본문을 다시 읽어 독립 계약 검증기로 확인한다.

## 강제 지점

| 지점 | 검사 |
|---|---|
| Codex `PreToolUse` | 삭제, 시크릿, 마이그레이션, 배포, 장기 브랜치 수정 차단 |
| `commit-msg` | 커밋 type, 한글 설명, scope 미사용, Breaking Change |
| `pre-commit` | 빠른 하네스 테스트, 스테이지된 공백 오류 |
| `pre-push` | 전체 하네스 검증 |
| GitHub Actions | Issue, PR, 브랜치, 공유 파일, 품질 계약 |
| GitHub Ruleset | PR 필수화, 필수 검사, 사람 승인, force push 금지 |

로컬 훅은 우회할 수 있으므로 최종 강제 경계는 GitHub Actions와 Ruleset이다.

## 문제 해결

- 선택한 Python으로 `harness/scripts/doctor.py`를 실행해 필수 명령, 파일, Git 훅 경로를 확인한다.
- 선택한 Python으로 `harness/scripts/diagnose-project-access.py`를 실행해 GitHub CLI 인증과 Project 접근을 안전하게 진단한다. Project 좌표는 `harness/project.json`에서 관리한다.
- Codex 훅이 실행되지 않으면 프로젝트를 신뢰했는지 확인하고 `/hooks`에서 훅을 검토한다.
- 공유 하네스 파일을 바꾸는 PR에는 `harness-change` 라벨과 다른 팀원 리뷰가 필요하다.
- 서버 설정은 `policies/github-setup.md`와 `policies/github-ruleset.md`의 체크리스트를 따른다.
