# 승인된 날짜 대상의 기본 선택과 반복 열 근거

## 승인된 현재 계약

범용 `SELECT_DATE` 대상은 유효한 `calendarApproval` 또는 `dayCalendarApproval`이 있으면 기본 선택한다. 연월 전용 칸은 날짜 단위의 형식 차이이지 모호성이 아니므로 확인 필요에 남기지 않는다. 실제 기입에서는 기존 달력 소유권·대상·날짜 형식·승인 재검증을 통과해야 한다. 달력 승인이 없는 대상을 임의로 승격하지 않는다.

추가된 반복 행에서 대상에 직접 연결된 라벨이 없을 때만 `calendar-unit.ts`의 `sharedColumnLabels`가 다른 행의 같은 열에서 날짜 단위 근거를 빌린다. 같은 부모, 동일한 검증된 반복 그룹, 같은 행 구조와 열이어야 한다. control 개수·순서, 행 안 DOM 경로, tag/type, 정규화한 name, readonly, maxlength와 placeholder가 일치해야 하며, 모호한 그룹·다른 그룹·다른 구조·중복 id는 근거로 삼지 않는다. 날짜 단위 근거가 없거나 충돌하면 기존 보류 경계를 따른다.

## 근거와 검증 경계

- `frontend/src/autofill/review/review-plan.ts`: `SELECT_DATE`의 selected 식과 월·일 단위 승인 생성.
- `frontend/src/autofill/interaction/calendar-unit.ts`: `sharedColumnLabels`, `assignRepeatGroups`, `sameRepeatGroupKey`, `calendarUnitEvidence`.
- 기존 로컬 근거 묶음 `acquired-certificate-contract`는 첫 행만 라벨이 연결된 구조와 명시적 반복 그룹 경계의 합성 회귀를 보존한다. 이번 수집은 코드와 기존 근거를 대조했으며 테스트를 재실행하지 않았다.

CF-118의 공유 달력 루트 소유권, 0~11 월 select 검증과 월·일 달력 동시 감지 보류는 유지한다. 반복 열 근거 보완은 달력 실행 승인 우회가 아니며 실제 지원서 기입 성공을 의미하지 않는다.
