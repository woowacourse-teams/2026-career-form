# 범용 합성 값 표현의 frontend 검증 경계

> Topic: generic-binding-frontend-validation
> Status: Current
> Current: [CF-250 범용 합성 값 표현의 frontend 검증 경계](../../raw/issues/CF-250/documents/generic-binding-frontend-validation.md)
> History: [CF-250 범용 합성 값 표현의 frontend 검증 경계](../../raw/issues/CF-250/documents/generic-binding-frontend-validation.md)
> Updated: 2026-10-18

## 현재 상태

FE 범용 응답 validator와 타입은 schemaVersion 3과 두 binding 형태를 받고, 버전 2와 규칙 위반은 계약 오류로 거부한다. convertSection은 binding을 아직 소비하지 않아 이름 레시피 칸은 연결 없음, 날짜 부분 select는 NON_DATE_FIELD로 BLOCKED다. 소비는 후속 FE Issue #251에서 한다. BE와 FE를 함께 배포해야 한다.

## 변경 이유

계약 버전을 올려 변경을 명시하고, 소비 전까지 잘못된 값 쓰기를 막으면서 BE와 FE 변경을 한 PR로 묶기 위해서다.
