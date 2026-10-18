# 범용 분석 provider의 JEV 단일화

> Topic: jev-single-analysis-provider
> Status: Current
> Current: [범용 분석 provider의 JEV 단일화 ADR 초안](../../raw/issues/CF-222/documents/adr/222-jev-single-analysis-provider.md)
> History: [범용 분석 provider의 JEV 단일화 ADR 초안](../../raw/issues/CF-222/documents/adr/222-jev-single-analysis-provider.md)
> Updated: 2026-10-16

## 현재 상태

범용 분석 provider를 JEV 하나로 두고 공급자에는 비식별 구조만 보낸다. 채움 양 한계와 전송, 보관, 학습 정책 미검증 위험은 검증된 사실이 아니라 위험으로만 기록한다. OpenAI 제거는 평가에서 비열위가 확인된 뒤에만 한다.

## 변경 이유

공급자 단일화는 데이터 경계와 제품 품질에 장기적으로 영향을 주므로 조건과 위험을 함께 남긴다. 상세 근거와 대안은 ADR을 따른다. ADR은 제안됨 상태이며 확정은 후속 작업에서 한다.
