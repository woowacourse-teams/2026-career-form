# 지원서 분석 데이터 경계

> Topic: application-form-analysis-data-boundary
> Status: Current
> Current: [현재 근거](../../raw/issues/CF-44/documents/adr/44-application-form-analysis-data-boundary.md)
> History: [근거 1](../../raw/issues/CF-44/documents/adr/44-application-form-analysis-data-boundary.md)
> Updated: 2026-08-25

## 현재 상태

preparation과 field mapping을 전용 endpoint로 분리한다. 프로필 값과 항목 개수는 browser 로컬에 남고, 반복 입력의 실제 실행 횟수와 과다 실행 방지 정책도 browser가 소유한다. 반복 레코드의 candidate는 `sections[].items[]`로 묶고 DOM class·반복 순번·복제 template은 식별자로 사용하지 않는다. backend는 action 의미와 기대 효과만 반환하며 action candidate는 LLM에 전달하지 않는다.

어댑터 일치 route는 adapter 전용, fingerprint 불일치는 차단 전용이다. 비어댑터 route만 Snapshot B의 모든 field candidate를 LLM에 보내며 candidateId, section 이름·parent 관계, snapshot-local `itemId`, label/ARIA 기반 display name, element/control type과 option 표시명만 허용한다. LLM output은 input candidate와 exact 1:1인 `MATCH | NO_MATCH`다. 민감 field 의미 분류와 실제 profile value 연결·입력 확인은 분리한다.

## 변경 이유

결합 snapshot의 모호함을 없애고, 전체 browser snapshot 전달과 field 단위의 문맥 손실 사이에서 개인정보 최소화와 안전한 의미 추론을 함께 보존한다. canonical profile field key는 값 없이도 정확한 로컬 저장 위치를 표현하며 `evidenceDocumentPath` 같은 미입력 항목을 allowlist에서 제외한다.
