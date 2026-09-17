# 프로젝트 컨벤션

> Topic: project-conventions
> Status: Current
> Current: [현재 근거](../../raw/issues/CF-91/documents/adr/91-backend-quality-enforcement.md)
> History: [근거 1](../../raw/conventions/development-conventions.md); [근거 2](../../raw/issues/CF-41/documents/indexes/project-conventions.md); [근거 3](../../raw/issues/CF-91/documents/adr/91-backend-quality-enforcement.md)
> Updated: 2026-09-17

## 현재 상태

공통, 커밋, 브랜치와 스택별 규약을 연결된 raw 기준으로 적용한다. Java, Spring
백엔드에는 [백엔드 코드 품질 기준](backend-code-quality.md)을 함께 적용하고
[해석 사례](backend-code-quality-examples.md)는 규칙이 아닌 판단 보조 자료로 사용한다.

## 변경 이유

legacy 요약에서 세부 규약 전체를 연결하는 기준으로 전환했고, CF-91에서 백엔드 품질
정본과 결정론적 신규 구조 위반 차단을 추가했다.
