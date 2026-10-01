# Issue 개발 흐름

> Topic: issue-development-workflow
> Status: Current
> Current: [CF-88 검증 이후 코드 이해 체크포인트](../../raw/issues/CF-88/documents/adr/88-code-understanding-checkpoint.md)
> History: [근거 1](../../raw/technical/harness-lifecycle.md); [근거 2](../../raw/issues/CF-41/documents/docs/agents/issue-tracker.md); [근거 3](../../raw/issues/CF-88/documents/adr/88-code-understanding-checkpoint.md)
> Updated: 2026-09-11

## 현재 상태

하나의 Issue, 브랜치, PR과 사람 승인 경계를 유지한다. verification 뒤에는 최종 코드 보고서와 답변 또는 건너뛰기 기반의 코드 이해 확인을 완료한 뒤 Draft PR을 만든다.

## 변경 이유

기존 Issue 흐름에 최종 코드 버전과 결합된 이해 확인을 추가했다. 점수와 답변 원문을 남기지 않고, 코드 변경과 legacy checkpoint 재개 경계를 함께 보존한다.
