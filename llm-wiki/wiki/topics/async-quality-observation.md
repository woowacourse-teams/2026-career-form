# 분석 응답과 품질 관측의 비동기 분리

> Topic: async-quality-observation
> Status: Current
> Current: [CF-296 분석 응답과 품질 관측의 비동기 분리](../../raw/issues/CF-296/documents/adr/296-quality-capture-and-batch-report.md)
> History: [CF-288 비동기 품질 관측](../../raw/issues/CF-288/documents/async-quality-observation.md), [CF-296](../../raw/issues/CF-296/documents/adr/296-quality-capture-and-batch-report.md)
> Updated: 2026-10-20

## 현재 상태

분석 응답 전에는 개인정보를 정제한 불변 캡처와 큐 접수만 수행한다. 구조 투영, 해시, 품질 크기 확인용 직렬화와 저장은 작업자에서 수행한다. 실제 HTTP 응답 직렬화는 요청 경로에 남는다. 기존 실행 등록과 지연 집계는 유지한다.

캡처 중 메모리를 먼저 예약하고 보수적 객체 예산으로 조정한다. 큐와 보관량 제한, 포화 시 드랍, 부분 유실 허용을 유지한다. 이는 전체 JVM heap 상한이 아니다. 정확한 제한과 배포, 측정 기준은 Current 원문을 따른다.

## 관련 주제

- [자동 입력 품질 관측과 사람 확인 요청](autofill-quality-observation.md)
- [실행 단위 품질 보고](quality-report-lifecycle.md)
