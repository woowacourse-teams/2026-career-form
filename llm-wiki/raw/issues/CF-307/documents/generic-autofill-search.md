# 원래 이름 검색의 자동 선택 경계

## 승인된 현재 계약

범용 검색 칸은 실행 시 저장된 원래 이름만 결과와 비교하는 경우에만 기본 선택한다. `review-plan.ts`의 `selectsOriginalSearchName`은 범용 검색 명령, DIRECT binding, catalogMatch 없음, 학교 소재지 키 아님, 검색 계획 없음 또는 `original-exact` 한 형태만 존재함을 요구한다. 기본 선택은 검색 실행 성공을 뜻하지 않는다. 실행 시 완결된 결과 집합에서 정규화한 정확 일치가 하나여야 실제 선택하며, 일치 없음 또는 중복은 선택하지 않는다.

자격증 이름+등급을 분리하는 재검색, 카탈로그 기반 검색어와 학교 소재지 별칭은 원래 이름과 다른 결과를 선택할 수 있으므로 확인 필요에 남긴다. `readonly-search-executor.ts`는 검색 형태마다 비교 집합을 새로 만들며, 검토된 대체 형태의 재시도 허용과 기본 선택 허용을 구분한다.

## 근거와 검증 경계

- `frontend/src/autofill/review/review-plan.ts`: `selectsOriginalSearchName`과 검색 항목의 status·selected.
- `frontend/src/autofill/interaction/readonly-search-executor.ts`: `attempts`, `attemptValues`와 정확 일치·재시도 처리.
- `frontend/src/autofill/interaction/readonly-search-executor.test.ts:752`: 완결된 첫 검색에서 정확 일치가 없을 때 분리한 두 번째 이름을 선택하는 합성 회귀. 원래 프로필 이름과 선택 이름이 다를 수 있음을 보여 준다. 불완전·중복 결과는 재시도하지 않는 이웃 반례가 있다.

이번 수집은 위 코드를 읽어 계약을 대조했다. 기존 합성 회귀를 새로 실행하거나 실제 지원서에 검색 결과를 입력한 것은 아니다. CF-117의 공급자 중립 구조 해석과 로컬 유일성·소유권·선택 효과 재검증, 기존 CJ 제한 계약과 검색 후 재승인 경계는 유지한다. 기본 선택 정책만 이를 보완하며 실사이트 전체 검색 성공을 주장하지 않는다.
