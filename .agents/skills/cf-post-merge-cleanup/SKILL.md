---
name: cf-post-merge-cleanup
description: GitHub PR 머지 뒤 연결 Issue, origin/develop 포함 관계, CF 브랜치와 worktree 상태를 검증하고 안전한 대상만 멱등적으로 정리한다. 사용자가 "머지했어", "브랜치와 worktree 정리해줘", "Issue 작업 종료해줘"처럼 CF 작업의 사후 정리를 요청할 때 사용한다.
metadata:
  calls: []
  portable: true
  external_dependencies: []
---

# CF Post Merge Cleanup

머지 사실을 추정하지 않고 원격 상태와 Git 포함 관계를 증명한 뒤 안전한 로컬 대상만 정리한다.

## 1. 증명

1. `git fetch origin develop`로 원격 기준을 최신화한다.
2. `gh pr view <PR 번호> --json state,mergeCommit,headRefName,baseRefName,closingIssuesReferences`로 PR이 `MERGED`, head가 `CF-<Issue 번호>`, base가 `develop`인지 확인한다.
3. `git merge-base --is-ancestor <mergeCommit.oid> origin/develop`가 성공하는지 확인한다.
4. 연결 Issue가 닫혔는지 확인한다. 자동 종료가 누락됐으면 원인을 보고하며 Issue를 임의로 닫지 않는다.

어느 증명이라도 실패하면 정리하지 않는다.

증명 결과와 worktree 상태를 JSON snapshot으로 정리하고 선택한 Python으로 `harness/scripts/plan-post-merge-cleanup.py <snapshot 파일>`을 실행한다. 결과가 `ready`일 때만 아래 정리를 수행한다.

## 2. 안전 판정

1. `git worktree list --porcelain`로 해당 브랜치의 모든 worktree를 찾는다.
2. 각 worktree에서 tracked와 untracked 변경을 확인한다.
3. dirty worktree와 현재 생명주기 밖의 외부 관리 worktree는 보존한다.
4. clean하고 이 저장소가 만든 Issue worktree만 제거 대상으로 삼는다.

## 3. 정리

1. 현재 경로가 제거 대상 worktree면 먼저 저장소 공통 디렉터리 밖의 안전한 경로로 이동한다.
2. 제거 대상 worktree를 일반 `git worktree remove <경로>`로 제거한다. 강제 옵션을 쓰지 않는다.
3. 해당 브랜치가 다른 worktree에서 사용되지 않고 merge가 증명됐으면 `git branch -d CF-<Issue 번호>`로 로컬 브랜치를 제거한다.
4. 원격 브랜치는 GitHub 설정으로 자동 삭제된 경우만 확인한다. AI가 원격 브랜치를 직접 삭제하지 않는다.
5. 같은 명령을 다시 실행해도 이미 없는 대상은 성공으로 취급한다.

## 4. 결과 보고

검증한 PR과 merge commit, 제거한 로컬 대상, 이미 없던 대상, 보존한 dirty 또는 외부 관리 대상을 구분해 보고한다.
