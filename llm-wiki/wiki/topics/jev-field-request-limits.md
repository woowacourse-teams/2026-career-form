# Jev fields 요청 한도와 응답 검증

> Topic: jev-field-request-limits
> Status: Current
> Current: [CF-206 Jev fields 요청 한도와 응답 검증](../../raw/issues/CF-206/documents/jev-field-request-limits.md)
> History: [근거 1](../../raw/issues/CF-206/documents/jev-field-request-limits.md)
> Updated: 2026-10-13

## 현재 상태

Jev fields 요청은 질문마다 프로필 키 선택지 전체를 넣어 질문 12개 안팎에서 `max_tokens_exceeded`가 난다. 반올림된 확률 합 0.99를 현재 응답 검증이 거부한다. 두 문제 모두 해결 전이며 큰 지원서의 Jev fields 분석은 실패한다.

## 변경 이유

실사이트 요청 재전송에서 네 사이트 중 세 곳의 fields 분석이 Jev에서 실패한 원인을 확인했다.
