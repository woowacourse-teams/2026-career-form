# 배포 Runbook

> Topic: deployment-runbook
> Status: Current
> Current: [CF-327 운영 배포 파이프라인 근거](../../raw/issues/CF-327/documents/deployment-pipeline.md)
> History: [근거 1](../../raw/issues/CF-41/documents/docs/operations/deployment-runbook.md); [CF-327 운영 배포 파이프라인 근거](../../raw/issues/CF-327/documents/deployment-pipeline.md)
> Updated: 2026-10-23

## 현재 상태

운영 배포의 정본은 `.github/workflows/deploy-production.yml`과 `infra/scripts/*`의 구현이다. main push는 head ref로 분류한다. `release/<ver>`는 PR head tree와 main merge tree가 같아야 하고 staging이 push한 `<image>:<head sha>`의 digest를 재빌드 없이 재사용하며, 그 tag가 없으면 실패한다. 성공하면 annotated `v<ver>` tag를 만들고 release head가 develop 조상이 아니면 `[Release] <ver> 개발선 동기화` PR을 만든다. `hotfix/CF-*`는 main sha로 새 ARM64 이미지를 빌드해 직접 배포하고 main→develop(활성 release가 있으면 main→release) PR을 만들며 tag는 만들지 않는다. `revert/*` 병합은 image·deploy를 skip해 재배포하지 않는다. `deploy.sh`는 current-digest로 자동 rollback한 뒤에도 exit 1이라 `revert/<main-sha>` Draft PR이 생성되고, rollback 실패는 로그 문자열로만 구분된다.

릴리스 절차는 CF-41의 Release·Hotfix 순서(릴리스 시작 workflow → Draft PR·staging 확인 → health·수동 E2E → Ready·승인·Merge Commit → digest 확인 → tag·동기화 PR)를 유지하되, 병합 전에 staging 배포 SHA가 release head와 같은지, `origin/main`의 모든 커밋이 release에 포함됐는지, 운영 설정에 새 필수값이 없는지, 확장 보급이 끝났는지 확인한다. 병합은 Merge Commit만 쓴다. 병합 후에는 digest 일치, `v<ver>` tag, 동기화 PR Merge Commit, 스토어 확장으로 운영 스모크를 확인한다. 최초 배포, 진단 명령, DB host 점검은 CF-41 근거를 따른다.

확장 프로그램 릴리스는 [확장 프로그램 릴리스](extension-release.md), 확장과 백엔드의 배포 순서는 [확장·백엔드 호환 배포](release-compatibility.md), 설정 레버는 [CI/CD 설정](cicd-setup.md)을 따른다. 배포, 확장 게시, revert 승인과 수동 복구는 사람이 수행한다.

## 변경 이유

CF-41 Runbook은 workflow가 완성되기 전 설계 기준으로 쓰여 hotfix 무태그, revert 무배포, staging digest 조회 실패 조건, tree 일치 검사의 전제(main⊆release)가 빠져 있었고 2026-08-22 이후 갱신되지 않았다. 1.4.0 릴리스 준비에서 workflow 11개와 스크립트를 대조해 구현 기준으로 정정하고 릴리스 점검표를 추가했다.

## 관련 지식

- [확장 프로그램 릴리스](extension-release.md)
- [확장·백엔드 호환 배포](release-compatibility.md)
- [CI/CD 설정](cicd-setup.md)
- [릴리스 브랜치 유지와 정리](release-branch-lifecycle.md)
- [시스템 PR 공유 파일 검사와 릴리스 본문 계약](release-pr-contract.md)
- Wiki 밖 정본: [브랜치와 환경](../../../harness/policies/environments.md), [GitHub Ruleset](../../../harness/policies/github-ruleset.md), [GitHub 설정 체크리스트](../../../harness/policies/github-setup.md), [릴리스 브랜치 유지와 정리 운영 안내](../../../infra/RELEASE.md). 서술이 workflow와 다르면 workflow가 정본이며 파일 수정은 해당 보호 영역의 별도 Issue로 다룬다.
