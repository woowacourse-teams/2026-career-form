# Issue 기반 개발 하네스 흐름

> Sources: Issue 추적 문서와 공유 하네스 ADR
> Raw: [하네스 흐름 원본](../../raw/technical/harness-lifecycle.md)
> Updated: 2026-08-18

## 개요

작업 단위는 하나의 Issue, 하나의 작업 브랜치, 하나의 Draft PR이다. Issue 본문이 범위와 완료 기준의 정본이며, 구현과 검토 상태는 Issue 라벨과 GitHub Project Status를 함께 갱신한다.

## 검증 경계

자동 검증과 사람이 수행할 수동 검증을 구분한다. 승인·병합과 실제 지원서 조작 같은 위험 작업은 사람의 책임으로 남긴다.
