# 지원서 분석 데이터 경계

> Topic: application-form-analysis-data-boundary
> Status: Current
> Current: [현재 근거](../../raw/issues/CF-44/documents/adr/44-application-form-analysis-data-boundary.md)
> History: [근거 1](../../raw/issues/CF-44/documents/adr/44-application-form-analysis-data-boundary.md)
> Updated: 2026-08-25

## 현재 상태

preparation과 field mapping을 전용 endpoint로 분리한다. 프로필 값과 항목 개수는 browser 로컬에 남고, 반복 입력의 실제 실행 횟수와 과다 실행 방지 정책도 browser가 소유한다. 반복 레코드의 field와 item 내부 action은 `sections[].items[]`로 묶고, DOM class·반복 순번·복제 template은 식별자로 사용하지 않는다. backend는 action 의미와 기대 효과만 반환하며 action candidate는 LLM에 전달하지 않는다. LLM에는 backend가 미지원 사이트의 입력 field와 필요한 비식별 section·`itemId` 문맥만 최소 payload로 전달한다.

## 변경 이유

결합 snapshot의 모호함을 없애고, 전체 browser snapshot 전달과 field 단위의 문맥 손실 사이에서 개인정보 최소화와 안전한 의미 추론을 함께 보존한다. snapshot 로컬 `itemId`로 같은 레코드의 문맥만 보존해 회사별 DOM 구조와 장기 locator 결합을 피한다. 실행 시점 상태를 가진 browser의 로컬 제한과 클릭별 효과 검증으로 반복 action의 과다 실행을 막으면서 프로필 유래 목표 개수의 외부 전송도 피한다.
