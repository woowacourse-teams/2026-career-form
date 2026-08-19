# Issue 기반 작업 흐름

1. 사람이 GitHub Project draft를 기능 단위로 작성한다. FE, BE, Infra처럼 독립 구현이 필요할 때만 별도 draft로 나눈다.
2. AI가 draft 제목을 `[영역] 작업명`으로 검사하고 필요한 경우 보정한 뒤 Issue로 승격한다. 영역은 `FE`, `BE`, `AI`, `Infra`, `Harness`, `Plan`을 허용하며 `FE`, `BE`, `AI`만 전체를 대문자로 쓴다. Issue에는 `status:planning`, Project에는 In Progress를 적용하고 함께 확인한다.
3. AI가 Issue 본문과 커밋 단위 구현 계획을 작성해 원격 Issue에 게시한다. `status:planning`과 Project `In Progress`를 유지하고 사람이 GitHub에서 수정한 뒤 재개를 요청할 때까지 멈춘다.
4. 재개하면 AI가 사용자 변경을 덮어쓰지 않고 원격 Issue를 다시 읽어 검증한다. 실패하면 planning 상태를 유지하고, 통과하면 `status:ready`로 전환한다.
5. AI가 Issue를 다시 읽고 위험 작업과 누락 정보를 검사한다.
6. 일반, 릴리스 수정은 `CF-<Issue 번호>`, 운영 hotfix는 `hotfix/CF-<Issue 번호>` 워크트리에서 논리적 커밋 단위로 작업한다.
7. 실패하는 테스트, 최소 구현, 리팩터링 순서로 진행한다.
8. 전체 검증과 코드 리뷰를 통과하면 Issue 하나만 종료하는 Draft PR 하나를 만든다. Issue `status:in-progress`와 Project `In Progress`를 유지하고 사람이 GitHub에서 수정한 뒤 재개를 요청할 때까지 멈춘다.
9. 재개하면 AI가 기존 Draft PR을 다시 읽어 검증한다. 실패하면 in-progress 상태를 유지하고, 통과하면 Issue `status:review`와 Project `On Review`로 전환한다.
10. 사람이 Draft PR을 Ready for review로 전환한다.
11. 사람이 최종 승인하고 Squash Commit 제목을 확인한 뒤 머지한다.
12. AI가 PR의 `MERGED` 상태와 merge commit의 `origin/<대상 브랜치>` 포함 관계를 확인한 뒤 clean한 관리 worktree와 안전한 로컬 브랜치만 정리한다.

`cf-issue-lifecycle`은 2단계부터 12단계를 연결한다. Issue와 Draft PR의 GitHub 수정, PR 머지에서는 멈추고, 재개 시 원격 상태를 읽어 완료된 쓰기를 반복하지 않는다. dirty 또는 외부 관리 worktree는 보존한다.

범위가 커지거나 새로운 결정이 필요하면 현재 Issue를 수정하지 않고 독립 draft 후보를 제안한다. 사람이 별도 draft를 만들고 그 draft를 Issue로 승격해 확정하기 전에는 해당 범위를 구현하지 않는다.

## Issue label과 Project Status

| Issue label | Project Status |
|---|---|
| `status:planning` | `In Progress` |
| `status:ready` | `In Progress` |
| `status:in-progress` | `In Progress` |
| `status:blocked` | `In Progress` |
| `status:review` | `On Review` |

draft 승격 직후 Project Status는 `In Progress`로 바꾼다. planning과 ready 라벨을 적용해도 `In Progress`를 유지한다. 구현 시작부터 Draft PR 수동 편집이 끝날 때까지 Issue label과 Project Status는 `status:in-progress`와 `In Progress`다. 재개 후 PR 검증을 통과한 경우에만 `status:review`와 `On Review`로 함께 전환한다.
