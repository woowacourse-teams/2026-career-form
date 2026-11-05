# 범용 지원서의 구조 행동 자동 실행

> Topic: generic-autonomous-structural-actions
> Status: Current
> Current: [CF-412 민감 항목 자동 기입 정책 정정](../../raw/issues/CF-412/documents/sensitive-item-policy.md)
> History: [범용 지원서의 구조 행동 자동 실행 ADR 초안](../../raw/issues/CF-222/documents/adr/222-generic-autonomous-structural-actions.md); [CF-412 민감 항목 자동 기입 정책 정정](../../raw/issues/CF-412/documents/sensitive-item-policy.md)
> Updated: 2026-11-05

## 현재 상태

범용 지원서에서 행 추가, 섹션 펼치기, 행 종류 선택은 승인 없이 자동 실행하고 값 쓰기는 분석과 등급 판정을 그대로 거치고, 민감 항목에는 별도 승인이 없다(#212, [CF-412 민감 항목 자동 기입 정책 정정](../../raw/issues/CF-412/documents/sensitive-item-policy.md)). 제출, 저장, 임시저장, 페이지 이동은 어떤 경우에도 자동화하지 않는다. 클릭 허용 목록을 코드로 먼저 적용하고 JEV 판단은 2차로 쓴다.

## 변경 이유

구조 행동 자동 실행이 사용자 확인과 통제 원칙과 충돌하지 않도록 자동 범위를 구조 행동으로 한정한다. 상세 근거와 대안은 ADR을 따른다. ADR은 제안됨 상태이며 구현 결과를 반영한 확정은 후속 작업에서 한다.

## 구현 근거

CF-260의 범용 전용 수집 주입, 구조 반복 실행과 학력 행 격리는 [구현 topic](generic-structure-loop.md)에 별도로 기록한다. 이 연결은 ADR의 제안 상태를 변경하지 않는다.
