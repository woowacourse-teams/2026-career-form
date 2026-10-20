# 범용 전체 날짜 텍스트 칸 JEV 매칭 조사

## 승인한 지식 후보

1. Offline BE trace on two unrelated synthetic structures (editable text and readonly calendar-widget text) found no BE defect: DIRECT birthDate is offered and returned for PERSONAL, MIXED and ABSTAIN sections, DATE_PART on a full-date TEXT is safely rejected to a null key and binding, and part SELECTs keep their DATE_PART binding. No BE change was made.
2. Another confirmed category (e.g. EDUCATION) never offers birthDate or its DATE_PART options by design, so a misclassified section would silently lose the candidate. Whether the live E3 section was misclassified, the live provider chose DATE_PART or ABSTAIN, or the live CSS/calendar widget state caused it is unconfirmed; mock replies prove code paths only and E3 needs human re-evaluation on the live site.

3. The offline classification trace reads the sanitized AhnLab fixture to derive its label-for/input-id text candidate and heading, independently builds a synthetic readonly calendar table document, and runs both through SectionClassificationService and JevSectionClassifier with explicitly mocked HTTP provider responses. Returned categories are passed to GenericFieldsService; trace records include source SHA256, both provider requests, mock choices and explicit nullable outcomes. Visibility is modeled, not evaluated via CSS; no FE collector or live JEV call is claimed.

승인 출처: 사용자가 사전에 남긴 "wiki 나 adr 승인같은건 전부 승인이니까 그대로 하고" 위임을 오케스트레이터가 전달했다. 게이트 보완 후보까지 포함한 승인 digest는 `93111e1673e3486b37ce6fe5adbd51226592b1737c7eccdfc613ec4bcda86bb6`다.

## 재현 입력의 구조 (비식별)

최초 범주 주입 테스트에 더해 `classificationResponsesDriveMatchingForBothSourceStructures`가 원본에서 요청까지 연결한다. 구조 A는 기존 비식별 fixture에서 투영하며 구조 B는 독립 합성 문서다. 같은 회사 fixture의 변이를 두 사이트로 세지 않는다.

- 구조 A: `frontend/fixtures/dom-snapshots/ahnlab-write-resume-form/sanitized.html`을 테스트가 직접 읽는다. `label[for=birthday]`의 텍스트, `input[id=birthday]`의 type·placeholder·readonly·disabled 속성과 앞선 h2 제목을 투영한다. 편집 가능한 TEXT이며 표시 이름은 `생년월일`, 제목은 `지원자`다. CSS나 실제 위젯 상태는 읽지 않는다.
- 구조 B: 테스트 안의 독립 합성 table 문서다. 제목 `인적사항`, label-for/input-id로 연결한 읽기 전용 TEXT, placeholder `YYYY-MM-DD`, `semanticContext.inputType=text`를 사용한다. 원본 fixture의 변이가 아니며 회사 로직이 없다. 요청에 `SELECT_DATE` 지원을 명시한 정상 경로를 검증한다. 선언이 없는 요청의 동작을 이 결과로 단정하지 않는다.
- 두 구조 모두 visibility는 오프라인에서 VISIBLE로 모델링한다. 원본 HTML의 SHA-256, 출처, 투영 방식과 이 한계를 trace에 함께 남긴다. 이 투영은 FE collector 실행이 아니며 CSS 표시·레이아웃 수집을 증명하지 않는다.
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

확인한 사실(테스트로 고정): 위 표와 결과 전부. 테스트는 `GenericDateTextMatchingTest`다. 분류 HTTP 응답을 PERSONAL·MIXED·ABSTAIN·EDUCATION으로 각각 모의 설정하고 실제 `JevSectionClassifier`와 `SectionClassificationService`를 통과시킨다. 반환된 sectionId·category·snapshotId로 매칭 요청을 구성해 `JevCategoryFieldResolver`와 `GenericFieldsService`로 전달한다. 범주 상수를 분류 결과인 것처럼 삽입하지 않는다.

각 구조당 4개 분류 응답과 5개 선택 경우의 40개 trace를 `CF280_TRACE` JSON으로 테스트 XML의 standard output에 남긴다. 분류 요청/공급자 요청/모의 선택/분류 응답, 이어진 매칭 요청/선택지/모의 선택/BE 응답이 연결된다. 공급자 관측의 `birth date` 라벨과 `text` control, `input` element, `visible`은 단언한다. 결과의 key·binding·reason·interactionStatus·writePlan은 `outcome`에 null까지 명시한다. EDUCATION에서는 날짜 후보가 없으므로 실제 모의 선택을 ABSTAIN으로 기록하며 DIRECT가 선택됐다고 표현하지 않는다.

이 실행은 실제 코드 파이프라인의 오프라인 추적이지 모델의 정확도 측정이 아니다. 분류와 매칭의 공급자 응답 모두 명시적 mock이며 E3 당시 분류 결과를 복원하지 않는다. 값·개수 필드가 없는 DTO에서 생성한 캡처의 부재 검증이고, FE에 sentinel 값을 주입한 유출 검증은 아니다.

확인하지 못한 가설(원인 확정 아님):

1. 실제 JEV가 전체 날짜 TEXT에 DATE_PART를 고르면 BE는 안전하게 거부한다. 실제로 그렇게 골랐는지는 E3 당시 공급자 응답이 없어 알 수 없다.
2. 섹션이 PERSONAL이 아닌 다른 범주로 잘못 확정되면 DIRECT birthDate 후보가 사라진다. 실제 분류 결과는 관측하지 못했다.
3. 실제 CSS·달력 위젯의 읽기 전용·표시 상태나 FE 요청의 `inputType`·`SELECT_DATE` 선언 여부가 결과를 바꿀 수 있다. 실사이트 상태는 읽지 않았다.

## BE 수정 여부와 이유

BE 변경 없음. 재현한 모든 경로에서 DIRECT는 유지되고 잘못 고른 DATE_PART와 ABSTAIN은 설계된 안전 거부로 끝났다. 기존 안전 거부는 결함이 아니며 DATE_PART를 DIRECT로 바꾸거나 `생년월일` 라벨만으로 섹션을 PERSONAL로 강제하지 않는다.

초기 실패 이력은 삭제하지 않는다. `t1`은 문맥이 부족한 readonly 구조에도 쓰기 계획이 있다고 기대한 테스트 오류로 writePlan non-null 단언이 실패했다. `t2`는 추가했던 'readonly TEXT에 SELECT_DATE를 선언하지 않으면 BLOCKED' 단언이 실제 READY와 달라 실패했다. 그 미입증 음성 단언은 최종 테스트에서 제거했고, 두 실패 모두 제품 결함 RED나 수정 증거로 세지 않는다. 당시 완전한 소스 스냅샷은 없어 실제 READY 이유를 확정하지 않는다. 유지한 양성 경로는 명시적 TEXT 문맥과 SELECT_DATE 지원이 있는 요청이다.

## 한계와 후속

모의 응답은 실제 JEV 판단이나 실사이트 CSS 상태를 증명하지 못한다. E3 해결을 주장하지 않는다. 설치본 revision과 예시 프로필 사용 여부를 확인한 뒤 사람이 실사이트에서 날짜 칸의 표시·읽기전용·비활성·달력 상태, 섹션 범주, 매칭 결과의 존재 여부만 비식별로 기록해 재평가해야 한다.
