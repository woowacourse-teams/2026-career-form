# 범용 합성 값 표현의 frontend 검증 경계

> Topic: generic-binding-frontend-validation
> Status: Current
> Current: [CF-251 범용 합성 값 표현의 소비와 등급 경계](../../raw/issues/CF-251/documents/generic-binding-frontend-validation.md)
> History: [CF-250 범용 합성 값 표현의 frontend 검증 경계](../../raw/issues/CF-250/documents/generic-binding-frontend-validation.md); [CF-251 범용 합성 값 표현의 소비와 등급 경계](../../raw/issues/CF-251/documents/generic-binding-frontend-validation.md)
> Updated: 2026-10-18

## 현재 상태

FE 범용 응답 validator와 타입은 schemaVersion 3과 두 binding 형태를 받고, 버전 2와 규칙 위반은 계약 오류로 거부한다. convertSection은 이 binding을 소비한다. DERIVED 이름 레시피는 공유 DERIVED valueBinding으로, DATE_PART 날짜 부분 select는 공유 LOOKUP(optionMap: 로컬 날짜 → 선택지 표시값)으로 바꿔 공유 타입과 검토·쓰기 경로를 바꾸지 않는다. 등급은 레시피의 이름 키가 모두 있고, 날짜 부분은 선택지가 부분 형식에 맞으며 로컬 값의 부분과 일치하는 선택지가 하나일 때만 통과하고 아니면 DATE_PART_OPTIONS_MISMATCH로 BLOCKED다. 날짜와 그 부분은 브라우저 안에서만 쓰고 요청에 넣지 않는다. BE와 FE를 함께 배포해야 한다.

## 변경 이유

CF-250의 소비 보류를 풀어 이름 레시피 칸과 년·월·일 select가 검토 항목에 나타나게 하되, 공유 경로를 그대로 쓰고 날짜 형식은 코드가 보증하기 위해서다.
