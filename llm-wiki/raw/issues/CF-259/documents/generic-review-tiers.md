# 범용 검토 화면의 3단계 표시

## 승인한 지식 후보

1. 기술: 범용 검토 항목은 범용 경로에서만 `genericGrade`(AUTO, REVIEW, BLOCKED)와 `genericReasonCode`를 가진다. 정적·컴포넌트 경로는 두 필드를 만들지 않고 `ReviewPlanItem`의 기존 필드 의미는 그대로다.
2. 기술: 매칭 키가 null이라 등급이 없는 NO_MATCH 칸은 `genericGradeFor`가 BLOCKED와 UNLINKED 이유로 보충한다. `reviewItemsForDisplay`는 `unavailable` 항목 중 `genericGrade`가 BLOCKED인 것만 통과시키고, 정적 경로의 `unavailable` 항목은 계속 숨긴다.
3. 컨벤션: 등급 이유와 섹션 실패 코드의 사람용 문구는 `generic/grade-reason-text.ts`의 `genericReasonText` 한 함수로 변환하고 모르는 코드는 `GENERIC_BLOCKED_REASON`을 쓴다. 문구 표는 `Record` 타입이라 `GradeReason`이나 `GenericSectionFailure`를 추가하면 컴파일 오류로 문구 누락을 알린다. 이 Issue 시점의 develop에는 `DATE_PART_OPTIONS_MISMATCH`와 `OTHER_PERSON_CONTEXT`도 이미 있어 표에 포함했다. Issue 본문의 날짜 부분 이유 미도입 전제와 다르다.
4. 비즈니스: 범용 검토 화면은 수집 후보로 올라온 칸만 보여 준다. 동의·파일·제출 컨트롤은 수집에서 제외돼 나오지 않는다. AUTO는 선택, REVIEW는 체크 해제와 "확인 필요", BLOCKED와 연결하지 못한 칸은 선택 불가 "입력 불가"와 이유 문구로 보인다. 입력 불가 칸은 `disabled`라 토글과 승인으로도 쓰이지 않는다.

## 적용과 검증

`applyGenericGrade`가 등급과 이유 코드를 항목에 더하고, `workflow-analysis.ts`는 `genericGradeFor`로 얻은 등급을 적용한다. `review-plan.ts`의 `reviewItemsForDisplay`는 `genericGrade`가 BLOCKED인 `unavailable` 항목만 추가로 통과시킨다. `WorkflowScreens.tsx`의 검토 단계가 단계 라벨과 이유 문구를 보여 주며, 정적 경로는 기존 `statusLabel`과 `item.reason`을 그대로 쓴다.

검증 근거는 다음 테스트다.

- `generic/generic-review-grade.test.ts`: 등급·이유 전달, 등급 없는 NO_MATCH 보충, 정적 항목 숨김과 출력 동일성.
- `generic/grade-reason-text.test.ts`: 모든 이유 코드의 문구, 고정 문구와 모르는 코드의 일반 문구.
- `workflow/WorkflowScreens.generic-tiers.test.tsx`: 세 단계 표시, 입력 불가 항목의 포함 버튼 부재, 비활성 항목 토글 무시와 승인 제외.

jsdom 렌더링 테스트는 화면 레이아웃의 잘림이나 겹침을 입증하지 않는다. 확장을 로드한 Chrome과 백엔드 LLM 등급을 쓰는 브라우저 QA는 실행하지 못했고, 실사이트 동작은 입증하지 않는다.
