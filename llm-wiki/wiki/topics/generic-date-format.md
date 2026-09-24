# 범용 날짜 형식 변환과 로컬 승인

> Topic: generic-date-format
> Status: Current
> Current: [CF-101 날짜 형식 변환](../../raw/issues/CF-101/documents/generic-date-format.md)
> History: [근거 1](../../raw/issues/CF-101/documents/generic-date-format.md)
> Updated: 2026-09-24

## 현재 상태

범용 날짜 DIRECT 결합은 유효한 전체 원본과 현재 DOM의 형식 근거를 확인한 뒤 네 지원 형식으로 변환한다. 검토·기존 값 비교·쓰기에 동일 변환값을 사용하며 원본 fallback은 하지 않는다. ADAPTER 정적 매핑과 DERIVED/YEAR_MONTH는 유지한다.

로컬 승인에 대상 요소와 타입·placeholder·제약 스냅샷을 보관하고 쓰기 직전에 재검증한다. 승인 정보는 Backend/LLM에 보내지 않는다. 합성 통합 검증은 설치 UI나 실제 지원서 검증의 대체 근거가 아니며 unavailable 항목의 개별 보류 이유가 리뷰 목록에 보이지 않는 기존 제한이 있다.

## 변경 이유

프로필 날짜와 지원서 요구 형식의 차이를 회사별 예외 대신 live DOM의 명확한 단서로 해결하면서 기존 값 보호와 로컬 승인 경계를 유지한다.
