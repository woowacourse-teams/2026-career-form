# 확장 프로그램 설계

> Topic: extension-design
> Status: Current
> Current: [CF-47 자동 기입 모달 경계 ADR](../../raw/issues/CF-47/documents/adr/47-autofill-modal-boundary.md)
> History: [CF-41 확장 프로그램 설계 목록](../../raw/issues/CF-41/documents/indexes/extension-design.md), [CF-47 자동 기입 모달 경계 ADR](../../raw/issues/CF-47/documents/adr/47-autofill-modal-boundary.md)
> Updated: 2026-08-26

## 현재 상태

팝업·사이드 패널의 프로필 탐색과 수동 복사는 유지하고, 자동 기입의 분석·검토·승인·결과는 지원서 페이지 Shadow DOM 모달에서 수행한다.

## 변경 이유

페이지 필드·현재 값·예정 값과 입력 사유를 같은 맥락에서 비교해야 하므로, 자동 기입 표면만 CF-41의 사이드 패널 설계에서 모달로 갱신했다.
