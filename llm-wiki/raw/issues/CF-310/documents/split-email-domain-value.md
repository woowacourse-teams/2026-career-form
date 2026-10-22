# 분할 이메일 판정: 도메인 select의 값도 근거로 본다

> Issue: CF-310
> Collected: 2026-10-22
> Approval-Digest: c3c933ce146ec66b3958185c45de2324286cfc9db5328bf598208472fae6e941
> Source-Revision: e8e5894173856ba86ca4c3dbdc95ba1aff818dfc

이 문서는 2026-10-22 테스트 경량화에서 승인된 CF-310 후보(네 번째 수집)를 수집한 기록이다. Approval-Digest는 [승인 후보 스냅샷](approved-candidates-4.md) 전체 UTF-8 바이트의 SHA-256이다. 범용 분할 이메일 보호의 판정 근거를 넓힌 변경이며, 바꾸지 않은 내용은 Supersedes가 가리키는 CF-138 근거(`llm-wiki/raw/issues/CF-138/documents/generic-split-email-safety.md`)를 따른다. 실제 지원값·계정·세션·URL 쿼리·대화 전문은 포함하지 않는다.

## 승인 후보

분할 이메일 판정은 도메인 select의 선택지 문구나 값이 도메인이면 분할 이메일로 본다.

## 근거

- `frontend/src/autofill/dom/split-email.ts`의 `isSplitEmailTarget`은 아이디 input, 사이 텍스트 `@`, select 하나의 구조를 확인한 뒤 select에 도메인 형태의 선택지가 있어야 분할 이메일로 본다. CF-138 구현은 선택지 **문구**만 도메인 정규식과 비교했다.
- LG AI Research 정제 fixture(`fixtures/dom-snapshots/lg-ai-research-birth-split-email`)는 선택지 문구를 `[TEXT]`로 지우고 값(`gmail.com` 등)만 남긴다. 그래서 판정이 실패해 리뷰 계획이 아이디 칸을 쓸 수 있는 칸으로 보고 실행이 전체 주소를 썼다. develop의 기입 정확도 측정(`write-accuracy.test.ts`)은 이 칸을 `wrong`으로 집계해 로컬에서 항상 실패했다.
- 실제 페이지에서도 선택지 문구가 "지메일"처럼 도메인이 아닌 경우가 있으므로, 2026-10-22부터 문구 또는 값 중 하나가 도메인 형태이면 분할 이메일로 본다. 값이 `1`, `2` 같은 코드이고 문구도 도메인이 아니면 여전히 분할 이메일이 아니다.
- 테스트: `split-email.test.ts`(문구 도메인, 값만 도메인, 구분자·도메인 없음), LG fixture 구조 테스트는 아이디 칸이 `SPLIT_EMAIL_REASON`으로 입력 불가가 되는 것을 확인한다. 기입 정확도 측정의 LG 사례는 정답 6·보류 1로 통과한다.

## 쓰임

- 분할 이메일 보호는 선택지 문구와 값을 모두 근거로 삼는다. 리뷰 계획과 쓰기 직전 재검증은 바뀌지 않았다.
- 정제 fixture는 표시 문구를 지우므로, 문구에만 의존하는 판정은 fixture에서 먼저 드러난다.
