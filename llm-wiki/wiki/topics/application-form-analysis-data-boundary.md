# 지원서 분석 데이터 경계

> Topic: application-form-analysis-data-boundary
> Status: Current
> Current: [현재 근거](../../raw/issues/CF-44/documents/adr/44-application-form-analysis-data-boundary.md)
> History: [근거 1](../../raw/issues/CF-44/documents/adr/44-application-form-analysis-data-boundary.md)
> Updated: 2026-08-25

## 현재 상태

preparation과 field mapping을 전용 endpoint로 분리한다. 프로필 값과 action candidate는 LLM에 전달하지 않고, backend가 미해결 field와 필요한 비식별 section 문맥만 최소 payload로 전달한다.

## 변경 이유

결합 snapshot의 모호함을 없애고, 전체 browser snapshot 전달과 field 단위의 문맥 손실 사이에서 개인정보 최소화와 안전한 의미 추론을 함께 보존한다.
