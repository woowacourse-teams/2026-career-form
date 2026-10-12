# 품질 관측 호출의 인터럽트 처리

> Topic: quality-observation-interruption
> Status: Current
> Current: [CF-201 인터럽트 처리](../../raw/issues/CF-201/documents/quality-observation-interruption.md)
> History: [CF-201 인터럽트 처리](../../raw/issues/CF-201/documents/quality-observation-interruption.md)
> Updated: 2026-10-13

## 현재 상태

이미 인터럽트된 호출은 품질 관측 작업을 제출하지 않고 null을 반환한다. 인터럽트 상태를 보존하며 제출 후 인터럽트와 미완료 작업 취소는 기존 경로를 유지한다.

## 변경 이유

작업 제출 후 완료 Future가 먼저 반환되면 대기 중 인터럽트 처리에 들어가지 않을 수 있다. 제출 전 검사로 이 경쟁을 제거하고 완료 상태를 고정한 회귀 테스트와 실제 실행기의 인터럽트 테스트를 함께 사용한다.
