# 배포 Runbook

> Topic: deployment-runbook
> Status: Current
> Current: [CF-337 정책 활성 버전은 배포 커밋의 seed를 따른다](../../raw/issues/CF-337/documents/policy-active-version-follows-seed.md)
> History: [근거 1](../../raw/issues/CF-41/documents/docs/operations/deployment-runbook.md); [CF-327 운영 배포 파이프라인 근거](../../raw/issues/CF-327/documents/deployment-pipeline.md); [CF-323 릴리스 시작 기준 커밋 선택](../../raw/issues/CF-323/documents/start-release-base-commit.md); [CF-333 정책 활성 버전과 배포 뒤 전환](../../raw/issues/CF-333/documents/policy-active-version-and-deploy.md); [CF-337 정책 활성 버전은 배포 커밋의 seed를 따른다](../../raw/issues/CF-337/documents/policy-active-version-follows-seed.md)
> Updated: 2026-10-24

## 현재 상태

운영 배포 파이프라인은 [CF-327 근거](../../raw/issues/CF-327/documents/deployment-pipeline.md)를 따른다. 운영 배포의 정본은 `.github/workflows/deploy-production.yml`과 `infra/scripts/*`의 구현이다. main push는 head ref로 분류한다. `release/<ver>`는 PR head tree와 main merge tree가 같아야 하고 staging이 push한 `<image>:<head sha>`의 digest를 재빌드 없이 재사용하며, 그 tag가 없으면 실패한다. 성공하면 annotated `v<ver>` tag를 만들고 release head가 develop 조상이 아니면 `[Release] <ver> 개발선 동기화` PR을 만든다. `hotfix/CF-*`는 main sha로 새 ARM64 이미지를 빌드해 직접 배포하고 main→develop(활성 release가 있으면 main→release) PR을 만들며 tag는 만들지 않는다. `revert/*` 병합은 image·deploy를 skip해 재배포하지 않는다. `deploy.sh`는 current-digest로 자동 rollback한 뒤에도 exit 1이라 `revert/<main-sha>` Draft PR이 생성되고, rollback 실패는 로그 문자열로만 구분된다.

Start release는 선택 입력 `ref`를 비우면 `develop` HEAD를, 채우면 `develop` 이력 안의 커밋 SHA를 release 기준으로 사용하고 기준 출처와 전체 SHA를 릴리스 Draft PR 본문에 기록한다. develop 조상이 아닌 커밋, 모호한 짧은 SHA, SHA가 아닌 값은 브랜치 생성 전에 거부한다. QA가 끝난 뒤 develop이 앞서 나가도 QA를 거친 커밋으로 release 후보를 고정할 수 있다([CF-323 근거](../../raw/issues/CF-323/documents/start-release-base-commit.md)).

릴리스 절차는 CF-41의 Release·Hotfix 순서(릴리스 시작 workflow → Draft PR·staging 확인 → health·수동 E2E → Ready·승인·Merge Commit → digest 확인 → tag·동기화 PR)를 유지하되, 병합 전에 staging 배포 SHA가 release head와 같은지, `origin/main`의 모든 커밋이 release에 포함됐는지, 운영 설정에 새 필수값이 없는지, 확장 보급이 끝났는지 확인한다. 병합은 Merge Commit만 쓴다. 병합 후에는 digest 일치, `v<ver>` tag, 동기화 PR Merge Commit, 스토어 확장으로 운영 스모크를 확인한다. 최초 배포, 진단 명령, DB host 점검은 CF-41 근거를 따른다.

확장 프로그램 릴리스는 [확장 프로그램 릴리스](extension-release.md), 확장과 백엔드의 배포 순서는 [확장·백엔드 호환 배포](release-compatibility.md), 설정 레버는 [CI/CD 설정](cicd-setup.md)을 따른다. 배포, 확장 게시, revert 승인과 수동 복구는 사람이 수행한다.

## 정책 활성 버전은 배포 커밋의 seed를 따른다 (2026-10-24)

정책 활성 버전은 회사 문서의 `activePolicyVersion`에 있고, 정본은 DB가 아니라 배포 커밋의 seed다. CF-337부터 기동 seeder는 정책 문서를 insert-only로 먼저 넣은 뒤 회사 문서의 활성 버전을 seed 값과 같게 맞춘다(올림·내림 모두, 같으면 쓰기 없음, 프로필 무관). 배포 워크플로우가 develop→dev, `release/**`→staging, main→운영으로 나뉘어 있으므로 각 환경은 자기 배포 커밋의 버전을 주고, develop이 앞서 가도 운영은 다음 릴리스까지 머물며, 롤백 재배포 시 함께 되돌아간다. 운영 배포 승인이 전환 승인이고 수동 Mongo 전환 절차는 폐기한다. 사람이 DB에서 바꾼 값은 다음 기동에서 되돌아간다. 릴리스 점검의 4값 대조(배포 커밋, seed 버전, DB 버전, API 응답) 중 seed·DB 버전은 `GET /api/v1/policy-versions`의 `inSync`로 읽고, `inSync: false`가 남으면 기동 로그의 `POLICY_ACTIVE_VERSION … missing-policy`를 찾는다. 정책 내용을 바꾸면 버전 번호를 올리고 seed에는 활성 버전의 정책 문서를 항상 포함한다. CF-333까지의 수동 전환 경위는 [CF-333 근거](../../raw/issues/CF-333/documents/policy-active-version-and-deploy.md)에 있다. 근거는 [CF-337 정책 활성 버전은 배포 커밋의 seed를 따른다](../../raw/issues/CF-337/documents/policy-active-version-follows-seed.md)를 따른다.

## 변경 이유

CF-41 Runbook은 workflow가 완성되기 전 설계 기준으로 쓰여 hotfix 무태그, revert 무배포, staging digest 조회 실패 조건, tree 일치 검사의 전제(main⊆release)가 빠져 있었고 2026-08-22 이후 갱신되지 않았다. 1.4.0 릴리스 준비에서 workflow 11개와 스크립트를 대조해 구현 기준으로 정정하고 릴리스 점검표를 추가했다. CF-323에서 Start release에 기준 커밋 선택을 추가했고 기본값은 develop HEAD로 유지했다. CF-337에서 seeder가 활성 버전을 배포 커밋의 seed에 맞추게 되어 운영 수동 전환 절차를 폐기했다.

## 관련 지식

- [확장 프로그램 릴리스](extension-release.md)
- [확장·백엔드 호환 배포](release-compatibility.md)
- [CI/CD 설정](cicd-setup.md)
- [릴리스 브랜치 유지와 정리](release-branch-lifecycle.md)
- [시스템 PR 공유 파일 검사와 릴리스 본문 계약](release-pr-contract.md)
- Wiki 밖 정본: [브랜치와 환경](../../../harness/policies/environments.md), [GitHub Ruleset](../../../harness/policies/github-ruleset.md), [GitHub 설정 체크리스트](../../../harness/policies/github-setup.md), [릴리스 브랜치 유지와 정리 운영 안내](../../../infra/RELEASE.md). 서술이 workflow와 다르면 workflow가 정본이며 파일 수정은 해당 보호 영역의 별도 Issue로 다룬다.
