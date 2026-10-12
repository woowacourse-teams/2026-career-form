# 확장 품질 보고의 fetch 호출 문맥

> Topic: extension-fetch-context
> Status: Current
> Current: [CF-183 fetch 호출 문맥](../../raw/issues/CF-183/documents/extension-fetch-context.md)
> History: [CF-183 fetch 호출 문맥](../../raw/issues/CF-183/documents/extension-fetch-context.md)
> Updated: 2026-10-12

## 현재 상태

브라우저 fetch를 클래스 속성으로 보관한 품질 보고 경계에서는 `fetcher.call(globalThis, ...)`로 전역 수신자를 명시한다. 회귀 테스트는 전역 문맥을 요구하는 fetch 경계와 POST 요청 계약, 204 응답을 확인한다. 실제 확장 재로드 후 스테이징 검증은 사람 담당으로 남는다.

## 변경 이유

분석은 성공해도 보고용 fetch 호출 문맥이 클래스 인스턴스이면 브라우저 수신자 검증에서 실패할 수 있다. 수정 전 회귀 테스트 실패, 수정 후 통과와 스테이징 Console 보정 후 204 확인을 근거로 한다.
