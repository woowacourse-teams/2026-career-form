# 2026 Career Form

채용 지원서 입력을 안전하게 보조하는 프로젝트다. 현재 저장소에는 팀의 Issue 기반 Codex 개발 하네스가 먼저 구성되어 있다.

## 시작하기

```bash
harness/scripts/bootstrap.py
harness/scripts/verify.py
```

Codex를 시작한 뒤 프로젝트 훅이 검토 대상으로 표시되면 `/hooks`에서 `.codex/hooks.json`의 내용을 확인하고 신뢰한다.

## 작업 흐름

1. GitHub Issue Form으로 작업 계약을 작성한다.
2. 사람이 범위와 완료 기준을 확인하고 `status:ready` 라벨을 붙인다.
3. Codex에서 `$issue-workflow #<Issue 번호>`를 실행한다.
4. Codex가 구현, 검증, 자체 리뷰 후 Draft PR을 만든다.
5. 사람이 최종 리뷰하고 머지한다.

세부 정책은 [하네스 안내](harness/README.md)와 [설계 문서](docs/design/issue-based-ai-development-harness.md)를 참고한다.
