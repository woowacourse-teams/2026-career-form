# 범용 검색 실패의 후속 보류 범위와 팝업 정리

## 승인한 지식 후보

1. 원인: 검색이 결과 없음으로 끝나 상호작용 효과가 남은 경우 `write/search-executor.ts`의 603-626행 분기가 정적 어댑터와 범용 흐름 모두에서 같은 기본 경로로 남은 승인 선택 항목 전체를 행·섹션 구분 없이 `SEARCH_FOLLOWUP_HALTED`로 보류한다. 실사이트에서 실제 발화한 분기와 팝업 DOM·서버 동작은 확인되지 않았다. 재현은 NAVER step2 구조 fixture와 검색 경계 mock(결과 없음)으로만 확인했다.
2. 범위 제한: `followUpHaltScope="row"`는 범용 분석 흐름(analysis.mode GENERIC)에서만 켠다. 실패한 항목과 같은 `profileEntryId`의 승인 항목만 보류하고, `profileEntryId`가 없는 항목은 계속 보류한다. 기본값 `"all"`과 정적 어댑터 결과는 바뀌지 않는다. 성공한 검색의 후속 컨트롤 분기(589-601행)는 행 안 여부를 증명하지 못해 현재 동작을 유지했다.
3. 팝업 정리: 검색 실행기가 실패하면 확장이 연 검색 표면 컨테이너 안에서 라벨이 순수 닫기(닫기, close, x)인 버튼만 `isSafeSurfaceCloseClick`으로 한 번 클릭한다. 제출, 링크 이동, 폼 override와 그 밖의 금지 라벨은 차단한다. 닫지 못하면 실패 결과에 `surfaceLeftOpen`을 남기고 범용 보류 범위를 전체 목록으로 되돌린다. 이 필드를 사용자 화면 문구로 표시하는 일은 포함하지 않았다.

## 적용과 검증

닫지 못한 결과에는 비식별 원인 코드 `surfaceLeftOpenReason`(`no_safe_close_control`, `close_not_confirmed`)을 함께 남긴다. `executeApprovedSearchWrites`와 `executeApprovedWritesAfterPageSettles`의 선택 인자로 전달하며 연결 지점은 범용 쓰기 경로(`workflow-analysis.ts`, `AutofillWorkflow.tsx`)다. 재현과 회귀는 `dom-snapshot.naver-search.integration.test.ts`, 팝업 정리는 `mixed-education-layer-search.integration.test.ts`의 합성 레이어로 확인한다. 검증은 합성 DOM과 검색 경계 mock에 한정하며 실제 지원서의 입력, 제출, 계정 또는 세션 정보는 기록하지 않는다.
