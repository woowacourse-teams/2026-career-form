# 개발 하네스

이 폴더는 팀의 작업 계약을 실행 가능한 검사로 연결한다. `policies/`는 사람이 읽는 정책이고, `lib/`와 `scripts/`는 Codex 훅, Git 훅, GitHub Actions가 호출하는 강제 장치다. `tests/`는 강제 장치의 동작을 검증한다.

## 로컬 설치

```bash
harness/scripts/bootstrap
```

`bootstrap`은 `.venv`에 하네스 의존성을 설치하고 현재 저장소의 `core.hooksPath`만 `.githooks`로 설정한다. 사용자 전역 Git 설정은 바꾸지 않는다.

## 단일 검증 명령

```bash
harness/scripts/verify
```

이 명령은 하네스 테스트, 하네스 코드 커버리지 80%, Git 공백 오류를 검사한다. 애플리케이션 스택이 확정되면 포맷, 린트, 애플리케이션 테스트, 빌드 명령을 이 진입점에 추가한다.

## Project Issue 기획

`project-issue-planning` 스킬은 Project draft 하나를 repository Issue로 승격하고 같은 item의 상태를 `In Progress`로 바꾼다. 이후 Issue 본문과 한 PR의 논리적 커밋 계획을 작성하며, 사람 승인 전에는 `status:ready`나 구현 브랜치를 만들지 않는다. 상태 전이를 재개할 때는 `harness/scripts/plan-project-issue <snapshot JSON>`으로 첫 미완료 action을 확인한다.

확정된 Issue 구현은 `issue-workflow` 스킬이 이어받는다. Issue label과 Project Status의 대응, 브랜치와 PR 연결 계약은 `docs/agents/issue-tracker.md`에서 확인한다.

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

- `harness/scripts/doctor`로 필수 명령, 파일, Git 훅 경로를 확인한다.
- `harness/scripts/diagnose-project-access`로 GitHub CLI 인증과 Project 접근을 안전하게 진단한다. Project 좌표는 `harness/project.json`에서 관리한다.
- Codex 훅이 실행되지 않으면 프로젝트를 신뢰했는지 확인하고 `/hooks`에서 훅을 검토한다.
- 공유 하네스 파일을 바꾸는 PR에는 `harness-change` 라벨과 다른 팀원 리뷰가 필요하다.
- 서버 설정은 `policies/github-setup.md`와 `policies/github-ruleset.md`의 체크리스트를 따른다.
