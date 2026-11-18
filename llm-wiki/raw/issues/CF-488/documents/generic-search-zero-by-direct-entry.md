# 범용 검색 0건의 직접입력 신호 인식과 행 저장 연쇄

> Issue: [CF-488](https://github.com/woowacourse-teams/2026-career-form/issues/488)
> Collected: 2026-11-19
> Approval-Digest: b84a92a81f7c8d86c9e4a216a3c2242b701e35850f4759e9d84193e52a0bab0c
> Source-Revision: c32b32b

[승인 후보 스냅샷](approved-candidates.md)의 후보 1~6을 적는다. 카탈로그 학교명 단일 일치 선택은 Supersedes가 가리키는 CF-477 근거를 그대로 따르고, 이 문서는 0건 판정과 직접입력 경로만 다룬다.

## 문제와 수정 (후보 1, commit 12ca195)

- role 없는 검색 레이어 중에는 결과 목록이 비어 있고 변하지 않으며 "결과가 없습니다" 안내도 없이, 항상 보이는 "결과가 없나요?" 류 제안과 "직접입력" 버튼 하나만 두는 지원서가 있다(범용 경로 지원서 1곳에서 확인). 결과 읽기가 안내 문구를 기다리다 마감에 걸려 `SEARCH_TIMEOUT`으로 끝났다.
- 범용 팝업 복구는 다음 셋이 모두 성립하면 0건으로 본다. 검색어가 반영됐고(입력이 반영된 텍스트로 교체됨, `observeQueryReflection`), 목록이 비어 있고 `LOCAL_ZERO_RESULT_SETTLE_MS`(2초) 동안 추가 항목이 없으며, 보이고 활성인 직접입력 컨트롤(`directEntryControls`)이 정확히 하나다.
- 안내 문구 기반 0건 판정은 바뀌지 않았다.

## 직접입력 확인 버튼 (후보 2)

- 확인 버튼이 처음부터 있고 입력값이 받아들여질 때까지 비활성일 수 있다. 보이는 `확인|적용|등록|confirm|apply|register` 버튼을 정확히 하나만 인정하고 활성화를 기다린다. 0개 또는 여러 개면 `unverified_search_form`이다.

## 카탈로그 조건 (후보 3)

- 직접입력은 카탈로그 승인 값만 허용해 프로필에 수동으로 적은 값은 도달하지 못했다. 이제 0건이 직접입력 신호로 확립된 경우에도 허용한다(`catalogMatch` 또는 `zeroByDirectEntry`).
- 안내 문구 기반 0건에서 수동 값은 직접입력을 쓰지 않는다. `write/search-popup-recollect.test.ts`의 기존 테스트가 이를 고정한다.

## 마지막 시도 (후보 4, commit c32b32b)

- 수동 값은 검색 시도가 2회 생길 수 있다. 페이지가 검색어 입력을 교체해 재시도 분기가 돌 수 없으면(`!(nativeFormBinding || query?.isConnected)`) 그 시도를 마지막으로 보아 직접입력이 실행되게 한다.

## 행 저장 연쇄 관찰 (후보 5)

- 행마다 [저장] 버튼으로 등록하는 단일 행 입력 폼에서 확장은 저장된 행 수로 다음 프로필 항목을 고른다. 필수 칸이 빈 저장 안 된 행이 하나 있으면 그 섹션의 뒤 항목이 모두 막힌다.
- 수정 뒤 실측(합성 프로필, 범용 경로 지원서 1곳): 첫 자격증이 직접입력으로 쓰이고 행이 저장됐으며(`row-save saved 1`) 둘째 자격증이 같은 행에서 채워졌다. 둘째는 결과가 이름+등급 변형뿐이라 `SEARCH_NO_EXACT_MATCH`로 실패했고 후속 Issue #490으로 넘겼다.
- 저장·제출·동의는 하지 않았다.

## 진단 방법 (후보 6)

- localhost 진단 빌드(`VITE_API_BASE_URL=http://localhost:8080 VITE_LOCAL_WORKFLOW_DIAGNOSTICS=1 npm run build`)로 페이지에서 `careerFormLocalLog` window 메시지를 수집했다.
- 원인 분기를 가리려 분기별 임시 게이트 로그(`TMP-direct-gate`)를 넣었고 커밋 전에 되돌렸다. 값과 주소는 기록하지 않았다.
