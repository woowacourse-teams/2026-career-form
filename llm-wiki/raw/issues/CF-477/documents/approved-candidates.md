# CF-477 승인 후보 스냅샷

> Issue: [CF-477](https://github.com/woowacourse-teams/2026-career-form/issues/477)
> Collected: 2026-11-18
> Approval-Digest: 4382b5a1036e0cfaab6a7bb0a8f7b1cddb4318779acf61795da2638bc5e4a05f

worktree 체크포인트에 기록한 후보 두 개의 원문이다. 사람이 2026-11-18 "승인"으로 확정했다.

1. 범용 검색 선택의 학교 카탈로그 판정(CF-477, 사람 결정 2026-11-18): 범용 경로에서 결과 목록의 어느 항목에도 세부 정보(선택지 설명)가 없으면 카탈로그 학교명(고등학교·대학교·대학원)은 승인된 이름이 같은 결과가 정확히 1건일 때 이름만으로 선택한다. 이름 같은 결과가 2건 이상이면 선택하지 않는다. 세부 정보가 하나라도 보이는 목록은 기존처럼 이름과 세부 정보가 모두 같아야 한다. 정적 어댑터, committed-search, hidden-code 경로의 '학교의 지역 근거가 없으면 catalog requiredDetail은 수동' 기준은 바꾸지 않는다. 이유: 결과에 이름만 보여 주는 지원서에서는 세부 정보를 비교할 방법이 없어 카탈로그로 고른 학교가 항상 실패했다.
2. 이름만으로 고른 선택의 유지 확인(CF-477): 검색 선택 뒤 기입 계층의 카탈로그 재확인(rememberCatalogSelection)도 세부 정보를 다시 요구하므로, 이름만으로 승인된 선택은 catalogSelection.labelOnly 표시를 전달해 '세부 정보 없음 + 이름 일치'로 재확인한다. 이 표시가 없으면 선택이 RETAINED_VALUE_UNCONFIRMED로 되돌아간다.
