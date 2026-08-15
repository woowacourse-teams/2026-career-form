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

하나의 Issue, 계약에 맞는 `CF-<Issue 번호>` 또는 `hotfix/CF-<Issue 번호>` 브랜치 하나, PR 하나의 생명주기를 단계별 정본에 따라 연결한다. 사람 승인과 머지 대기에서는 멈추고, 같은 스킬을 다시 호출하면 원격 상태를 읽어 첫 미완료 단계부터 재개한다.

## 1. 입력과 현재 상태 확인

1. draft 제목 또는 Issue 번호 중 사용자가 제공한 식별자를 확인한다.
2. Project와 repository에서 현재 DraftIssue, Issue, PR, label, Project Status를 읽는다.
3. 현재 상태를 JSON snapshot으로 정리하고 선택한 Python으로 `harness/scripts/plan-issue-lifecycle.py <snapshot 파일>`을 실행해 첫 미완료 단계를 확인한다.
4. 이미 완료된 원격 쓰기를 반복하지 않는다.

## 2. 기획

repository Issue가 아직 `status:ready`가 아니면 `cf-project-issue-planning`을 사용한다. 이 단계가 사람의 계약 승인에서 멈추면 생명주기도 멈춘다. 사용자가 승인해 재개하면 승인된 계약 게시와 `status:ready` 확인까지 수행한다.

## 3. 구현과 Draft PR

`status:ready` Issue는 `cf-issue-workflow`에 넘긴다. 환경 구성, 격리, 계획, TDD, 검증, 코드 리뷰, Draft PR 생성과 `status:review` 전환까지 완료한다. 사람의 PR 승인과 머지는 대신하지 않는다.

## 4. 머지 후 정리

사용자가 머지를 완료했다고 알리거나 원격 PR이 `MERGED`인 상태로 재개되면 `cf-post-merge-cleanup`을 사용한다. 원격 머지와 `origin/<baseRefName>` 포함 관계가 모두 증명되지 않으면 정리하지 않는다.

## 완료 조건

- Issue가 닫혀 있다.
- 연결 PR이 `MERGED`다.
- merge commit이 `origin/<baseRefName>`에 포함되어 있다.
- 안전하게 제거할 수 있었던 `CF-*` 또는 `hotfix/CF-*` 로컬 브랜치와 관리 worktree가 정리됐다.
- dirty 또는 외부 관리 worktree는 경로와 보존 이유가 보고됐다.

`cf-finishing-a-development-branch`는 이 표준 생명주기에 포함하지 않는다.
