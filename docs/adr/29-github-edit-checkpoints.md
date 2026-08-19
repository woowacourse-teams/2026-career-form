# GitHub 수동 편집 체크포인트 도입

## 상태

승인됨

## 날짜

2026-08-18

## 관련 Issue

- #29

## 배경

기존 기획 흐름은 대화에서 Issue 계약을 승인받은 뒤 GitHub에 게시하고 바로 `status:ready`로 전환한다. 구현 흐름은 Draft PR을 생성한 직후 Issue와 Project를 리뷰 상태로 전환한다. 이 순서에서는 사람이 GitHub의 실제 Issue와 PR을 직접 수정하고 재개를 명시하는 시점이 원격 상태에 표현되지 않는다.

Issue와 PR 본문은 GitHub가 협업 정본이다. AI가 만든 초안을 사람이 원격에서 수정할 수 있어야 하며, AI는 사용자의 수정이 끝났다는 신호 없이 다음 상태로 진행하거나 재개 시 원격 내용을 이전 초안으로 덮어쓰지 않아야 한다.

## 검토한 대안

- 대화에서 전문을 승인한 뒤 게시하면 GitHub에서 최종 문맥을 확인하고 수정하는 별도 체크포인트가 생기지 않는다.
- 게시와 동시에 ready 또는 review 상태로 전환하면 수동 편집 중인 작업과 검토 가능한 작업을 상태로 구분할 수 없다.
- 수동 편집 전용 라벨과 Project Status를 새로 만들면 상태 종류와 동기화 분기가 늘어난다.
- 기존 planning과 in-progress 상태를 유지하면 새 상태를 만들지 않고도 원격 수정 대기를 표현할 수 있다.

## 결정

1. AI는 인터뷰와 계획이 정리되면 Issue 계약 초안을 GitHub에 게시한다.
2. Issue 게시 뒤에는 `status:planning`과 Project `In Progress`를 유지하고 사람이 원격 제목과 본문을 수정해 재개할 때까지 멈춘다.
3. 재개하면 AI는 원격 Issue를 다시 읽고 독립 계약 검증을 수행한다. 실패하면 사용자 변경을 덮어쓰지 않고 planning 상태를 유지하며, 통과하면 `status:ready`로 전환한다.
4. AI는 구현, 검증과 코드 리뷰가 끝나면 Draft PR을 GitHub에 게시한다.
5. Draft PR 게시 뒤에는 Issue `status:in-progress`와 Project `In Progress`를 유지하고 사람이 원격 제목과 본문을 수정해 재개할 때까지 멈춘다.
6. 재개하면 AI는 기존 Draft PR을 다시 읽고 독립 PR 계약 검증을 수행한다. 실패하면 사용자 변경을 덮어쓰지 않고 in-progress 상태를 유지하며, 통과하면 Issue `status:review`와 Project `On Review`로 전환한다.
7. 같은 Issue 본문 게시와 Draft PR 생성을 재개 시 반복하지 않는다.
8. 사람의 재개 요청은 일시적인 입력이며 새 라벨이나 Project Status로 저장하지 않는다.
9. Draft PR의 Ready for review 전환, 최종 승인과 머지는 사람이 수행한다.

## 결과

GitHub에서 사람이 실제 계약과 PR 설명을 수정하는 시간이 생명주기에 포함된다. planning과 in-progress 상태가 각각 Issue와 Draft PR 수동 편집 대기를 함께 나타내므로 상태 종류는 늘지 않는다. 재개하는 AI는 원격 제목, 본문, 라벨, Project Status와 기존 PR 존재 여부를 다시 읽어야 하며, 사용자 변경을 보존하고 완료한 원격 쓰기를 반복하지 않아야 한다.
