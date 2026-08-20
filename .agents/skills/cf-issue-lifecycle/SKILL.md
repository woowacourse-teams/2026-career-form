---
name: cf-issue-lifecycle
description: 사람이 만든 GitHub Project draft 또는 확정 Issue를 기획, 구현, Draft PR, 사람 머지 확인, 안전한 사후 정리까지 하나의 재개 가능한 흐름으로 연결한다. 사용자가 "작업을 처음부터 끝까지 진행해줘", "원 플로우로 처리해줘", "Issue 생명주기를 진행해줘"처럼 전체 작업 흐름을 요청할 때 사용한다.
metadata:
  calls:
    - cf-project-issue-planning
    - cf-issue-workflow
    - cf-post-merge-cleanup
  portable: true
  external_dependencies: []
---

# CF Issue Lifecycle

하나의 Issue, 계약에 맞는 `CF-<Issue 번호>` 또는 `hotfix/CF-<Issue 번호>` 브랜치 하나, PR 하나의 생명주기를 단계별 정본에 따라 연결한다. Issue와 Draft PR의 GitHub 수정, 사람 승인과 머지 대기에서는 멈춘다. 사용자가 재개를 명시하면 원격 상태와 worktree 체크포인트를 실제 Git 상태와 대조해 첫 미완료 단계부터 이어간다.

## 1. 입력과 현재 상태 확인

1. draft 제목 또는 Issue 번호 중 사용자가 제공한 식별자를 확인한다.
2. Project와 repository에서 현재 DraftIssue, Issue, PR, label, Project Status를 읽는다.
3. 현재 상태를 `pull_request_is_draft`와 사용자의 재개 신호인 `pr_edit_confirmed`를 포함한 JSON snapshot으로 정리하고 선택한 Python으로 `harness/scripts/plan-issue-lifecycle.py <snapshot 파일>`을 실행해 첫 미완료 단계를 확인한다. 두 필드는 JSON boolean만 사용한다.
4. 이미 완료된 원격 쓰기를 반복하지 않는다.

사용자가 현재 Issue와 관계없는 질문을 하면 질문을 처리하되 작업 재개 신호로 해석하지 않는다. worktree 체크포인트를 지우거나 다른 단계로 바꾸지 않으며, 이후 사용자가 작업 재개를 명시하면 그때 상태 대조를 시작한다.

## 2. 기획

repository Issue가 아직 `status:ready`가 아니면 `cf-project-issue-planning`을 사용한다. 이 스킬이 계약 초안을 GitHub에 게시하면 `status:planning`에서 멈춘다. 사용자가 원격 Issue를 수정하고 재개하면 수정된 원격 계약을 검증하고 `status:ready` 확인까지 수행한다.

## 3. 구현과 Draft PR

`status:ready` Issue는 `cf-issue-workflow`에 넘겨 worktree 체크포인트를 초기화한 뒤 계획 단계부터 시작한다. `status:in-progress` Issue를 재개하면 같은 worktree에서 `harness/scripts/plan-issue-delivery.py`를 실행해 체크포인트와 현재 브랜치, HEAD, 계획 파일, worktree 변경, Draft PR을 대조한다. 체크포인트가 없거나 손상됐으면 대화 맥락으로 단계를 추측하지 않고 현재 Git과 원격 상태를 보고한 뒤 중단한다.

환경 구성, 격리, 계획, TDD, 검증과 코드 리뷰 뒤 Draft PR을 만들면 Issue `status:in-progress`에서 멈춘다. 열린 Draft PR이 있고 `pr_edit_confirmed`가 false면 `await_pr_edit`에서 기다린다. 사용자가 GitHub PR을 수정하고 재개하면 `pr_edit_confirmed`를 true로 해 `review_draft_pr` action을 선택하고 기존 PR을 다시 검증한다. 검증 통과 뒤에만 Issue `status:review`와 Project `On Review`로 전환하며, 사람의 Ready for review 전환, PR 승인과 머지는 대신하지 않는다.

## 4. 머지 후 정리

사용자가 머지를 완료했다고 알리거나 원격 PR이 `MERGED`인 상태로 재개되면 `cf-post-merge-cleanup`을 사용한다. 원격 머지와 `origin/<baseRefName>` 포함 관계가 모두 증명되지 않으면 정리하지 않는다.

## 완료 조건

- Issue가 닫혀 있다.
- 연결 PR이 `MERGED`다.
- merge commit이 `origin/<baseRefName>`에 포함되어 있다.
- 안전하게 제거할 수 있었던 `CF-*` 또는 `hotfix/CF-*` 로컬 브랜치와 관리 worktree가 정리됐다.
- dirty 또는 외부 관리 worktree는 경로와 보존 이유가 보고됐다.

`cf-finishing-a-development-branch`는 이 표준 생명주기에 포함하지 않는다.
