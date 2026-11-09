# 미리 승인한 새 칸 자동 기입과 확인 필요 기본 포함

## 승인한 지식

- 제품 결정(2026-10-29): 범용 경로의 1차 검토는 "나타날 수 있는 칸"을 보여 준다. 대상은 1차 검토에서 쓸 수 있게 보인 칸이 덮지 않은 모든 범주의 저장된 프로필 값(프로필 키와 항목 순번)이다. 숨은 칸, 입력 불가로 보이던 조건부 칸, 영역 자체가 없던 범주(예: 다른 영역을 저장한 뒤에야 나타나는 어학)를 포함한다(`frontend/src/autofill/workflow/pre-approval.ts`의 `appearableProfileItems`).
- 사용자가 체크를 켜 둔 채 실행하면, 실행 중 새로 나타난 칸과 사용자가 페이지의 저장 버튼을 직접 누른 뒤 나타난 칸 중 승인 범위 안의 빈 포함 칸을 바로 기입한다(`isPreApprovedItem`).
- 제품 결정(2026-10-29 저녁): 새 칸에는 2차 검토 버튼을 띄우지 않는다. 승인 범위 밖이거나 확인 필요로 남는 새 칸, 기존 값이 있는 새 칸은 기입하지 않고 결과 화면의 "직접 확인할 새 칸"에 표시한다. 체크를 끄면 새 칸은 모두 이 목록으로만 간다.
- 제품 결정(2026-10-29 저녁): 1차 검토의 확인 필요에는 기존 값이 있는 칸, 연결 확신 보통(`MODERATE_CONFIDENCE`), 같은 선택지 없음(`OPTION_VALUE_UNMATCHED`)만 남긴다. 실행 중 검색 결과가 여러 개인 칸은 지금처럼 확인 필요로 남는다. 나머지 확인 필요 등급과 백엔드가 조건 확인(`CONDITIONAL`)으로 보류한 칸은 결정할 필요가 없으면 처음부터 포함해 자동 기입 예정에 보인다(`frontend/src/autofill/generic/generic-analysis.ts`의 `applyGenericGrade`).
- 저장 뒤 감시(`frontend/src/autofill/workflow/reveal-watch.ts`)는 아무것도 누르지 않는다. 사용자가 입력 중이거나 새 칸에 포커스가 있으면 기다리고, 페이지 주소가 바뀌면 멈춘다. 워크플로는 프로필 변경, 승인 항목 모두 처리, 감시 5회에서 감시를 끝낸다. 결과 화면에 "다시 묻지 않고 기입한 새 칸"을 표시한다.

## 근거와 경계

이 결정은 승인 범위 해석을 "보이는 칸"에서 "1차 검토에서 보여 준 프로필 값과 칸 종류"로 넓히고, 확인 필요를 사용자가 정말 결정해야 하는 칸으로 좁힌다. 이름 한쪽만 연결된 칸(`UNPAIRED_NAME_PART`)도 기본 포함되는 점은 사용자가 고른 권장안의 결과다. 회귀 테스트는 `pre-approval.test.ts`, `generic-review-grade.test.ts`, `review-plan.single-row.test.ts`, `AutofillWorkflow.pre-approval.test.tsx`, `WorkflowScreens.generic-tiers.test.tsx`에 있다. 실사이트에서는 가비아 새 칸 9개, NHN 새 칸 2개가 2차 버튼 없이 기입되었다. 정적 어댑터 경로는 바꾸지 않는다. 실제 지원값, 계정, 세션은 옮기지 않는다.
