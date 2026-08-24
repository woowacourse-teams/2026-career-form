# LLM Wiki 지식 모델

> Topic: llm-wiki-knowledge-model
> Status: Current
> Current: [현재 근거](../../raw/issues/CF-41/documents/adr/41-append-only-knowledge-model.md)
> History: [근거 1](../../raw/issues/CF-41/documents/adr/41-append-only-knowledge-model.md)
> Updated: 2026-08-22

## 현재 상태

Issue별 불변 raw와 주제별 읽기 모델, 사람 승인 digest를 중앙 지식 계약으로 사용한다.

## 변경 이유

raw 수정으로 과거 결정을 잃는 문제와 작업 중 후보 유실을 함께 해결하도록 구조를 바꿨다.
