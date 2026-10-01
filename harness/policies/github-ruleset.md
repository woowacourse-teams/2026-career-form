# GitHub Ruleset 적용안

이 문서는 저장소 파일만으로 만들 수 없는 GitHub 서버 설정의 체크리스트다. 저장소
관리자가 `main`, `develop`, `release/*` 대상 Ruleset에 적용한다.

## 공통 보호

- 브랜치 삭제와 force push를 금지한다.
- 직접 push를 금지하고 Pull Request를 요구한다.
- 필수 상태 검사가 최신 커밋에서 통과해야 한다.
- 대화가 해결되어야 머지할 수 있게 한다.
- 관리자 우회는 장애 복구 담당자에게만 허용한다.

## `develop`

- 필수 검사: `PR 계약`, `품질 게이트`, `공유 파일 계약`
- 승인 리뷰 1개를 요구한다.
- `CF-*` 작업 PR은 Squash Merge를 사용한다.
- `release/*` 동기화와 hotfix의 `main` 동기화는 Merge Commit을 사용한다.
- 공유 보호 영역은 `harness-change` 라벨과 다른 팀원 1명의 리뷰를 요구한다.

## `release/*`

- 필수 검사: `PR 계약`, `품질 게이트`, `공유 파일 계약`
- 승인 리뷰 1개를 요구한다.
- `CF-*` 릴리스 수정은 Squash Merge를 사용한다.
- `main`에서 오는 hotfix 동기화만 Merge Commit을 사용한다.
- Start release는 현재 `develop` HEAD에서 만들고 활성 release 브랜치는 하나만 둔다.

## `main`

- 필수 검사: `PR 계약`, `품질 게이트`, `공유 파일 계약`
- 승인 리뷰 1개를 요구한다.
- `release/*` 배포와 `revert/*` 되돌림은 Merge Commit을 사용한다.
- `hotfix/CF-*`에서 오는 운영 긴급 수정만 Squash Merge로 허용한다.
- 일반 `CF-*`에서 오는 직접 병합은 허용하지 않는다.
- 임의의 `develop` → `main`은 허용하지 않는다.

## 사람이 확인할 항목

- `PR 계약` 검사가 head/base, 제목, Issue 종료 계약을
  통과했는지 확인한다.
- release·동기화·revert 시스템 PR은 `[Release]` 제목이며 Issue를 종료하지 않는다.
- Ruleset만으로 경로별 Squash/Merge Commit을 완전히 강제할 수 없으면 머지 담당자가
  경로별 방식을 확인한다.
- 실제 Ruleset 변경, Start release, 승인, 병합, 브랜치 삭제는 사람이 수행한다.

## CODEOWNERS

초기 운영에서는 사용하지 않는다. 현재 Ruleset의 사람 승인 1명과 `harness-change` 라벨 검사로 시작한다. 특정 경로의 리뷰가 반복해서 누락되거나 담당 영역이 고정되면 CODEOWNERS와 코드 소유자 승인을 함께 도입한다.
