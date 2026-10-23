# 검색 표면 닫기 판정과 실패 사유 타입

## 승인한 지식 후보

1. Close-only safety deliberately excludes STRUCTURAL_CLICK_FORBIDDEN_ACTION because that pattern matches bare 닫기/close. CLOSE_LABEL_BLOCKING_PATTERNS preserves the original first three pattern checks, while generic structural clicks retain all four patterns; including the fourth in close-only checks causes seven characterization failures.
2. A failed read-only search on an owned same-document layer reports no_safe_close_control when no safe close control exists and close_not_confirmed when a safe close click does not close the layer. Synthetic executor characterization tests cover both causes and successful closure while same-surface save/submit click observers remain uncalled.
3. SurfaceLeftOpenReason in interaction/readonly-search.ts is the canonical no_safe_close_control | close_not_confirmed type. write/write-result.ts reuses it via an import type instead of duplicating the literal union, preserving runtime behavior.

## 코드 근거와 검증 범위

- `frontend/src/autofill/generic/click-policy.ts`: `isSafeSurfaceCloseClick`, `CLOSE_LABEL_BLOCKING_PATTERNS`, `FORBIDDEN_LABELS`.
- `frontend/src/autofill/generic/click-policy.test.ts`: 순수 닫기 라벨 허용, 혼합 라벨 및 아홉 `ClickBlockReason`의 직접 판정.
- `frontend/src/autofill/interaction/readonly-search-close.test.ts`: 합성 레이어에서 두 닫기 실패 사유, 정상 닫기와 저장·제출 클릭 관측 0회.
- `frontend/src/autofill/interaction/readonly-search.ts`, `frontend/src/autofill/write/write-result.ts`: `SurfaceLeftOpenReason` 타입 재사용.

특성화 테스트는 정리 전후 각각 69개가 통과한다. 격리 복사본에서 닫기 라벨 검사를 제거하면 17개, 네 번째 패턴을 닫기 판정에 포함하면 7개 테스트가 실패하며 각 변이 실행은 exit 1이다. 복원한 복사본은 exit 0이다. 이 결과는 합성 DOM의 현재 복구 검증이며 과거 커밋 전 RED나 실사이트 검증을 뜻하지 않는다. 실제 지원서 값, 계정과 세션 정보는 포함하지 않는다.
