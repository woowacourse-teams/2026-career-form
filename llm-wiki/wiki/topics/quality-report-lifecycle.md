# 자동 기입 품질 report의 전송 시점

> Topic: quality-report-lifecycle
> Status: Current
> Current: [CF-204 품질 report 전송 시점](../../raw/issues/CF-204/documents/quality-report-lifecycle.md)
> History: [CF-204 품질 report 전송 시점](../../raw/issues/CF-204/documents/quality-report-lifecycle.md)
> Updated: 2026-10-13

## 현재 상태

품질 관측을 실행 및 snapshot별로 로컬에 누적하고 완료, 진행 불가, 오류, 미지원 또는 취소 시 전송한다. 정상 완료는 값 유지 관측을 기다리고 취소는 관측을 중단한다. 마지막 데이터 report에 종료 상태를 포함하고 같은 실행의 반복 종료는 추가 전송하지 않는다.

snapshot별 API, 300 필드 분할, 기존 128KiB 제한과 네트워크 재시도는 유지한다. 영속 저장은 없으며 종료 처리 전에 탭이 닫히거나 새로고침되면 누적 결과가 유실될 수 있다.

## 변경 이유

진행 중 반복 전송과 별도의 종료 report를 줄이면서 최종 관측 결과를 보존한다.

## 관련 주제

- [자동 입력 품질 관측과 사람 확인 요청](autofill-quality-observation.md)
