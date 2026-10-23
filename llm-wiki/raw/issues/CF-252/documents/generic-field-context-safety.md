# 범용 칸 라벨 문맥과 형식 등급 검사

## 승인한 지식 후보

범용의 끊긴 라벨 복원은 collectFieldsSnapshotWithDropdowns에서 선택 인자를 켜며 기본 collectFieldsSnapshot과 정책 경로는 기존 요청을 유지한다. 같은 소유 그룹의 단일 컨트롤 또는 연속 select 2~3개만 허용하고 반복 행·다른 그룹·혼합 컨트롤·숨김/복수 라벨 경계를 넘지 않는다. select 표시명은 보존하고 semanticContext.labels에만 복원 라벨을 더한다.

범용 등급에서 이름과 의미 라벨이 모두 비어 있으면 고신뢰 매칭도 NO_FIELD_CONTEXT로 REVIEW 처리한다. postal-code autocomplete 또는 maxLength 6 이하와 numeric inputMode를 가진 칸에 주소 키가 오거나 email/tel 입력에 다른 형식의 키가 오면 FORMAT_KEY_MISMATCH로 BLOCKED 처리한다. 기존 신뢰도 경계와 기존 사유 우선순위는 유지한다.

검토된 AhnLab v4 우편번호 칸은 title이 DOM에만 있고 수집 후보에는 title/placeholder와 우편번호 형식 힌트가 없다. 2026-10-18 사용자 승인(오케스트레이터 추천안: 범용 흐름에서 실제 요소 자체 title/placeholder만 읽기). 공유 수집·정적 후보 타입·API는 확장하지 않으며 DOM title을 API에 추가 전송하지 않는다.

## 적용과 검증

`frontend/src/autofill/dom/collect.ts`의 기본 `collectFieldsSnapshot`은 복원 인자를
생략하면 기존 동작을 유지한다. 범용 `collectFieldsSnapshotWithDropdowns`만 복원을
켜며 정책 문서는 기존 수집으로 반환한다. `metadata.ts`의 라벨 소유 관계 검사와
`semantic-context.ts`의 선택 인자가 문맥 복원을 담당한다.

`frontend/src/autofill/generic/generic-analysis.ts`는 기존 registry의
`handle.elements[0] ?? handle.customElements[0]`로 해석한 `SegmentField.element`에서
자체 title과 placeholder를 읽는다. 이 로컬 힌트와 이미 수집한 형식·라벨 정보를
`generic/field-grading.ts`에 전달한다. 회사별 selector나 공유 후보/API 필드를
추가하지 않는다.

검증 근거는 다음 테스트다.

- `dom/broken-label-context.test.ts`: select 2~3개 연결과 그룹·반복 행·혼합 입력·숨김 등 음성 사례.
- `workflow/dom-snapshot.lg-ai-research.test.ts`: 기본 경로의 기존 단언 보존과 범용 생년월일 문맥 복원.
- `workflow/dom-snapshot.sk-careers.test.ts`: 복원 인자를 요청해도 정책 수집 요청이 동일함.
- `generic/field-context-safety.test.ts`: LG·AhnLab 구조 기반 문맥·형식 변이.
- `workflow/dom-snapshot.ahnlab.test.ts`: 무변경 v4 칸에 고정 addressLine1 응답을 주면
  BLOCKED가 되고 강제 승인에도 쓰이지 않으며, postalCode 응답은 이 규칙으로 막히지 않음.
- `generic/generic-analysis.test.ts`: 자체 title/placeholder 전달, 무관한 title과 부분 단어 음성 사례.

고정 API 응답과 메모리상 변이는 코드 등급·검토·쓰기 소비의 근거다.
실제 JEV 매칭, 설치 확장 실행이나 실사이트 성공률을 입증하지 않는다.
