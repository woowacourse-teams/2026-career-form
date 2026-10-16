# 범용 전용 API 분리와 섹션 범주별 칸 매칭

> Topic: generic-api-section-category-matching
> Status: Current
> Current: [범용 전용 API 분리와 섹션 범주별 칸 매칭 ADR 초안](../../raw/issues/CF-222/documents/adr/222-generic-api-section-category-matching.md)
> History: [범용 전용 API 분리와 섹션 범주별 칸 매칭 ADR 초안](../../raw/issues/CF-222/documents/adr/222-generic-api-section-category-matching.md)
> Updated: 2026-10-16

## 현재 상태

범용 판단은 /api/v1/generic/** 전용 API로 분리하고 공유 fields/preparation API 계약은 바꾸지 않는다. 문서 순서로 이어진 입력란 묶음을 섹션으로 삼아 범주별로 선택지를 좁혀 매칭하며, 섹션 경계가 틀리면 MIXED와 등급 하향으로 안전하게 실패한다.

## 변경 이유

범용 로직과 공유 API의 경계를 분리해 정적 정책 경로를 보호한다. 상세 근거와 대안은 ADR을 따른다. ADR은 제안됨 상태이며 확정은 후속 작업에서 한다.
