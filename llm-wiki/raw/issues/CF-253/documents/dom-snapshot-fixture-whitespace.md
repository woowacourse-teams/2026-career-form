# 검토된 DOM 스냅샷 fixture의 공백 정규화

## 승인한 지식 후보

사람이 검토한 DOM 스냅샷 fixture가 pre-commit의 `git diff --cached --check`(후행 공백, 탭 앞 공백)를 통과하지 못하면 공백만 정규화한다. 사용자 승인, 이전·이후 sha256, `diff -w` 빈 결과, 공백 제거 문자열 동일, 구조 개수 동일을 `review.md`와 `metadata.json`에 기록하고 개인정보·구조 검토 결과는 유지한다.

## 적용과 검증

`frontend/fixtures/dom-snapshots/naver-step2-form/`에서 줄 끝 공백·탭 제거와 들여쓰기의 탭 앞 공백 제거만 적용했다. 컨트롤 유형, option, label, label-for, id 개수가 같음을 확인했고 증거는 worktree 로컬 로그에만 둔다.
