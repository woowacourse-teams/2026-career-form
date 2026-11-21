# CF-499 승인 후보 스냅샷

> Issue: [CF-499](https://github.com/woowacourse-teams/2026-career-form/issues/499)
> Collected: 2026-11-21
> Approval-Digest: 43bd06f26f90e1df0244bb18e7c50840f0d5e59564315c15406a45236d5f86c7

worktree 체크포인트에 기록한 후보 세 개의 원문이다. 사람이 2026-11-19 "llm wiki 앞으로 잘 동작하는지 확인하고, 사람 승인 안받아도 되니 너가 알아서 기입해"라고 말해 에이전트가 자동 승인했다.

1. 프로필 상태별 입력 잠금(#499, commit 9855e85·cffc88a): ProfileFieldDefinition에 disabledWhen을 둔다. 장애 여부가 비대상이면 장애 유형·장애 정도·장애등록번호·장애 등록일, 보훈 대상 여부가 비대상이면 보훈구분·보훈 대상자와의 관계·보훈번호를 잠근다. 병역은 군필·복무중이면 면제·비대상 사유만, 미필이면 복무 7칸(병역구분·군별·병과·계급·복무 시작일·복무 종료일·전역구분)과 사유를, 면제·비대상이면 복무 7칸을 잠그고 빈 값이면 모두 연다. 상태 판정은 표준값 ID 또는 그 라벨·별칭과 NFKC·trim·소문자 정규화 뒤 같을 때만 참이다. 잠긴 칸은 화면에서 비활성(회색 배경·흐린 글자, :disabled 스타일)이고 저장 값은 지우지 않으며, 값 연결(value-binding)은 missing으로 보고, 페이지 가져오기는 숨김 칸처럼 거부한다.
2. 병역 잠금 규칙의 근거와 한계(#499): hplace 플랫폼 지원서는 군필·복무중일 때만 복무 상세 칸을, 면제일 때만 면제사유 칸을 연다. 우아한형제들 지원서도 면제일 때만 면제사유 칸을 추가한다(CF-324 실측). 프로필 칸 이름이 면제·비대상 사유라서 비대상에도 사유를 연다. 미필의 사유 잠금은 칸 이름과 hplace 구조에서 나온 추정이므로 미필 사유를 묻는 지원서가 확인되면 다시 본다. 값 연결을 쓰는 정적 경로도 잠긴 칸에 남은 값을 쓰지 않으며, 그 밖의 정적 결과는 같다.
3. 확장 options 화면 실화면 검증 방법(#499): WSL frontend의 Playwright 1.64 chromium으로 launchPersistentContext(channel chromium, headless, --disable-extensions-except/--load-extension=.output/chrome-mv3)를 별도 임시 프로필로 열고, 서비스 워커 URL에서 확장 ID를 얻어 options.html을 연다. 칸은 aria-label이 필드 라벨이라 getByLabel(exact)로 고르고 disabled 같은 DOM 속성으로 판정한다. 사용자 Chrome과 확장 폴더를 건드리지 않는다. 수정 전 빌드에서 잠겨야 할 31칸이 모두 열려 있음을 먼저 확인했다.
