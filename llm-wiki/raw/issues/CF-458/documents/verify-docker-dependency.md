# verify.py infra 테스트의 Docker 의존

> Issue: [CF-458](https://github.com/woowacourse-teams/2026-career-form/issues/458)
> Collected: 2026-11-16
> Approval-Digest: ea16894743540db9ef77644ebd4820e6b4fc14638c151f241aa10967d90036ff
> Source-Revision: aaffd610

[승인 후보 스냅샷](approved-candidates.md)의 후보 5를 적는다. 한글 worktree 경로의 compose 계약 테스트 실패와 `COMPOSE_PROJECT_NAME` 우회는 Supersedes가 가리키는 CF-424 근거를 따른다.

## 관찰 (후보 5)

- `verify.py`의 infra 테스트 중 MongoDB 모니터링·백업 알림 규칙 테스트는 `docker run`으로 promtool을 실행하고 건너뛰기 조건이 없다(`infra/tests/test_mongodb_monitoring_alerts.py:27` 등).
- 2026-11-16 develop 기준 복제본에서 Docker가 꺼져 있을 때 18개가 docker API 연결 실패로 떨어지는 것을 관찰했다. 코드 변경과 무관한 환경 실패다.

## 대응

- Docker를 켠 뒤 실행한다.
- 켤 수 없으면 통과로 쓰지 않고 환경 실패로 그대로 기록한다.
