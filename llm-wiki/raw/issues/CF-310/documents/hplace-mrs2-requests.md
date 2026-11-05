# 에이치닷 MRS2 지원서의 저장·조회·무저장 이동 요청

> Issue: CF-310
> Collected: 2026-10-21
> Approval-Digest: 613b4acd5fd87f8d2186b4ac401715fbed539b93eea1421f11163fb5591ee258
> Source-Revision: 149b350a7ed85aefcb65448f816c6901d30f2b12

이 문서는 2026-10-21에 승인된 CF-310 후보 1을 수집한 기록이다. Approval-Digest는 [승인 후보 스냅샷](approved-candidates.md) 전체 UTF-8 바이트의 SHA-256이다. 어댑터 계약은 바꾸지 않는 새 운영 지식이며, 바꾸지 않은 내용은 Supersedes가 가리키는 CF-177 후속 보완 묶음을 따른다. 실제 지원값·계정·세션·URL 쿼리·대화 전문은 포함하지 않는다.

## 승인 후보

에이치닷 MRS2 요청 구조:

- 저장은 `saveStepN`으로 간다.
- `stepN.json`은 단계 데이터를 불러오는 요청이다.
- 학교·자격증 같은 조회는 `/com/code/retrieve*List`다.
- 무저장 이동은 `writeResume`에 키 3개만 담아 보내는 POST다.

## 근거

사이트 스크립트 `/resources-2.0.3a/mrs2/release/js/applicant/writeResume/writeResume.js`를 2026-10-21 gsenc 지원서에서 읽었다.

- **저장:** `save(saveType, step)`는 `/mrs2/applicant/resume/saveStep<현재 단계>`로 보낸다.
  - 하단 임시저장 버튼(`data-type="tempSave"`, `data-step` 없음)은 같은 경로에 `validateYn=false`를 붙여 저장만 하고 이동하지 않는다.
  - 작성 모드 1–4단계의 단계 탭과 다음 버튼은 `type="submit"`과 `data-step`을 가진 버튼이다. 누르면 폼 제출로 검증을 거쳐 `validateYn=true`로 저장한 뒤 그 단계로 이동한다.
  - `data-type="tempSave"`와 `data-step`을 함께 가진 탭 버튼은 미리보기 모드와 5단계(최종제출) 화면에만 있고, 저장 없이 이동한다(5단계는 이동 확인창 뒤).
  - 5단계의 `saveStep5`는 임시저장이 아니라 최종제출이다.
- **단계 데이터:** 1–4단계의 `load()`는 `{resumeSn, recruitNoticeSn, step}`을 `/mrs2/applicant/resume/step<단계>.json`에 POST하고 응답의 `STEP` 항목으로 화면을 그린다. 5단계는 `step` 없이 `step5.json`에 두 키만 보내고 응답 전체로 요약을 그린다. 둘 다 저장 처리는 부르지 않는다.
- **무저장 이동:** 사이트의 `locationSubmit(url, step)`은 `resumeSn`, `recruitNoticeSn`, 선택적 `step`만 담은 form을 받은 `url`에 POST한다. 미리보기 모드의 단계 이동은 `save`를 거치지 않고 `locationSubmit`으로 `writeResume`에 바로 보낸다. 5단계 화면의 탭 이동은 `save`를 거치지만 확인창 뒤 `writeResume`로 이동할 뿐 `saveStep` 요청은 보내지 않는다. 같은 함수가 저장 성공 뒤 이동과 최종제출 뒤 이동(`complete`)에도 쓰이므로, 무저장인지는 함수가 아니라 저장 없이 불렀는지로 정해진다.
- **조회:** 2026-10-21 실사이트 QA 실행 기록에서 관측한 학교·전공·자격증·어학 코드 검색은 모두 `/com/code/` 아래 POST였다. 다섯 테넌트(abl·careerhyundai·gsenc·gsretail·hankooktire)의 기록을 합치면 `retrieveCollegeList`, `retrieveCollegeMajorList`, `retrieveHighschoolList`, `retrieveLicenseList`, `retrieveForeignExamList`, `retrieveForeignExamGradeList`였다. 테넌트별로는 careerhyundai·gsenc·gsretail이 여섯 이름을 모두, abl이 `retrieveHighschoolList`를 뺀 다섯 이름을, hankooktire가 `retrieveHighschoolList`·`retrieveCollegeList`·`retrieveCollegeMajorList` 세 이름을 관측했다(hankooktire는 1·2단계만 실행).
- **실측:** 같은 날 `frontend/scripts/live-qa` 하네스가 세 키 POST로 gsenc 1단계를 다시 열었을 때, 원복 뒤 값이 남은 칸 24개는 모두 실행 전 값과 같았고 전체 칸 수도 실행 전후 30개로 같았으며, 요청 기록에 `saveStep`은 없었다.

## 쓰임

`frontend/scripts/live-qa/requests.mjs`의 허용 목록(코드 조회, 단계 데이터, 공고 팝업 조회, 세 키 이동)과 `page/hplace-step.mjs`의 무저장 단계 이동이 이 구조를 근거로 한다. 에이치닷 호스트로 가는 쓰기 요청은 이 목록 밖이면 막는다. 하네스의 클릭 가드가 단계 탭(`button[data-step]`)과 submit 버튼을 막는 이유도 작성 모드의 탭이 저장 요청을 보내기 때문이다.
