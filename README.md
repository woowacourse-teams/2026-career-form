# 2026 Career Form

채용 지원서 입력을 안전하게 보조하는 프로젝트다. 현재 저장소에는 팀의 Issue 기반 Codex 개발 하네스가 먼저 구성되어 있다.

## 시작하기

```bash
# Windows PowerShell
python harness/scripts/bootstrap.py
.venv/Scripts/python.exe harness/scripts/verify.py

# POSIX shell
python3 harness/scripts/bootstrap.py
.venv/bin/python harness/scripts/verify.py
```

Codex를 시작한 뒤 프로젝트 훅이 검토 대상으로 표시되면 `/hooks`에서 `.codex/hooks.json`의 내용을 확인하고 신뢰한다.

## 작업 흐름

1. 사람이 GitHub Project draft를 만든다.
2. Codex에서 `$cf-issue-lifecycle <draft 제목>`을 실행한다.
3. Codex가 `cf-project-issue-planning`으로 Issue 계약을 제안하고 사람 승인에서 멈춘다.
4. 승인 뒤 `cf-issue-workflow`가 구현, 검증, 리뷰와 Draft PR을 진행한다.
5. 사람이 최종 리뷰하고 머지한다.
6. Codex가 `cf-post-merge-cleanup`으로 검증된 로컬 작업 자원을 정리한다.

세부 정책은 [하네스 안내](harness/README.md)와 [설계 문서](docs/design/issue-based-ai-development-harness.md)를 참고한다.
