# CF-488 승인 후보 스냅샷

> Issue: [CF-488](https://github.com/woowacourse-teams/2026-career-form/issues/488)
> Collected: 2026-11-19
> Approval-Digest: b84a92a81f7c8d86c9e4a216a3c2242b701e35850f4759e9d84193e52a0bab0c

worktree 체크포인트에 기록한 후보 여섯 개의 원문이다. 사람이 2026-11-19 "llm wiki는 자동승인으로 해"라고 말해 자동 승인으로 확정했다.

1. 범용 검색 0건의 직접입력 신호 인식(CF-488, 2026-11-19): role 없는 검색 레이어 중 결과 목록이 비어 있고 변하지 않으며 '결과가 없습니다' 안내도 없이 항상 보이는 '결과가 없나요?' 류 제안과 '직접입력' 버튼 하나만 있는 지원서(범용 경로 지원서 1곳)에서 결과 읽기가 마감까지 기다려 SEARCH_TIMEOUT으로 끝났다. 수정(commit 12ca195): 범용 팝업 복구에서 (1) 검색어가 반영됐고(입력이 반영된 텍스트로 교체됨, observeQueryReflection), (2) 목록이 비어 있고 LOCAL_ZERO_RESULT_SETTLE_MS(2초) 동안 추가 항목이 없으며, (3) 보이고 활성인 직접입력 컨트롤(directEntryControls)이 정확히 하나일 때 0건으로 본다. 안내 문구 기반 0건 판정은 그대로다.
2. 직접입력 확인 버튼 범위(CF-488, 2026-11-19): 확인 버튼이 처음부터 있고 입력값이 받아들여질 때까지 비활성일 수 있다. 보이는 `확인|적용|등록|confirm|apply|register` 버튼을 정확히 하나만 인정하고 활성화될 때까지 기다린다. 0개 또는 여러 개면 unverified_search_form으로 끝난다.
3. 직접입력의 카탈로그 조건(CF-488, 2026-11-19): 직접입력은 이전에 카탈로그 승인 값만 허용해 프로필에 수동으로 적은 값은 도달하지 못했다. 이제 0건이 직접입력 신호로 확립된 경우 허용한다(catalogMatch 또는 zeroByDirectEntry). 안내 문구 기반 0건에서 수동 값은 여전히 직접입력을 쓰지 않으며 write/search-popup-recollect.test.ts의 기존 테스트가 이를 고정한다.
4. 마지막 시도 판정(CF-488, 2026-11-19, commit c32b32b): 수동 값은 검색 시도가 2회 생길 수 있다. 페이지가 검색어 입력을 교체해 재시도 분기가 돌 수 없으면(!(nativeFormBinding || query?.isConnected)) 그 시도를 마지막으로 보아 직접입력이 실행되게 한다.
5. 행 저장 연쇄 관찰(CF-488, 2026-11-19): 행마다 [저장] 버튼으로 등록하는 단일 행 입력 폼에서 확장은 저장된 행 수로 다음 프로필 항목을 고른다. 필수 칸이 빈 저장 안 된 행이 하나 있으면 그 섹션의 뒤 항목이 모두 막힌다. 수정 뒤 실측(합성 프로필, 범용 경로 지원서 1곳): 첫 자격증이 직접입력으로 쓰이고 행이 저장됐으며(row-save saved 1) 둘째 자격증이 같은 행에서 채워졌으나 결과가 이름+등급 변형뿐이라 SEARCH_NO_EXACT_MATCH로 실패했다. 후속 Issue #490.
6. 진단 방법(CF-488, 2026-11-19): localhost 진단 빌드(`VITE_API_BASE_URL=http://localhost:8080 VITE_LOCAL_WORKFLOW_DIAGNOSTICS=1 npm run build`)로 페이지에서 careerFormLocalLog window 메시지를 수집하고, 분기별 임시 게이트 로그(TMP-direct-gate)를 넣어 원인 분기를 가렸으며 커밋 전에 되돌렸다. 값과 주소는 기록하지 않았다.
