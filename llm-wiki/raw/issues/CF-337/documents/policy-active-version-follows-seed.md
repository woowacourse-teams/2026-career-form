# 정책 활성 버전은 배포 커밋의 seed를 따른다: 환경별 흐름과 4값 대조

> Issue: CF-337
> Collected: 2026-10-24
> Approval-Digest: 6c29dfc9ca6d0ca7fea721df4041a85987539e910dbf6c16e0678d96f4e27af0
> Source-Revision: 7fd5b6880e7725ee903a16dd0d2c38f2b486d792

이 문서는 2026-10-24 seeder 활성 정책 버전 동기화에서 승인된 CF-337 후보 1·2를 배포 runbook 관점에서 수집한 기록이다. Approval-Digest는 [승인 후보 스냅샷](approved-candidates.md) 전체 UTF-8 바이트의 SHA-256이다. 배포 파이프라인 자체는 바꾸지 않으며, 바꾸지 않은 내용은 Supersedes가 가리키는 CF-333 근거와 그 앞의 CF-323·CF-327 근거를 따른다. 호스트 주소, 계정, 시크릿은 포함하지 않는다.

## 승인 후보

1. 정책 활성 버전의 정본은 DB가 아니라 배포 커밋의 seed다. 기동 seeder가 모든 환경에서 DB 활성 버전을 seed와 같게 맞춘다.
2. 릴리스 4값 대조 중 seed·DB 버전은 `GET /api/v1/policy-versions`로 읽는다. 정책 내용을 바꾸면 버전을 올리고, seed에는 활성 버전의 정책 문서를 항상 포함한다.

## 근거

- CF-333까지 기동 seeder는 정책·provider·회사 문서를 DB에 없을 때만 삽입해, 기존 DB의 `form_analysis_companies.activePolicyVersion`은 어떤 환경에서도 바뀌지 않았다. 새 버전이 develop에 들어가도 dev DB는 옛 버전을 줬고, 사람이 Mongo 셸로 바꿨다(CF-333 근거).
- CF-337부터 `StartupPolicySeeder`는 정책 문서와 provider는 종전대로 insert-only로 먼저 넣고, 회사 문서는 없으면 삽입, 있으면 `activePolicyVersion`을 seed 값과 같게 맞춘다. 올림과 내림을 모두 적용하고 같으면 쓰지 않는다. 프로필(dev·staging·prod)에 따른 차이가 없다. seed가 가리키는 정책 문서가 DB에 없으면 바꾸지 않고 `POLICY_ACTIVE_VERSION … result=missing-policy` 경고를 남기며, 전환하면 회사별 전후 버전을 `result=updated`로 남긴다.
- 배포 워크플로우는 develop push→dev, `release/**` push→staging, main push→prod로 나뉘어 있으므로, DB가 배포 커밋의 seed를 따르면 환경별 버전 흐름이 추가 장치 없이 성립한다. develop에서 v18인 커밋으로 release를 만들면 staging은 v18, main 병합 뒤 운영은 v18이고, 그 사이 develop이 v20까지 가도 운영은 다음 릴리스까지 v18에 머문다. 이전 커밋을 재배포하면 DB도 그 커밋의 버전으로 돌아간다.
- 운영 배포는 `environment: production` 승인을 거치므로 그 승인이 활성 버전 전환 승인이다. 사람이 DB에서 활성 버전을 바꿔 두면 다음 기동에서 seed 값으로 되돌아가므로, 수동 Mongo 전환은 더 하지 않는다.
- `GET /api/v1/policy-versions`는 seed의 회사 목록을 기준으로 회사별 `seedActiveVersion`(배포 커밋), `activeVersion`(DB, 없으면 null), `inSync`를 돌려준다.
- 정책 문서는 insert-only이므로 같은 버전 번호의 내용을 고쳐도 DB의 기존 문서는 갱신되지 않는다. 정책 내용을 바꾸면 버전 번호를 올려야 하고, seed 파일에는 각 회사 활성 버전의 정책 문서가 항상 들어 있어야 한다(`StartupPolicySeederTest`가 seed 자기 일관성을 검사한다).

## 쓰임

- 릴리스 점검표의 4값 대조는 배포 커밋의 seed 버전과 DB 활성 버전을 `GET /api/v1/policy-versions`의 `inSync`로 확인하고, API 응답(SK 응답에 `eduhgEducationStatus`가 있으면 v38)으로 마무리한다.
- 운영 전환 수동 절차는 폐기한다. 배포 직후 `inSync: false`가 남아 있으면 기동 로그의 `POLICY_ACTIVE_VERSION` 줄에서 `missing-policy`를 찾는다. seed에 그 버전의 정책 문서가 빠진 경우다.
- 새 정책 버전 검증은 종전처럼 새 볼륨 로컬 스택이나 dev 배포로 한다. dev DB도 배포가 맞추므로 사람이 바꿀 필요가 없다.
