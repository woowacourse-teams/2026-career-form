# 검토된 DOM 스냅샷 fixture의 공백 정규화

> Topic: dom-snapshot-fixture-whitespace
> Status: Current
> Current: [CF-253 fixture 공백 정규화](../../raw/issues/CF-253/documents/dom-snapshot-fixture-whitespace.md)
> History: [CF-253 fixture 공백 정규화](../../raw/issues/CF-253/documents/dom-snapshot-fixture-whitespace.md)
> Updated: 2026-10-18

## 현재 상태

사람이 검토한 DOM 스냅샷이 pre-commit 공백 검사를 통과하지 못하면 공백만 정규화하고, 사용자 승인과 이전·이후 sha256, `diff -w` 빈 결과, 구조 개수 동일을 `review.md`와 `metadata.json`에 기록한다. 개인정보와 구조 검토 결과는 유지한다.

## 변경 이유

검토된 파일의 digest를 임의로 바꾸지 않으면서 하네스의 공백 검사를 우회하지 않기 위함이다.
