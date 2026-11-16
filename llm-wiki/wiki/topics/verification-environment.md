# 로컬 검증 환경 주의점

> Topic: verification-environment
> Status: Current
> Current: [CF-458 verify.py infra 테스트의 Docker 의존](../../raw/issues/CF-458/documents/verify-docker-dependency.md)
> History: [CF-424 한글 worktree 경로의 compose 계약 테스트 실패](../../raw/issues/CF-424/documents/verification-environment.md); [CF-458 verify.py infra 테스트의 Docker 의존](../../raw/issues/CF-458/documents/verify-docker-dependency.md)
> Updated: 2026-11-16

## 현재 상태

worktree 경로에 한글이 있으면 `verify.py`의 infra compose 계약 테스트가 `project name must not be empty`로 실패한다. 코드 결함이 아니며 `COMPOSE_PROJECT_NAME`을 영문 값으로 지정해 다시 실행하면 통과한다. 이렇게 실행했다면 검증 기록에 함께 적는다.

`verify.py`의 infra 테스트 중 MongoDB 모니터링·백업 알림 규칙 테스트는 `docker run`으로 promtool을 실행하고 건너뛰기 조건이 없어, Docker가 꺼져 있으면 코드와 무관하게 실패한다. 2026-11-16 develop 기준 복제본에서 18개가 docker API 연결 실패로 떨어졌다. Docker를 켠 뒤 실행하고, 켤 수 없으면 통과로 쓰지 않고 환경 실패로 그대로 기록한다([CF-458 근거](../../raw/issues/CF-458/documents/verify-docker-dependency.md)).

## 변경 이유

CF-424 검증 중 한글 이름 worktree에서 변경과 무관한 실패를 관찰해 원인과 우회 방법을 기록했다. CF-458 계약 점검 중 Docker가 꺼진 환경에서 같은 종류의 무관한 실패를 관찰해 원인과 기록 방법을 더했다.
