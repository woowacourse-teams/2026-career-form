# 범용 합성 값 표현의 frontend 검증 경계

## 승인한 지식 후보

FE는 이 단계에서 binding을 검증만 하고 소비하지 않는다(convertSection 소비는 후속 FE Issue #251). 그때까지 이름 레시피 칸은 연결 없음, 날짜 부분 select는 DIRECT 날짜 키로 변환되어 NON_DATE_FIELD로 BLOCKED가 되므로 값이 잘못 쓰이지 않는다. 버전 2 validator 확장은 v3 응답을 거부하므로 BE와 FE를 함께 배포해야 한다. FE validator는 DERIVED 칸의 autofillPolicy를 ALLOWED로 검증한다.

## 적용과 검증

`frontend/src/autofill/api/validate-generic-response.ts`는 버전 3과 두 binding 형태만 받는다. DERIVED는 키 null과 레시피 3종, DATE_PART는 날짜 프로필 키와 부분 3종일 때만 통과하고, 버전 2와 규칙 위반은 `AnalysisContractError`로 거부한다. `api/types.ts`의 `GenericFieldsResponse`만 바뀌며 공유 `ValueBinding`, `DerivedRecipe`, `validate-response.ts`는 그대로다.

`generic/generic-analysis.ts`는 변경하지 않는다. 응답 fixture의 schemaVersion은 `api/runtime-client.test.ts`와 `generic/*.test.*`에서 3으로 갱신했다. 검증은 합성 응답에 한정한다.
