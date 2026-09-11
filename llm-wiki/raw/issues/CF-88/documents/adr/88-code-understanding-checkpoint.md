# 검증 이후 코드 이해 체크포인트

## 상태

승인됨

## 날짜

2026-09-11

## 관련 Issue

- #88

## 배경

AI가 구현과 검증을 빠르게 수행해도 사람이 변경된 코드의 흐름, 수정 이유와 장애 확인 지점을 이해하지 못한 채 Issue와 PR을 승인할 수 있다. 기획 단계의 퀴즈는 아직 없는 최종 코드를 이해했다고 판단하게 하고, 통과형 시험은 개발 흐름을 방해한다.

최종 verification을 통과한 코드에서만 짧은 설명과 참고 파일이 있는 오픈북 질문을 제공해야 한다. 사람은 답하거나 건너뛸 수 있어야 하며, 점수와 답변 원문은 남기지 않는다.

## 검토한 대안

- 요청이 있을 때만 설명한다: 흐름은 짧지만 이해 확인이 반복해서 생략될 수 있다.
- Issue 기획 또는 `status:ready` 전에 퀴즈를 진행한다: 변경 의도는 확인할 수 있지만 최종 코드와 결합되지 않는다.
- 최종 verification 뒤 Draft PR 전에 설명과 오픈북 질문을 진행한다: 실제 변경을 기준으로 학습할 수 있고 짧은 사람 확인이 추가된다.

## 결정

세 번째 대안을 사용한다. checkpoint schema v3는 `verification`과 `draft_pr` 사이에 `understanding` 단계를 둔다. 보고서는 worktree별 Git 메타데이터의 `cf-workflow/understanding.md`에 기록하고, 완료 evidence에는 현재 HEAD와 연결되는 `Answered` 또는 `Skipped`, 보고서 path, SHA-256 digest만 남긴다.

delivery planner는 verification 완료 HEAD, clean worktree, 보고서 path와 digest가 모두 일치할 때만 Draft PR을 선택한다. Draft PR 도구 가드는 schema v3에서 완료된 understanding 근거가 없거나 현재 HEAD와 다르면 생성을 차단한다. 코드나 worktree가 바뀌면 verification부터 재실행하고, 보고서만 달라지면 understanding을 다시 수행한다.

질문은 국소 변경이면 하나, 여러 컴포넌트, 분기 또는 상태 전환이 있으면 최대 세 개로 제한한다. 각 질문에는 관련 파일 한 개에서 세 개와 기호를 제공한다. 힌트는 파일, 위치, 흐름, 함께 읽기 순서로 제공한다. 점수, 합격선, 강제 재시도, 답변 전문 보관은 사용하지 않는다.

기획 단계의 Mermaid는 여러 컴포넌트, 분기 또는 상태 전환을 설명해야 할 때만 정상 흐름 중심으로 짧게 작성한다. `status:ready`와 기존 Project Status 체계는 바꾸지 않는다.

완료된 v1과 v2 Draft PR checkpoint는 기존 절차를 유지한다. 미완료 v2 checkpoint는 필요한 경우 understanding 단계로 승격한다.

## 결과

사람은 Draft PR 전에 실제 코드의 변경과 탐색 지점을 확인할 수 있다. 확인은 답변 또는 건너뛰기로 끝나고, 점수나 개인 학습 이력은 만들지 않는다. 새 checkpoint와 guard는 기존 하네스 흐름에 한 단계의 사람 확인을 추가하므로, 코드 버전 결합과 legacy 재개 호환을 자동 검증한다.
