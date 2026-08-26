# 지원서 분석 데이터 경계

> Topic: application-form-analysis-data-boundary
> Status: Current
> Current: [현재 근거](../../raw/issues/CF-40/documents/adr/40-generic-form-analysis-resolver-boundary.md)
> History: [근거 1](../../raw/issues/CF-44/documents/adr/44-application-form-analysis-data-boundary.md), [근거 2](../../raw/issues/CF-40/documents/adr/40-generic-form-analysis-resolver-boundary.md)
> Updated: 2026-08-26

## 현재 상태

`com.careerform.formanalysis`이 외부 API와 독립된 `ActionResolver` 및 `FieldMappingResolver` port를 소유한다. 현재 production 구현은 `LlmActionResolver`와 `LlmFieldMappingResolver`뿐이고 정적 회사 Resolver, DB mapping과 router는 후속 범위다. preparation과 field mapping은 전용 endpoint와 전용 최소 LLM 계약을 유지한다.

Action LLM에는 candidate 의미, section/item 문맥, visibility, `domId/domName`과 true-only 상태만 보내고, field LLM에는 CF-44의 더 작은 candidate/section/item/option 표시 문맥만 보낸다. 실제 값·HTML·URL 상세·계정/세션·selector·실행 정보는 금지한다. 실제 action 실행·반복 횟수·효과 확인·DOM 재수집과 field 값 연결·입력은 browser 책임이다. 두 output은 input candidate와 exact 1:1이며 위반 시 전체 폐기한다.

## 변경 이유

정적 producer가 없는 현재 단계에서 모든 사이트의 범용 LLM 동작을 검증하면서, 외부 API 변경 없이 후속 회사별 정적 구현을 추가할 port를 확보했다. 검증된 회사 fingerprint가 불일치하면 `ADAPTER_STRUCTURE_MISMATCH`로 차단하고 LLM fallback하지 않는 안전 경계는 유지한다.
