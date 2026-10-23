# CF-281 요청 fixture와 합성 반례 출처

## NAVER 구조 기준선

`naver-career-sections.request.json`은 승인된
`frontend/fixtures/dom-snapshots/naver-step2-form/sanitized.html`의
경력·자격·어학 구조를 비식별 요청으로 투영한 기준선이다. 실사이트 요청 캡처가 아니며
행 추가 등 합성 요청 구성은 실제 수집 상태를 입증하지 않는다. 이번 게이트 수정에서는
이 기준선과 정제 HTML을 변경하지 않는다.

- 정제 HTML SHA-256: `24ee92f36ecbc1508734760ec48552f83a053ae134bd7bc05d1e2d33d333afc6`
- 기준선 요청 SHA-256: `e5ec7fe5ec0b33ee8c526d347fe9e062a57aa0c3289f806d40d76791a0b2b49f`
- 정제 HTML 502–503행: 업무내용(요약) 라벨과 text 입력, maxlength 30.
- 정제 HTML에는 프로젝트 상세 필드가 없다. 따라서 그 필드를 수집했다고 주장하지 않는다.

## 명시적인 합성 adversarial mutation

`naver-career.synthetic-adversarial.request.json`은 기준선의 CAREER 첫 행만 복사하고
`synthetic-project-detail-0` 한 칸을 더한 **합성 변이**다.

추가 칸은 `nv-career-job-0`의 구조(input/text/visible, inputType text, maxLength 30,
placeholder 출처, 반복 문맥)를 복사했다. 후보 ID만 합성 ID로 바꾸고 라벨과 semantic
label text는 독립 합성 요청의 `sy-exp-project`에서 가져온 `주요 프로젝트 상세`로 바꿨다.
그 밖의 원래 세 후보는 기준선과 동일하다. 실제 NAVER 화면에 프로젝트 칸이 있다는
주장이 아니라, 출처 구조 위에 혼동 반례를 주입한 오프라인 검사다.

`independent-synthetic-sections.request.json`은 독립 작성한 합성 지원서다.
`responsibilitiesAndProjectDetailsAreDistinctOnBothStructures`는 위 명시적 변이와
독립 합성 구조 양쪽에서 공급자에게 실제로 투영된 canonical label을 읽는 mock을 사용해
업무내용의 키 전달과 프로젝트 상세 기권을 검사한다.

## 점수·등급 단독 ablation

두 기준 요청의 어학 행에는 점수 텍스트와 등급 select가 함께 있다.
`scoreOnlyAndGradeOnlyUseExistingResultKey`는 각 구조의 반대 결과 칸 하나만
제거해 score-only와 grade-only 요청을 만드는 **합성 ablation**이다.
`competingScoreAndGradeTargetsAbstain`는 두 칸을 함께 남긴 경우를 별도로 검사한다.
원본 화면이 단독 칸만 제공한다고 주장하지 않는다.

판단 mock은 이 세 검사에서 원본 라벨이나 후보 ID를 읽지 않고 캡처된 공급자 payload의
기존 키, 구조화된 acceptedTargetKinds, 정제 관측을 읽는다. 실제 JEV는 실행하지 않으며
이 결과는 모델 의미 정확도나 실사이트 성공률의 근거가 아니다.
