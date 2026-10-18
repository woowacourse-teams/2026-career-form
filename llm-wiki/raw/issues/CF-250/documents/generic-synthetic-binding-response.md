# 범용 칸 매칭 응답의 합성 값 표현

## 승인한 지식 후보

1. 범용 칸 매칭 응답(/api/v1/generic/fields/analyze)은 schemaVersion 3이며 칸마다 선택 속성 binding을 가진다. 이름 레시피 칸은 profileFieldKey null + binding {type: DERIVED, recipe: KOREAN_FULL_NAME|ENGLISH_FULL_NAME_GIVEN_FIRST|ENGLISH_FULL_NAME_FAMILY_FIRST}, 날짜 부분 칸은 날짜 키 + binding {type: DATE_PART, part: YEAR|MONTH|DAY}이며, 키와 binding이 모두 없는 칸만 BLOCKED다. 공유 /api/v1/fields/analyze 계약과 공유 ValueBinding은 바꾸지 않는다.
2. 날짜 부분(DATE_PART)은 JEV 선택이 아니라 코드가 확정한다. 칸이 select이고 선택지 형식이 맞을 때만 응답한다(YEAR: 4자리 연도가 과반, MONTH 1~12, DAY 1~31, 앞자리 0와 월·일 접미사 허용, 안내용 빈 선택지 제외). 학점 같은 숫자 select는 부분 선택지를 골라도 키 null, binding 없음이다. 부분 선택지 id는 내부 표기이며 응답에 나가지 않는다.
3. 이름 레시피 칸의 autofillPolicy, interactionStatus, writePlan은 GenericFieldPolicy가 공유 FieldInteractionPolicy.evaluate에 DerivedBinding Match를 넘겨 정하며, 공유 FieldsAnalysisService와 같은 값임을 비교 계약 테스트로 고정한다.

## 적용과 검증

`backend/src/main/java/com/careerform/formanalysis/generic/`의 `GenericFieldsResponse`는 SCHEMA_VERSION 3과 선택 binding(NON_NULL)을 갖고, `JevCategoryFieldResolver`는 성·이름 키가 있는 범주에 레시피 선택지를, 날짜 키가 있는 범주에 년·월·일 부분 선택지를 더한다. 라우팅 단락, 동시 호출 제한, 반복 행 복제, 재시도, 진단은 바꾸지 않는다.

검증은 모의 JEV와 합성 요청에 한정하며 공급자 요청과 응답에 프로필 값, 현재 입력값 표지, 프로필 항목 개수를 넣지 않는다. 성/이름이 나뉜 칸은 DIRECT 두 키 그대로다.
