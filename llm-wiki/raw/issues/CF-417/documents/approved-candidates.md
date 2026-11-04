# CF-417 승인 후보 스냅샷

> Issue: CF-417
> Approval-Digest: ca329dd0ce59462e14b4d0212c590d4cb6b0cd86a8ee359333ae05b5355566ab
> Approval-Date: 2026-11-05

worktree 체크포인트에 기록해 승인을 요청한 후보 목록을 그대로 옮겼다. 사람은 2026-11-05 "그리고 지금 나머지 진행 가능한건 재개 해주고 일이 끝나면 승인해줘"로 이 Issue의 후보를 사전 승인했고, 후보 확정 뒤 digest를 기록했다. 승인 digest는 체크포인트가 후보 목록을 JSON으로 직렬화해 계산한 값이다.

1. 프론트 테스트 삭제 결정(CF-417): 2026-11-05 사용자 결정("그냥 다 삭제")으로 20초 넘는 테스트 파일 38개(CF-177 C2·C3·C7·C10 등 에이치닷·현대·네이버·SK·안랩 fixture 통합 테스트와 사이드패널 App 테스트 2개 포함)와 그 파일만 import하던 보조 파일 2개를 지웠다. 삭제 전 단독 실행 측정에서 38개 모두 다른 테스트가 덮지 않는 statement가 0이었고, 삭제 뒤 unit·browser 전체 커버리지는 statements 89.08·branches 85.65·functions 92.88·lines 91.55로 80% 기준을 넘는다(삭제 전 90.45/87.35/93.99/92.84). 테스트 파일 597→559, 테스트 7,185→6,528, 로컬 전체 78초이며 CI shard 합계는 약 2,808초에서 약 760초로 준다. 지워진 시나리오(2단계 재실행 무중복 기입, 전공 세부 활성화, 학교 실패 시 수동 행, 범용 대형 페이지 API 호출 수, 현대 병역·보훈 조건부 기입, 구조 반복 종료·안전 한도, 사이드패널 탭 상태 등)는 자동 테스트가 더 지키지 않으며 재발은 실사이트 QA로만 잡힌다. 파일은 Git 이력(13d84d5f 이전)에서 되살릴 수 있고 fixture 자산(frontend/fixtures, frontend/tests/fixtures의 html·json)은 보존했다.
2. 프론트 테스트 간헐 실패 원인(CF-417): CI에서 현대 어댑터·워크플로 테스트가 간헐적으로 내던 "Missing hidden-code execution rules"는 vitest sequence.hooks 기본값 stack(afterEach 역순) 때문이다. src/test/setup.ts의 afterEach(cleanup)보다 테스트 파일의 afterEach(jsdom URL을 localhost로 되돌리기, usePolicyFixture의 installExecutionPolicy(document) 해제)가 먼저 실행되어, 아직 돌고 있는 워크플로가 executionPolicy(document)(entry.url === document.URL 검사)에서 undefined를 받아 hiddenCodeRules()가 던졌다. 느린 러너에서만 드러나는 경쟁이라 frontend/vitest.config.ts에 sequence: { hooks: "list" }를 두어 언마운트가 항상 먼저 일어나게 했다(같은 afterEach 패턴 파일 20개를 한 번에 해결, 3개 파일 8회 반복 통과). 또 shard 실패 뒤 gh run rerun --failed는 shard 재실행이 새 vitest-blob-N 아티팩트를 올려도 커버리지 병합 job이 첫 attempt의 blob을 받아 다시 실패하므로 전체 재실행이나 새 커밋이 필요하다.
