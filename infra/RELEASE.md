# 릴리스 브랜치 유지와 정리

`release/*`는 main 병합 이후에도 운영 배포와 develop 동기화가 끝날 때까지 유지한다.
release → main과 release → develop은 기존 규약대로 **Merge Commit**을 사용한다.

## 관리자가 적용할 설정

Settings → General → Pull Requests에서 **Automatically delete head branches**를
해제한다. 저장소 전체 설정이므로 일반 `CF-*` 기능 브랜치도 자동 삭제되지 않는다.
기능 PR 담당자는 병합 완료를 확인한 뒤 자신의 작업 브랜치를 정리한다.

읽기 전용 확인:

```sh
gh api repos/woowacourse-teams/2026-career-form --jq .delete_branch_on_merge
```

결과가 `false`여야 한다. 이 문서를 추가하는 PR만으로 원격 설정이 바뀌지는 않는다.
설정 해제는 다음 release → main 병합 전에 적용한다.

main/develop 삭제 금지와 기존 PR 보호는 유지한다. release 삭제를 차단하는 Ruleset이
있다면 관리자가 기존 완료 워크플로의 삭제 권한을 함께 확인한다. 삭제 거절을 숨기거나
이 작업에서 보호 규칙을 일괄 해제하지 않는다.

## 두 Actions 실행 경계

1. 사람이 release → main PR을 병합하면 `deploy-production.yml`이 실행된다.
2. 운영 배포 성공 후 `release-success`가 버전 태그를 처리하고 원래 release SHA를
   최신 develop 이력과 비교한다.
   - 미반영 커밋이 있으면 release → develop PR을 만든 뒤 실행을 끝낸다.
     동일한 열린 PR이 있으면 중복 생성하지 않는다.
   - 이미 반영됐다면 PR을 만들지 않고 release를 자동 삭제한 뒤 끝낸다.
3. 동기화 PR이 생성된 경우, 사람이 이를 병합하면 별도 실행인
   `complete-release-sync.yml`이 release를 자동 삭제한다.
   병합 없이 닫힌 PR, main 대상 PR, 외부 저장소의 head는 정리하지 않는다.

두 삭제 경로는 현재 원격 SHA가 검증한 SHA와 같을 때만 동작한다. Git의 명시적
`--force-with-lease=<ref>:<sha>` 조건을 **삭제 refspec**과 함께 사용하므로,
확인 이후 새 커밋이 올라와도 서버가 삭제를 거절한다. 브랜치 이력을 덮어쓰지 않는다.

## 오류와 재실행

- 배포 실패·취소·건너뜀: 배포 후 정리를 실행하지 않는다.
- 미반영 커밋이 있는데 release가 없음: 자동 삭제 설정과 원래 release SHA를 안내하고
  실패한다. 새 브랜치를 임의로 만들지 않는다.
- 원격 release SHA가 달라짐: 새 변경을 보존하고 실패한다. 운영자가 추가 커밋의
  배포·동기화 필요 여부를 확인한다.
- 이미 삭제됨: 동기화 PR 완료 경로는 성공한다. 배포 후 경로는 해당 SHA가 develop에
  포함된 사실까지 확인해야 성공한다.
- 원격 접근, fetch, 권한, push 오류: 실패로 드러낸다. 브랜치 부재로 간주하지 않는다.

내용만 같은 squash/cherry-pick은 커밋 포함 관계로 판정하지 않는다. 동기화는 Merge
Commit 규약을 따른다. 버전 태그와 운영 배포 결과는 동기화 PR 생성 실패와 구분한다.

## 과거 실패 건과 적용 확인

실행 `36817879399`의 운영 배포와 `v1.0.0` 생성은 성공했다. 운영자는 PR #136의 원래
release head SHA와 최신 develop을 비교해 동기화 필요 여부를 판단한다. 필요한 경우에만
그 SHA에서 release 브랜치를 복원하고 동기화 PR을 처리한다. 배포 재실행을 기본 복구로
사용하지 않는다. 기존 실행을 재실행하면 당시 워크플로가 사용되므로 이번 코드가
자동으로 적용되지 않는다.

운영자가 다음 릴리스에서 main 병합 후 release 유지, 필요한 동기화 PR 생성,
develop 병합 후 삭제 또는 이미 반영된 경우 PR 없는 삭제를 확인한다.
실제 설정 변경·배포·승인·병합·수동 복구는 사람이 수행한다.
