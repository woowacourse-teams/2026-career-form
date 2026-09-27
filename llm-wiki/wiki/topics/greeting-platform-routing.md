# Greeting 플랫폼 판정과 실행 어댑터

> Topic: greeting-platform-routing
> Status: Current
> Current: [CF-94 승인 ADR](../../raw/issues/CF-94/documents/adr/94-greeting-platform-routing.md)
> History: [CF-94 승인 ADR](../../raw/issues/CF-94/documents/adr/94-greeting-platform-routing.md)
> Updated: 2026-09-27

## 현재 상태

기존 회사 정책을 우선하고, BE가 정확한 Greeting 도메인 또는 양성 CNAME·명시 등록 근거를 확인한다. BE는 협상된 클라이언트에 `greeting-v1`을 지정하며 FE는 host나 footer로 업체를 판정하지 않는다. 일반 수집 뒤 Greeting 구조를 다시 수집하고, host/path에 묶인 불투명한 판정 문맥을 두 번째 준비와 fields까지 검증한다. 양성 뒤 정책 부재·구조 불일치·문맥 오류는 범용 분석으로 우회하지 않는다.

## 변경 이유

기업 자체 도메인과 기본 도메인을 한 공통 정책으로 지원하면서 BE의 판정 책임과 FE의 화면 실행 책임을 분리했다. 배경, 대안, 세부 결정과 결과는 [승인 ADR](../../raw/issues/CF-94/documents/adr/94-greeting-platform-routing.md)을 따른다.
