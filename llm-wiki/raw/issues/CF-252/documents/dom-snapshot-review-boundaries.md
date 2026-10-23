# 지원서 DOM fixture의 표시 텍스트 검토와 재현 경계

## 승인한 지식 후보

AhnLab 등록본은 개인정보·구조 검토를 통과한 v4 원문을 무변경 보존한다. 폼 내부 header/session 영역을 제외해도 읽기 전용 표시 텍스트는 별도 개인정보 검토가 필요했다. v2/v3는 철회·삭제됐고 실제 값은 기록하지 않는다. 추가질문은 고정 API 기권 응답의 NO_MATCH 소비 사례로 유지하며 실제 JEV 매칭이나 실사이트 성공의 근거로 쓰지 않는다. 추천인 연락처 오매칭은 #252 범위 밖 후속 발견이다.

## 적용과 검증

등록 경로는 `frontend/fixtures/dom-snapshots/ahnlab-write-resume-form/`이다.
HTML SHA-256은
`f85570bc1f96ee0cc2abb5a465f78e993f6b600e6fa92a38e3179d03d86823f8`이며
개인정보·구조 사람 검토일은 2026-10-18이다.

추출 v3 이후 승인된 오프라인 후처리는 읽기 전용 표시 요소 3곳의 본문을 `[TEXT]`로
바꿨다. 추출 시 정제한 3곳을 합쳐 텍스트 정제는 6곳이며 실제 값이나 대응표는
이 bundle에 보존하지 않는다. 철회한 v2/v3 HTML도 포함하지 않는다.

네트워크 차단 Chromium 검사는 외부 요청 시도 0건을 확인했다.
`workflow/dom-snapshot.ahnlab.test.ts`는 실제 수집 함수와 메모리상 aria-label 변이로
displayName 누락·복원을 확인한다. 추가질문 DOM 컨트롤 4개는 체크박스 묶음과 텍스트
후보로 보존하고, 고정 API 기권 응답이 NO_MATCH로 남는지를 검사한다.

fixture의 `metadata.json`과 `review.md`에 설치 revision의 UNVERIFIED 상태,
동적 페이지·검색 팝업·서버 반응의 미재현 범위와 백엔드 매칭 미실행을 구분해 기록한다.
범위 밖 추천인 매칭을 이 Issue에서 수정하거나 성공으로 보고하지 않는다.
