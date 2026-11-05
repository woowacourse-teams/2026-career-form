# 범용 분할 이메일 보호

> Topic: generic-split-email-safety
> Status: Current
> Current: [CF-310 도메인 값 판정 근거](../../raw/issues/CF-310/documents/split-email-domain-value.md)
> History: [근거 1](../../raw/issues/CF-138/documents/generic-split-email-safety.md); [CF-310 도메인 값 판정 근거](../../raw/issues/CF-310/documents/split-email-domain-value.md)
> Updated: 2026-10-22

## 현재 상태

범용 이메일 아이디 input, `@`, 도메인 select의 제한된 구조를 리뷰와 쓰기 직전에 확인해 전체 주소 쓰기를 차단한다. `SPLIT_EMAIL_UNSUPPORTED`로 직접 입력 사유를 표시하며 기존 값, 단일 이메일과 어댑터 경로를 보존한다. 분할 값을 자동으로 나누어 채우는 기능은 포함하지 않는다.

## 변경 이유

의미 매핑이 이메일이어도 대상 칸이 전체 주소를 받는다는 보장은 없다. 구조적 근거와 쓰기 직전 재검증을 추가하여 잘못된 값 입력을 막는다.

## 도메인 select의 값도 근거로 (2026-10-22)

CF-138 판정은 도메인 select의 선택지 문구만 도메인 정규식과 비교해, 문구가 `[TEXT]`로 지워진 정제 fixture나 "지메일"처럼 문구가 도메인이 아닌 페이지에서 아이디 칸에 전체 주소를 썼다. 2026-10-22부터 선택지 문구 또는 값 중 하나가 도메인 형태이면 분할 이메일로 본다. 구조 확인(아이디 input, 사이 텍스트 `@`, select 하나)과 쓰기 직전 재검증은 그대로다. 근거는 [CF-310 도메인 값 판정 근거](../../raw/issues/CF-310/documents/split-email-domain-value.md)를 따른다.
