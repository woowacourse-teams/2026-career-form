# Jev·OpenAI 호출 추적

> Topic: provider-call-tracing
> Status: Current
> Current: [CF-138 호출 추적 운영과 ADR](../../raw/issues/CF-138/documents/provider-call-tracing.md)
> History: [근거 1](../../raw/issues/CF-138/documents/provider-call-tracing.md)
> Updated: 2026-10-01

## 현재 상태

공식 LangSmith Java SDK로 Jev 직접 HTTP와 OpenAI Spring AI 호출을 관측한다. 기본 비활성화이며 요청 식별자를 별칭화하고 허용된 지시문·구조·판단만 기록한다. 서버 생성 `request_id`로 같은 백엔드 요청의 호출을 연결하고 Jev 원본 판단과 클라이언트의 ABSTAIN을 구분한다.

진행 중인 추적과 전송 대기의 용량을 제한하고 단일 작업자, 제한 시간, 재시도 없음으로 관측 장애를 격리한다. `trace_id`와 `dotted_order`를 함께 전송하며 실제 제공된 토큰만 `outputs.usage_metadata`에 둔다. SDK의 소유 HTTP transport를 직접 종료하여 불필요한 배치 초기화를 피한다.

## 변경 이유

로그·메트릭만으로는 공급자별 입력과 결과를 호출 단위로 비교하기 어렵다. 기존 모델 호출 구조를 유지하면서 비식별 데이터 경계 안에서 LangSmith 상세 조회를 제공한다.
