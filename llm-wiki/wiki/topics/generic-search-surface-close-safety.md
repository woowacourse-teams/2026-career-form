# 검색 표면 닫기 판정과 실패 사유 타입

> Topic: generic-search-surface-close-safety
> Status: Current
> Current: [CF-263 검색 표면 닫기 판정과 실패 사유 타입](../../raw/issues/CF-263/documents/generic-search-surface-close-safety.md)
> History: [CF-263 검색 표면 닫기 판정과 실패 사유 타입](../../raw/issues/CF-263/documents/generic-search-surface-close-safety.md)
> Updated: 2026-10-18

## 현재 상태

`isSafeSurfaceCloseClick`은 순수 닫기 라벨과 기존 구조 안전 조건을 함께 요구한다. `CLOSE_LABEL_BLOCKING_PATTERNS`는 기존 세 패턴을 유지하며 `닫기`·`close`를 금지하는 네 번째 패턴만 닫기 판정에서 제외한다. 일반 구조 클릭은 네 패턴을 모두 유지한다.

확장이 연 같은 문서의 검색 레이어에 안전한 닫기 컨트롤이 없으면 `no_safe_close_control`, 안전한 닫기 클릭 뒤에도 닫히지 않으면 `close_not_confirmed`를 남긴다. `write-result.ts`는 `readonly-search.ts`의 `SurfaceLeftOpenReason`을 타입으로 가져와 쓴다. 두 사유, 정상 닫기와 저장·제출 컨트롤의 클릭 관측 0회는 합성 실행기 테스트로 확인한다. 실사이트 검증을 뜻하지 않는다.

## 변경 이유

매직 인덱스와 중복 타입을 동작 변경 없이 정리하고, 순수 닫기에 네 번째 금지 패턴을 적용하면 안 되는 이유를 특성화 테스트와 변이 실패로 남긴다. 후속 보류 범위는 [검색 실패 격리](generic-search-failure-isolation.md), 일반 구조 클릭은 [드롭다운 클릭 경계](generic-dropdown-click-gate.md)를 함께 따른다.
