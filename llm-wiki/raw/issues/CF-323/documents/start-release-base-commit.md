# 릴리스 시작 기준 커밋 선택

CF-327 운영 배포 파이프라인 근거와 CF-41 배포 운영 Runbook의 절차는 그대로 유지하고 Start release의 기준 커밋 선택만 바꾼다.

## 변경

| 이벤트 | 결과 |
|---|---|
| Start release 실행 | `ref`를 비우면 `develop` HEAD, 채우면 `develop` 이력 안의 지정 커밋으로 `release/<version>`과 main 대상 Draft PR을 생성한 뒤 staging workflow를 명시적으로 dispatch |

- `ref`는 선택 입력이며 7~40자리 커밋 SHA만 받는다. 대소문자는 구분하지 않는다.
- 브랜치를 만들기 전에 다음 값을 거부한다.
  - `develop`의 조상이 아닌 커밋
  - 존재하지 않거나 하나로 정해지지 않는 짧은 SHA
  - 브랜치 이름, `HEAD~1`처럼 SHA가 아닌 값
- 릴리스 Draft PR의 "어떻게 바꿨나요?"에 기준 출처(`develop HEAD` 또는 `지정 커밋`)와 전체 SHA를 기록한다.
- 활성 `release/*` 하나 규칙과 version 형식 검사는 바뀌지 않는다.

## 변경 이유

QA는 특정 develop 커밋을 기준으로 진행되지만 QA 중에도 develop에 새 커밋이 병합된다.
기존 Start release는 항상 `develop` HEAD를 사용해 QA를 거친 커밋으로 release 후보를
고정할 수 없었다. 기본값을 HEAD로 두어 기존 실행 방법은 유지한다.

## 근거

- `.github/workflows/start-release.yml`의 `기준 커밋 확인` step
- `infra/tests/test_workflow_contract.py`의 임시 Git 저장소 기준 커밋 판정 테스트
