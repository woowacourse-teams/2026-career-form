# 시스템 PR 공유 파일 검사와 릴리스 본문 계약

## 공유 파일 검사

공유 파일 검사는 실제 PR head/base와 기존 validate_branch_flow, is_system_pr 기준을 사용한다. 허용된 release, main 동기화, revert 시스템 PR에는 harness-change 라벨과 연결 Issue를 요구하지 않고, 일반 및 hotfix 작업에는 기존 보호를 유지한다. 누락되거나 잘못된 브랜치 정보는 거부한다.

## 릴리스 생성 본문

start-release가 생성하는 시스템 PR 본문은 현재 여섯 리뷰 섹션과 접힌 자동 및 수동 검증 기록을 갖춘다. Issue 종료 참조를 추가하지 않으며, 생성 시점에 수행하지 않은 검증은 미완료로 기록한다. 실제 생성 스크립트의 본문을 validate_pr로 검증한다.

## 구현 근거

- `harness/lib/shared_files.py`: validate_shared_file_change의 중앙 브랜치 검증과 시스템 PR 분류.
- `harness/scripts/validate-shared-files.py`와 `.github/workflows/shared-files.yml`: 실제 head/base 수집과 누락 입력 거부.
- `.github/workflows/start-release.yml`: 현재 PR 계약에 맞춘 생성 본문.
- `harness/tests/test_shared_files.py`, `harness/tests/test_shared_files_cli.py`: 시스템 PR 허용, 일반 및 hotfix 보호, 잘못된 입력 회귀.
- `infra/tests/test_workflow_contract.py`: git과 gh를 모의 실행하고 생성 본문을 실제 validate_pr에 전달.

실제 릴리스 생성, 배포와 GitHub CI 확인은 이 로컬 검증과 구분한다.
