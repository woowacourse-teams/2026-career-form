# 범용 endpoint 부재의 frontend 오류 전달

> Topic: generic-endpoint-unavailable
> Status: Current
> Current: [CF-244 범용 endpoint 404 전달](../../raw/issues/CF-244/documents/generic-endpoint-unavailable.md)
> History: [CF-244 범용 endpoint 404 전달](../../raw/issues/CF-244/documents/generic-endpoint-unavailable.md)
> Updated: 2026-10-17

## 현재 상태

두 범용 분석 endpoint의 HTTP 404만 background의 선택 status:404와 runtime 오류의 status로 전달한다. 섹션 처리기는 이를 ENDPOINT_UNAVAILABLE로 차단한다. 공유 endpoint의 기존 BAD_REQUEST envelope와 메시지는 유지하고, 공유 분석으로 우회하지 않는다.

## 변경 이유

오래된 backend의 endpoint 부재를 일반 분류·매칭 실패와 구분하면서 정적·공유 분석 경로의 오류 계약을 유지하기 위해서다.
