# 범용 분할 이메일 보호

> Topic: generic-split-email-safety
> Status: Current
> Current: [CF-138 범용 분할 이메일 오입력 차단](../../raw/issues/CF-138/documents/generic-split-email-safety.md)
> History: [근거 1](../../raw/issues/CF-138/documents/generic-split-email-safety.md)
> Updated: 2026-10-01

## 현재 상태

범용 이메일 아이디 input, `@`, 도메인 select의 제한된 구조를 리뷰와 쓰기 직전에 확인해 전체 주소 쓰기를 차단한다. `SPLIT_EMAIL_UNSUPPORTED`로 직접 입력 사유를 표시하며 기존 값, 단일 이메일과 어댑터 경로를 보존한다. 분할 값을 자동으로 나누어 채우는 기능은 포함하지 않는다.

## 변경 이유

의미 매핑이 이메일이어도 대상 칸이 전체 주소를 받는다는 보장은 없다. 구조적 근거와 쓰기 직전 재검증을 추가하여 잘못된 값 입력을 막는다.
