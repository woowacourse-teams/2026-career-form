# 범용 드롭다운의 구조 클릭 허용 경계

## 승인한 지식 후보

범용 드롭다운 수집은 isSafeStructuralClick(trigger, trigger.closest("form") ?? document.body).allowed를 그대로 따른다. aria-label 또는 title 때문에 금지된 트리거도 보이는 문구가 안전하다는 이유로 우회하지 않는다. 허용 메뉴 테스트는 정책이 허용하는 칸 라벨을 사용하고, 금지 accessible label은 클릭 0회로 따로 검증한다.

## 적용과 검증

`frontend/src/autofill/dom/collect.ts`의 `collectFieldsSnapshotWithDropdowns`는 범용 문서에서만 `collectButtonDropdowns`에 이 술어를 전달한다. 정적 문서는 기존 수집으로 반환한다. 클릭 정책의 금지 이유를 수집기에서 다시 허용하는 예외는 두지 않는다.

`frontend/src/autofill/dom/button-dropdown.test.ts`는 금지된 aria-label과 title, 삭제·업로드·제출 트리거의 클릭 0회를 검증한다. canClick을 생략한 기존 collector 동작은 별도 테스트로 유지한다. 허용 메뉴용 합성 fixture는 안전한 라벨을 사용하며 회사별 예외를 추가하지 않는다.

검증은 합성 DOM과 API mock에 한정한다. 실제 지원서의 입력, 제출, 계정 또는 세션 정보는 기록하지 않는다.
