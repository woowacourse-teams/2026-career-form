# 범용 지원서의 구조 행동 자동 실행

> Topic: generic-autonomous-structural-actions
> Status: Current
> Current: [범용 지원서의 구조 행동 자동 실행 ADR 초안](../../raw/issues/CF-222/documents/adr/222-generic-autonomous-structural-actions.md)
> History: [범용 지원서의 구조 행동 자동 실행 ADR 초안](../../raw/issues/CF-222/documents/adr/222-generic-autonomous-structural-actions.md)
> Updated: 2026-10-16

## 현재 상태

범용 지원서에서 행 추가, 섹션 펼치기, 행 종류 선택은 승인 없이 자동 실행하고 값 쓰기와 민감 항목 승인은 유지한다. 제출, 저장, 임시저장, 페이지 이동은 어떤 경우에도 자동화하지 않는다. 클릭 허용 목록을 코드로 먼저 적용하고 JEV 판단은 2차로 쓴다.

## 변경 이유

구조 행동 자동 실행이 사용자 확인과 통제 원칙과 충돌하지 않도록 자동 범위를 구조 행동으로 한정한다. 상세 근거와 대안은 ADR을 따른다. ADR은 제안됨 상태이며 구현 결과를 반영한 확정은 후속 작업에서 한다.
