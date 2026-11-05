# 로컬 검증 환경 주의점

> Topic: verification-environment
> Status: Current
> Current: [CF-424 한글 worktree 경로의 compose 계약 테스트 실패](../../raw/issues/CF-424/documents/verification-environment.md)
> History: [CF-424 한글 worktree 경로의 compose 계약 테스트 실패](../../raw/issues/CF-424/documents/verification-environment.md)
> Updated: 2026-11-05

## 현재 상태

worktree 경로에 한글이 있으면 `verify.py`의 infra compose 계약 테스트가 `project name must not be empty`로 실패한다. 코드 결함이 아니며 `COMPOSE_PROJECT_NAME`을 영문 값으로 지정해 다시 실행하면 통과한다. 이렇게 실행했다면 검증 기록에 함께 적는다.

## 변경 이유

CF-424 검증 중 한글 이름 worktree에서 변경과 무관한 실패를 관찰해 원인과 우회 방법을 기록했다.
