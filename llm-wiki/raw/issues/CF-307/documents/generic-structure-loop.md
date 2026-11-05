# 고등학교 행 단계 검사 후속 조사

## 확인된 관측과 코드

NAVER의 기존 `highschool-regression` 두 분석 실행에서 고등학교 행 전체가 `STRUCTURE_BLOCKED`였다. 재매칭 응답의 control 하나는 `education.university.minorName`, `MANUAL_REVEAL_REQUIRED`, 명령 없음, confidence 약 0.46~0.47이었다. backend를 바꾼 두 기록에서도 같은 구조상 현상이 남았으며, 이를 자격증 날짜 규칙 때문에 생긴 회귀로 확정하지 않는다.

`frontend/src/autofill/generic/structure-loop.ts:1116`의 key 수집은 해당 행의 `MATCH`와 profileFieldKey가 있는 binding을 사용하며 writability를 조건으로 걸지 않는다. `:1129`는 key가 없거나 선택한 학력 단계 prefix와 다른 key가 하나라도 있으면 `STAGE_KEY_MISMATCH`로 행을 차단한다. 이 조합은 쓰기 불가 control의 다른 단계 key도 행 전체 보류에 영향을 줄 수 있음을 보여 준다.

## 미확정 가설과 후속 방향

해당 control이 숨은 대학 분기 control일 가능성은 가설이다. 원본 의미 텍스트 전체의 동일성, 공급자 내부 판단과 원인 전체는 확인하지 않았다. 쓰기 불가·숨은 key를 단계 검사에서 제외하는 방향은 후속 검토 후보이며 승인된 제품 결정, 수정 완료 또는 회귀 검증 결과가 아니다. 실제 차단 원인 확정과 제외 조건의 안전성은 별도 재현·검증이 필요하다.

## 근거와 경계

`highschool-regression/ed34db1-baseline`과 `e1ac505-backend`의 기존 분석 구조 기록, `ab-verification.json`과 위 코드 조건을 대조했다. 실제 지원서 기입·저장·제출이나 새로운 공급자 실행은 수행하지 않았다. 원본 입력값·세션·페이지 식별 주소는 옮기지 않는다.

CF-260의 범용 경로 전용 구조 반복 실행, 단계별 캐시·로컬 행 기록과 보류 격리는 현재 구현 경계로 유지한다. 이번 수집은 그 경계 위의 미해결 사례를 추가하며 구조 행동 ADR의 상태를 바꾸지 않는다.
