# 범용 검색 실패의 후속 보류 범위와 팝업 정리

> Topic: generic-search-failure-isolation
> Status: Current
> Current: [CF-253 검색 실패 격리](../../raw/issues/CF-253/documents/generic-search-failure-isolation.md)
> History: [CF-253 검색 실패 격리](../../raw/issues/CF-253/documents/generic-search-failure-isolation.md)
> Updated: 2026-10-18

## 현재 상태

결과 없음으로 끝난 검색은 기본적으로 남은 승인 선택 항목 전체를 `SEARCH_FOLLOWUP_HALTED`로 보류한다. 범용 흐름만 선택 인자 `followUpHaltScope="row"`로 같은 `profileEntryId` 항목과 식별 정보가 없는 항목만 보류하고 다른 행·섹션은 계속 쓴다. 정적 어댑터와 기본값은 바뀌지 않으며 성공한 검색의 후속 컨트롤 분기는 현재 동작을 유지한다.

실패 뒤 확장이 연 검색 표면은 순수 닫기 버튼 한 번으로만 닫고, 닫지 못하면 `surfaceLeftOpen`을 결과에 남기며 전체 보류로 되돌린다. 실사이트에서 실제로 탄 분기와 팝업 동작은 확인되지 않았다. 일반 검색 안전 규칙은 [범용 자동 기입 검색 표면](generic-autofill-search.md)을 따른다.

## 변경 이유

한 경력 행의 회사 검색 실패가 무관한 행과 섹션의 승인 항목까지 멈추고 팝업이 남는 관찰을 원인 확인과 함께 최소 범위로 격리하기 위함이다.
