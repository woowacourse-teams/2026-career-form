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

## 로컬 백엔드 실행

팀 내부의 승인된 비공개 채널에서 공유받은 `.env.local`을 저장소 루트에 둔 뒤 로컬 Spring과 MongoDB를 함께 실행한다. 이 파일은 Git에 포함하지 않는다.

```bash
# macOS
python3 scripts/local.py

# Windows PowerShell
py scripts/local.py
```

인자 없는 실행은 `up`과 같다. 같은 스크립트에서 다음 명령을 사용할 수 있다.

```bash
python3 scripts/local.py status
python3 scripts/local.py logs
python3 scripts/local.py down
```

Windows에서는 `python3` 대신 `py`를 사용한다. `down`은 MongoDB named volume을 삭제하지 않는다. 자세한 프로파일, Docker, MongoDB 계약은 [백엔드 안내](backend/README.md)를 참고한다.

## 작업 흐름

1. 사람이 GitHub Project draft를 만든다.
2. Codex에서 `$cf-issue-lifecycle <draft 제목>`을 실행한다.
3. Codex가 `cf-project-issue-planning`으로 Issue 계약을 제안하고 사람 승인에서 멈춘다.
4. 승인 뒤 `cf-issue-workflow`가 구현, 검증, 리뷰와 Draft PR을 진행한다.
5. 사람이 최종 리뷰하고 머지한다.
6. Codex가 `cf-post-merge-cleanup`으로 검증된 로컬 작업 자원을 정리한다.

세부 정책은 [하네스 안내](harness/README.md)와 [Issue 개발 흐름 Wiki](llm-wiki/wiki/topics/issue-development-workflow.md)를 참고한다.
