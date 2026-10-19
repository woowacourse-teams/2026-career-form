# 범용 전체 날짜 텍스트 칸 JEV 매칭 조사

## 승인한 지식 후보

1. Offline BE trace on two unrelated synthetic structures (editable text and readonly calendar-widget text) found no BE defect: DIRECT birthDate is offered and returned for PERSONAL, MIXED and ABSTAIN sections, DATE_PART on a full-date TEXT is safely rejected to a null key and binding, and part SELECTs keep their DATE_PART binding. No BE change was made.
2. Another confirmed category (e.g. EDUCATION) never offers birthDate or its DATE_PART options by design, so a misclassified section would silently lose the candidate. Whether the live E3 section was misclassified, the live provider chose DATE_PART or ABSTAIN, or the live CSS/calendar widget state caused it is unconfirmed; mock replies prove code paths only and E3 needs human re-evaluation on the live site.

승인 출처: 사용자가 사전에 남긴 "wiki 나 adr 승인같은건 전부 승인이니까 그대로 하고" 위임을 오케스트레이터가 전달했다. 승인 digest는 `7f7a1af804f79e38d63b1b046937d0fd7a33a8355d3c7698d727f2f3b6fab8e3`다.

## 재현 입력의 구조 (비식별)

두 구조 모두 지원자 값 없이 합성한 칸이며 서로 다른 사이트를 모사하지 않는다. 같은 칸 구조를 두 사이트로 세지 않는다.

- 구조 A: 편집 가능한 TEXT 입력. 표시 이름 `생년월일`, 보임, readonly·disabled 없음. AhnLab #252 fixture의 일반 텍스트 입력(`label for` 연결, 날짜 형태 class)과 같은 관측 구조다.
- 구조 B: 읽기 전용 TEXT 입력. 표시 이름 `생년월일`, placeholder `YYYY-MM-DD`, `semanticContext.inputType=text`. 달력 위젯이 값을 채우는 입력을 모사한다. 요청이 `SELECT_DATE`를 선언한 경우만 쓰기 계획이 만들어진다.
- 날짜 부분 SELECT(년·월·일)와 전체 날짜 TEXT를 한 섹션에 함께 둔 문서.

## 기대와 실제 (모의 JEV 응답, 코드 경로 확인)

| 섹션 범주 | DIRECT birthDate 후보 | 비고 |
| --- | --- | --- |
| PERSONAL, MIXED, ABSTAIN | 있음, DATE_PART YEAR·MONTH·DAY 3종과 ABSTAIN도 있음 | 두 구조 모두 동일 |
| EDUCATION 등 다른 확정 범주 | 없음 | `birthDate`가 PERSONAL 키이므로 의도된 축소 |

같은 TEXT 칸에 모의 응답을 바꿔 준 결과:

- DIRECT `personal.personal.birthDate`: 키 그대로, binding 없음, reason 없음. 구조 A는 `READY`와 `SET_TEXT`, 구조 B는 `READY`와 `SELECT_DATE`.
- DATE_PART YEAR·MONTH·DAY: 키와 binding이 null, `BLOCKED`, 쓰기 계획 없음.
- ABSTAIN: 키 null, `BLOCKED`. 안전한 미연결이다.
- 날짜 부분 SELECT와 전체 날짜 TEXT 공존: SELECT의 DATE_PART는 유지되고, TEXT의 DATE_PART만 거부되며 TEXT의 DIRECT는 유지된다.
- 공급자 요청 본문에는 합성 프로필 값, 현재 입력값 표지, 프로필 항목 개수가 없다.

## 확인한 사실과 가설

확인한 사실(테스트로 고정): 위 표와 결과 전부. 테스트는 `GenericDateTextMatchingTest`다.

확인하지 못한 가설(원인 확정 아님):

1. 실제 JEV가 전체 날짜 TEXT에 DATE_PART를 고르면 BE는 안전하게 거부한다. 실제로 그렇게 골랐는지는 E3 당시 공급자 응답이 없어 알 수 없다.
2. 섹션이 PERSONAL이 아닌 다른 범주로 잘못 확정되면 DIRECT birthDate 후보가 사라진다. 실제 분류 결과는 관측하지 못했다.
3. 실제 CSS·달력 위젯의 읽기 전용·표시 상태나 FE 요청의 `inputType`·`SELECT_DATE` 선언 여부가 결과를 바꿀 수 있다. 실사이트 상태는 읽지 않았다.

## BE 수정 여부와 이유

BE 변경 없음. 재현한 모든 경로에서 DIRECT는 유지되고 잘못 고른 DATE_PART와 ABSTAIN은 설계된 안전 거부로 끝났다. 기존 안전 거부는 결함이 아니며 DATE_PART를 DIRECT로 바꾸거나 `생년월일` 라벨만으로 섹션을 PERSONAL로 강제하지 않는다. 첫 테스트 실행의 실패 한 건은 구조 B의 기대 쓰기 명령을 `SET_TEXT`로 잘못 쓴 테스트 오류였고 BE 결함이 아니다.

## 한계와 후속

모의 응답은 실제 JEV 판단이나 실사이트 CSS 상태를 증명하지 못한다. E3 해결을 주장하지 않는다. 설치본 revision과 예시 프로필 사용 여부를 확인한 뒤 사람이 실사이트에서 날짜 칸의 표시·읽기전용·비활성·달력 상태, 섹션 범주, 매칭 결과의 존재 여부만 비식별로 기록해 재평가해야 한다.
