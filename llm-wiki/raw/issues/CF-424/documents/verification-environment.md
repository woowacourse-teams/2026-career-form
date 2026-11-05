# 한글 worktree 경로의 compose 계약 테스트 실패

> Issue: [CF-424](https://github.com/woowacourse-teams/2026-career-form/issues/424)
> Collected: 2026-11-05
> Approval-Digest: 3b9b97a2d043c27abace35945afdfd658744d1f1284936d895a498b3409d7548
> Source-Revision: 34b09299

## 관찰

worktree 디렉터리 이름이 한글(예: `랜딩페이지-수정`)이면 `harness/scripts/verify.py`가 실행하는 `infra/tests/test_compose_contract.py`의 deploy overlay 테스트 4개가 `project name must not be empty`로 실패한다. docker compose가 디렉터리 이름에서 프로젝트 이름을 만들 때 허용 문자만 남겨 빈 값이 되기 때문이다.

## 대응

코드 결함이 아니다. `COMPOSE_PROJECT_NAME`을 영문 값으로 지정하고 다시 실행하면 같은 테스트와 전체 검증이 통과한다. 검증 기록에는 이 환경 변수를 지정했다는 사실을 함께 남긴다.
