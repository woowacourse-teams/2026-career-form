# 운영 배포 파이프라인의 workflow 구현 기준

> Issue: CF-327
> Collected: 2026-10-23
> Approval-Digest: 460019c1c58c3248f460202a9b0e81f8fa783ffef0981abc96f7bccb2ae237f0
> Source-Revision: 82bcb5cd7e384096ee9b6f70e7f71803ed561af6

이 문서는 2026-10-23에 승인된 CF-327 후보 1을 수집한 기록이다. Approval-Digest는 [승인 후보 스냅샷](approved-candidates.md) 전체 UTF-8 바이트의 SHA-256이다. CF-41 배포 Runbook의 Release·Hotfix 절차와 rollback 설명 가운데 workflow 구현과 다르거나 빠진 부분을 정정·보강하며, 바꾸지 않은 절차(최초 배포, 진단 명령, DB host 점검)는 Supersedes가 가리키는 CF-41 문서를 따른다. 운영 host 주소, 포트 값, 시크릿 값은 기록하지 않는다.

## 승인 후보

운영 배포 흐름은 workflow 구현이 정본이다. main push는 head ref로 분류한다: `release/<ver>`→release, `hotfix/CF-N`→hotfix, `revert/<sha>`→revert, 그 외는 실패. release는 PR head tree와 main merge tree가 같아야 하고, staging이 push한 `<image>:<head sha>`의 digest를 재사용하며(재빌드 없음) 그 tag가 없으면 실패한다. 성공 시 annotated `v<ver>` tag를 만들고 release head가 develop 조상이 아니면 `[Release] <ver> 개발선 동기화` PR을 만든다. hotfix는 main sha로 새 ARM64 이미지를 빌드해 직접 배포하고 main→develop(활성 release가 있으면 main→release) PR을 만들며 tag는 만들지 않는다. `revert/*` 병합은 image·deploy를 skip해 재배포하지 않는다. deploy.sh는 current-digest로 자동 rollback한 뒤에도 exit 1이라 `revert/<main-sha>` Draft PR이 생성되고, rollback 실패는 로그 문자열로만 구분된다. 릴리스 점검표: 병합 전(staging 배포 SHA=release head, staging E2E, main 커밋이 모두 release에 포함, 운영 설정 변경 여부, 확장 보급), 병합(Merge Commit만), 병합 후(digest 일치, `v<ver>` tag, 동기화 PR Merge Commit, 스토어 확장으로 운영 스모크).

## main 병합 분류

`.github/workflows/deploy-production.yml`의 `classify` job은 push 이벤트와 `commits/{sha}/pulls` 조회 결과를 `infra/scripts/classify-main-merge.py`에 넘긴다. 스크립트는 ref가 `refs/heads/main`인지, push된 sha가 정확히 한 PR의 merge commit인지, 그 PR의 base가 main이고 병합됐는지 확인한 뒤 head ref 이름으로 분류한다.

| head ref | kind | 이후 경로 |
|---|---|---|
| `release/MAJOR.MINOR.PATCH` | release | tree 일치 검사 → staging digest 재사용 → 배포 → tag·동기화 PR |
| `hotfix/CF-<번호>` | hotfix | 새 ARM64 빌드 → 배포 → main→develop·활성 release PR |
| `revert/<sha>` | revert | image·deploy skip, 재배포 없음 |
| 그 외 | 실패 | workflow 중단 |

분류는 head ref 이름 패턴만 본다. 일반 `CF-*` 브랜치가 main에 병합되면 workflow가 실패하므로 Ruleset이 main 직접 병합을 막는 것과 함께 이중 보호다.

## release 경로

1. **tree 일치 검사.** `image` job이 `git diff --quiet <PR head sha>^{tree} <main merge sha>^{tree}`로 release PR head의 tree와 main merge commit의 tree를 비교한다. main에 release에 없는 커밋(동기화되지 않은 hotfix 등)이 있으면 merge tree가 달라져 실패한다. 따라서 release를 main에 병합하기 전에 `origin/main`의 모든 커밋이 release 브랜치에 포함돼 있어야 한다.
2. **digest 재사용.** `docker buildx imagetools inspect <DOCKERHUB_IMAGE>:<PR head sha>`로 staging workflow가 push한 이미지의 digest를 읽는다. 운영은 이 digest를 그대로 배포하며 재빌드하지 않는다. staging push가 실패했거나 PR 병합 시점 head가 staging이 빌드한 커밋과 다르면 tag가 없어 조회가 실패하고 workflow가 중단된다. 오류 메시지는 digest를 확인할 수 없다는 내용뿐이다.
3. **배포.** `deploy` job이 production self-hosted runner에서 `infra/scripts/deploy.sh`를 실행한다. environment는 `production`, profile은 `prod`다.
4. **성공 후.** `release-success` job이 annotated `v<version>` tag를 push한다. tag가 이미 있으면 같은 커밋을 가리킬 때만 통과한다. 이어 `infra/scripts/release-sync.py prepare`가 release head가 `origin/develop`의 조상이면 release 브랜치를 삭제하고 끝내고, 아니면 `[Release] <ver> 개발선 동기화` PR(base develop, head release)을 연다. 사람이 이 PR을 Merge Commit으로 병합하면 `complete-release-sync.yml`이 release 브랜치를 lease 확인 뒤 삭제한다.

