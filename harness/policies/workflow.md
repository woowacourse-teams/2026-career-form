# Issue 기반 작업 흐름

1. 기획 내용을 Parent Issue와 독립적으로 머지 가능한 Sub-issue로 나눈다.
2. 사람이 Issue 본문과 인수 조건을 확인한 뒤 `status:ready`로 확정한다.
3. AI가 Issue를 다시 읽고 위험 작업과 누락 정보를 검사한다.
4. `feature/<Issue 번호>-<slug>` 또는 `hotfix/<Issue 번호>-<slug>` 워크트리에서 작업한다.
5. 실패하는 테스트, 최소 구현, 리팩터링 순서로 진행한다.
6. 전체 검증과 코드 리뷰를 통과하면 Draft PR을 만든다.
7. AI는 Issue 상태를 `status:review`로 전환하고 사람에게 넘긴다.
8. 사람이 최종 승인하고 정책에 맞는 방식으로 머지한다.

범위가 커지거나 새로운 결정이 필요하면 현재 Issue를 수정하지 않고 후속 Issue 후보를 만든다. 사람이 후속 Issue를 확정하기 전에는 해당 범위를 구현하지 않는다.
