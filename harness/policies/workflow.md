# Issue 기반 작업 흐름

1. GitHub Project draft를 기능 단위로 작성한다. FE, BE, Infra처럼 독립 구현이 필요할 때만 별도 draft로 나눈다.
2. draft를 Issue로 승격하고 Project Status를 In Progress로 바꾼다.
3. Issue 본문과 커밋 단위 구현 계획을 제안하고 사람이 `status:ready`로 확정한다.
4. AI가 Issue를 다시 읽고 위험 작업과 누락 정보를 검사한다.
5. `CF-<Issue 번호>` 워크트리에서 논리적 커밋 단위로 작업한다.
6. 실패하는 테스트, 최소 구현, 리팩터링 순서로 진행한다.
7. 전체 검증과 코드 리뷰를 통과하면 Issue 하나만 종료하는 Draft PR 하나를 만든다.
8. AI는 Issue 상태와 Project Status를 리뷰 단계로 전환하고 사람에게 넘긴다.
9. 사람이 최종 승인하고 Squash Commit 제목을 확인한 뒤 머지한다.

범위가 커지거나 새로운 결정이 필요하면 현재 Issue를 수정하지 않고 독립 draft 후보를 만든다. 사람이 draft를 Issue로 승격하고 확정하기 전에는 해당 범위를 구현하지 않는다.
