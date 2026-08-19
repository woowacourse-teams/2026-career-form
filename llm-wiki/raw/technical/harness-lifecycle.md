# Issue 기반 개발 하네스 흐름

> Source: docs/agents/issue-tracker.md; docs/adr/14-shared-harness-lifecycle.md
> Collected: 2026-08-18
> Published: Unknown

하나의 Issue는 하나의 브랜치와 하나의 Draft PR로 종료한다. Sub-issue와 Parent 관계로 작업을 분해하지 않는다.

사람이 작업 계약을 승인한 Issue는 status:ready로 전환한다. 구현 시작 시 status:in-progress, Draft PR 검토 중에는 status:review를 사용하며 Project Status와 함께 전환한다.

Issue 본문은 작업 범위와 완료 기준의 정본이다. 자동 검증, 사람 수동 검증, 위험 작업 경계를 Issue와 PR에 기록한다.
