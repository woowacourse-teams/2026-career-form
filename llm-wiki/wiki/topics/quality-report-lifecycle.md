# 자동 기입 품질 report의 전송 시점

> Topic: quality-report-lifecycle
> Status: Current
> Current: [CF-296 자동 기입 품질 report의 전송 시점](../../raw/issues/CF-296/documents/quality-report-lifecycle.md)
> History: [CF-204 품질 report 전송 시점](../../raw/issues/CF-204/documents/quality-report-lifecycle.md), [CF-296](../../raw/issues/CF-296/documents/quality-report-lifecycle.md)
> Updated: 2026-10-20

## 현재 상태

완료 또는 취소 후 입력값 유지 관측이 정리되면 여러 스냅샷의 최종 상태와 대응 식별자를 reports 배열로 묶는다. 전체 UTF8 JSON 본문이 128KiB 이하면 보고 한 번으로 보내고 초과하면 크기로 분할한다. 마지막 항목에 종료 상태를 담는다. 사용자 완료는 보고 전송을 기다리지 않는다.

기존 단건 /report도 지원한다. 배치는 준비된 항목부터 처리하고 항목 사이에 작업자를 양보한다. 202는 접수이며 저장 완료가 아니다. 페이지 종료와 자원 포화에 따른 부분 유실은 허용한다.

## 관련 주제

- [자동 입력 품질 관측과 사람 확인 요청](autofill-quality-observation.md)
- [품질 가공의 비동기 처리](async-quality-observation.md)
