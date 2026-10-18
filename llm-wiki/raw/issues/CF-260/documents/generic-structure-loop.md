# 범용 구조 반복 실행과 학력 행 격리

## 승인한 지식 후보

1. Generic structure preparation is opt-in at the workflow boundary. WorkflowAnalysisContext.collectFields defaults to collectFieldsSnapshotWithDropdowns, while the modern generic gate injects a collector with mixedSectionDetection:false. Static, policy, component, and omitted-injection calls retain their previous collector and mixed-row behavior.
2. Education row identity is a browser-local receipt created from ROW_KIND_OPTION results, not DOM option aliases. Each confirmed row records its selected control/value, profile section and section-local index; the collector splits repeat counts per stage and includes the actual selected option label as structural context. Matching caches distinguish stages so equal-looking bachelor and master rows do not share bindings.
3. Structural blocks are applied to generic analysis before the shared review planner, and reapplied to review items afterward. Removing blocked or stage-mismatched mappings before duplicate-target checks prevents a failed row from disabling an unrelated valid row. Blocked scopes remain unselected and disabled through approved writes.
4. Generic structural actions use observe-act-verify iterations with one decision per button, a live isSafeStructuralClick guard immediately before ADD/REVEAL mutations, the unchanged preparation executor for postchecks, a document lock for row-kind changes, a shared ten-action section budget, and a post-action URL-change abort. Abstention, unavailable classification, missing controls, rematch failures and stage mismatches produce local blocked reasons.

## 적용 위치

- `frontend/src/autofill/workflow/AutofillWorkflow.tsx`는 최신 범용 클라이언트 경로에만 구조 반복 실행과 전용 수집기를 연결한다. `workflow-analysis-types.ts`의 선택적 `collectFields`, `genericStructure`와 `workflow-analysis.ts`의 기본 수집 함수가 기존 경로를 유지한다.
- `frontend/src/autofill/generic/structure-loop.ts`의 `runGenericStructureLoop`가 추가, 펼치기, 행 종류 선택을 관찰-행동-검증으로 반복한다. 추가와 펼치기는 기존 `executeApprovedPreparationPlans`를 사용하고, 실행 직전 `isSafeStructuralClick`과 실행 후 URL 변경을 검사한다.
- `frontend/src/autofill/generic/structure-context.ts`의 `bindGenericStructureRows`는 확인된 행의 단계별 인덱스와 `:stage:` 그룹, 실제 선택 라벨을 연결한다. `generic-analysis.ts`의 캐시 키는 단계가 다른 동일 모양 행을 구분한다.
- `applyGenericStructureAnalysis`는 공유 검토 계획의 중복 대상 검사 전에 보류 매핑을 제거한다. `applyGenericStructureReview`는 검색 후속 검토를 포함해 선택 해제와 입력 불가 사유를 다시 적용한다.

## 검증과 한계

합성 DOM과 mock 상호작용 API의 구조 테스트는 1행에서 3행까지 추가, 버튼별 한 번의 판단, 기권 시 무클릭, 실행 직전 위험해진 버튼 차단, 두 섹션 펼치기, 섹션별 10회 한도, 분류 누락의 국소 보류, URL 변경 직후 중단을 검증한다.

`structure-workflow.integration.test.tsx`는 실제 `AutofillWorkflow`의 준비부터 승인된 값 쓰기까지 실행한다. 기존 혼합 행 탐지, 배정, 준비 호출이 0회인지, 학사와 석사 항목의 키와 단계별 인덱스가 맞는지, 보류 행은 쓰지 않고 유효한 이웃 행은 쓰는지 확인한다.

기본 인자 생략, 명시적 활성화와 범용 비활성화는 `collect.mixed-detection-option.test.ts`에서 비교한다. `default-collector.integration.test.ts`는 주입을 생략한 실제 분석 요청과 registry 메타데이터를 정적 fixture 및 설치된 정책 경로와 비교한다. 정적 FE 536개, 타깃 FE 978개와 선택한 BE 회귀 테스트가 통과했다. 전체 FE는 4,083개 통과, 기존 19개 건너뜀, 819.73초와 종료 코드 0이다. 구현 커밋의 `verify.py`도 종료 코드 0이다.

이 결과는 실제 공급자, 실사이트 또는 설치 확장의 자동 입력 성공을 의미하지 않는다. 실제 지원 정보, 계정, 세션과 시크릿은 기록하지 않는다. 기존 제안 ADR의 승인 상태를 변경하지 않는다.
