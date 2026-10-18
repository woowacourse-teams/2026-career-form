# 범용 합성 값 표현의 소비와 등급 경계

## 승인한 지식 후보

범용 분석은 합성 값 binding을 공유 경로 형태로만 넘긴다. DERIVED 이름 레시피는 공유 DERIVED valueBinding으로, DATE_PART 날짜 부분 select는 공유 LOOKUP(optionMap: 로컬 날짜 → 지원서 선택지 표시값)으로 변환해 공유 ValueBinding·review-plan·쓰기 실행기를 바꾸지 않는다. 등급은 레시피에 필요한 이름 키가 모두 있을 때만, 날짜 부분은 선택지가 부분 형식(YEAR 4자리 과반, MONTH 1~12, DAY 1~31, 앞자리 0과 년·월·일 접미사 허용)에 맞고 로컬 값의 부분과 일치하는 선택지가 하나일 때만 통과시키며 아니면 DATE_PART_OPTIONS_MISMATCH로 BLOCKED 처리한다. 날짜와 그 부분은 브라우저 안에서만 쓰고 요청에 넣지 않는다. 이에 따라 generic-binding-frontend-validation 토픽의 '소비는 후속 #251' 서술이 현재 상태가 아니게 된다.

## 적용과 검증

`frontend/src/autofill/generic/generic-analysis.ts`의 `convertSection`이 응답 `binding`을 소비한다. 이름 레시피는 키 null인 칸도 `matched`·`rowSiblings`에 넣고 `valueBinding`을 `{type: "DERIVED", recipe}`로 둔다. 날짜 부분은 로컬 `birthDate`를 `generic/date-part-options.ts`로 나누어 선택지 하나를 고르고 `{type: "LOOKUP", profileFieldKey, optionMap: {로컬 날짜: 표시값}}`로 넘긴다. 선택지가 맞지 않으면 빈 optionMap이라 검토 항목이 만들어지지 않는다.

`generic/field-grading.ts`는 선택 `composite`(DERIVED 또는 DATE_PART)를 입력에 더했다. 레시피의 `hasProfileValue`는 `resolveValueBinding`이 결합 키를 모두 해석할 때만 참이다. DATE_PART는 `NON_DATE_FIELD` 대상에서 빠지고 select 선택지가 맞을 때만 통과한다. 같은 레시피나 같은 날짜 부분이 한 행에 두 번 오면 `DUPLICATE_KEY_IN_ROW`로 낮춘다. 기존 이유와 경계값은 바뀌지 않는다. 검증은 합성 프로필과 API mock에 한정하며 실사이트 실행은 하지 않았다.