## hotfix 경로

`hotfix/CF-<번호>`를 main에 Squash Merge하면 `image` job이 QEMU로 main merge sha의 새 ARM64 이미지를 빌드해 push하고 그 digest를 배포한다. tree 비교와 staging digest 재사용은 없다. 성공하면 `hotfix-success` job이 `[Release] hotfix 개발선 동기화` PR(main→develop)을 만들고, 활성 `release/*`가 하나 있으면 `[Release] hotfix 활성 릴리스 동기화` PR(main→release)도 만든다. release 브랜치가 둘 이상이면 실패한다. **hotfix 경로는 tag를 만들지 않는다.** 버전 이력을 tag로 남기려면 다음 release에서 포함된다.

## revert 경로

운영 배포 실패 시 `revert` job이 `revert/<main merge sha>` 브랜치와 Draft PR을 만든다(merge commit이면 `git revert -m 1`). 이 PR을 main에 병합하면 classify가 `revert`로 분류해 image·deploy를 모두 skip하므로 **재배포가 일어나지 않는다.** 서버는 deploy.sh의 자동 rollback으로 이미 직전 digest 상태이고, revert 병합은 main 소스를 그 상태에 맞추는 것이다. 사람은 CF-41 Runbook의 revert 승인 조건(서버 복구 확인, 실패 변경만 취소, DB·외부 상태 변경 없음, 원인 기록)을 확인한 뒤에만 병합한다.

## deploy.sh와 자동 rollback

`infra/scripts/deploy.sh`는 digest 고정 이미지를 pull하고 `compose config --quiet`로 검증한 뒤 `up --detach --no-build backend`를 실행하고 loopback `/actuator/health`를 반복 확인한다. 성공하면 `current-digest`와 `previous-digest` 상태 파일을 갱신한다. readiness가 실패하면 기존 `current-digest`로 재배포해 readiness를 다시 확인하고, **rollback이 성공해도 exit 1**로 끝나 workflow는 실패 상태를 유지하며 그 결과 `revert` job이 Draft PR을 만든다. rollback 자체가 실패하면 로그의 `manual recovery is required` 문자열로만 구분되고 사람이 복구한다.

## 릴리스 점검표

**병합 전**

- staging 최신 배포 run의 SHA가 release 브랜치 head와 같고 성공했다.
- staging에서 `/actuator/health`가 `UP`이고 사람이 수동 E2E를 수행했다.
- `git merge-base --is-ancestor origin/main origin/release/<ver>`가 참이다(tree 일치 검사 통과 조건).
- release가 새로 읽는 설정이 있는지 `infra/compose.deploy.yaml`, `infra/scripts/deploy.sh`, `backend/src/main/resources/application*.yml`, deploy workflow를 main과 diff했다. 새 필수값이 있으면 GitHub Environment와 전달 경로를 먼저 갖춘다.
- 확장 프로그램이 새 백엔드를 전제로 한다면 [확장·백엔드 호환 배포](release-compatibility.md) 순서대로 확장 게시와 보급 확인을 먼저 끝냈다.

**병합**

- PR을 Ready로 전환하고 승인받은 뒤 **Merge Commit**으로만 병합한다. classify와 tree 검사는 병합 방식을 보지 않고 PR의 merge commit sha와 head sha만 비교하므로 Squash로 병합해도 배포 자체는 성공한다(1.2.0·1.3.0 선례). 그러나 Squash는 main을 release·develop의 조상이 아니게 만들어 다음 릴리스에서 main을 release에 수동 병합해 이력을 이어야 하고(1.4.0의 `chore: 릴리스 소스 유지와 main 병합 이력 연결`), `harness/policies/github-ruleset.md`가 정한 release→main Merge Commit 정책과도 어긋난다. 저장소 설정은 세 병합 방식을 모두 허용하므로 병합 담당자가 지킨다. Merge Commit이어도 `git log --first-parent main`은 릴리스마다 한 줄만 보여 준다.

**병합 후**

- `운영 환경 배포` run이 staging과 같은 digest를 사용했고 readiness가 성공했다.
- `v<ver>` tag가 생성됐다.
- `[Release] <ver> 개발선 동기화` PR을 Merge Commit으로 병합했고 release 브랜치가 정리됐다.
- 스토어에서 설치한 확장으로 운영 대상 자동 기입을 한 번 실행하고 품질 관측에 새 `extensionVersion`이 기록된다.

## 근거

- `.github/workflows/deploy-production.yml`: classify, image(tree 검사·digest 조회·hotfix 빌드), deploy, revert, release-success, hotfix-success, revert-aligned job
- `.github/workflows/deploy-staging.yml`, `.github/workflows/start-release.yml`, `.github/workflows/complete-release-sync.yml`
- `infra/scripts/classify-main-merge.py`, `infra/scripts/release-sync.py`, `infra/scripts/deploy.sh`
- `infra/RELEASE.md`, `harness/policies/github-ruleset.md`
