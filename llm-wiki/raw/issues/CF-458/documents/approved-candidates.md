# CF-458 승인 후보 스냅샷

> Issue: [CF-458](https://github.com/woowacourse-teams/2026-career-form/issues/458)
> Collected: 2026-11-16
> Approval-Digest: ea16894743540db9ef77644ebd4820e6b4fc14638c151f241aa10967d90036ff

worktree 체크포인트에 기록한 후보 다섯 개의 원문이다. 사람이 2026-11-16 "승인"으로 확정했다.

1. 자격증 발급기관 채움 규칙(profile-catalog-identity, CF-368 결정 일부 변경): 자격증명을 카탈로그에서 고르면 발급기관이 비었거나 공백뿐일 때, 또는 같은 항목에서 이전 자격증 선택이 채운 글자와 정확히 같을 때 새 자격증 detail의 첫 ` · ` 조각으로 채운다. 그 밖의 발급기관은 바꾸지 않는다. 첫 선택 전에 입력한 값은 카탈로그 값과 같아도 남고, 사용자 값을 남긴 선택 뒤에는 이전 채움을 잊는다. 이름 입력·지우기·직접 입력과 다른 칸 편집은 채운 값과 그 기억을 그대로 두므로 다음 목록 선택이 바꾼다. 고쳤다가 채운 글자로 되돌린 값도 채운 값으로 본다. 타이핑, 직접 입력, 가져오기는 발급기관을 채우지 않는다.
2. 채움 기억은 세션 한정(profile-catalog-identity): 채움 여부는 저장하지 않는다(새 저장 필드 없음). 편집기가 메모리에 들고 있는 프로필에서만 알아보므로, 프로필을 다시 불러오거나(새로고침, 옵션 페이지의 지원 공고 탭에 다녀오기, 저장 충돌 뒤 다시 불러오기) 가져온 뒤에는 채운 값도 입력한 값으로 보고 남긴다. 저장된 선택의 카탈로그 발급기관과 같으면 채운 값으로 보는 추론은 쓰지 않았다. 자격증 734건 중 613건이 한국산업인력공단이라 같은 글자를 직접 입력한 값을 덮어쓰기 때문이다. 다시 불러온 뒤에도 바꾸려면 채움 여부를 저장하는 형식 변경이 따로 필요하다.
3. StrictMode와 갱신 함수 순수성(profile-catalog-identity): 옵션 페이지는 React.StrictMode로 렌더되어 개발 빌드에서 useState 갱신 함수가 두 번 실행된다. useProfileEditor의 changeProfile은 갱신 함수 안에서 저장을 예약하므로 화면에 반영된 결과와 저장된 결과가 서로 다른 호출에서 나올 수 있다. 그래서 갱신 함수 안에서 항목 id를 키로 하는 Map이나 ref를 읽고 고치면 화면과 저장값이 갈린다(키보드 선택은 화면 B·저장 A, 포인터 클릭은 화면과 저장 모두 A로 실측). 발급기관 채움 기억은 상태 항목 객체를 키로 하는 모듈 수준 WeakMap에 두고 갱신 함수가 새로 만든 객체에만 한 번 쓴다. 바뀌지 않은 항목은 같은 객체로 돌려줘야 기억이 유지된다. production 빌드(wxt build)는 두 번 실행하지 않아 수동 확인으로는 드러나지 않으므로, 테스트를 StrictMode로 렌더하고 마지막 repository.save 인자까지 확인한다.
4. 프론트 단위 파일 실행과 확장 수동 확인(frontend-browser-testing): 단위 테스트 파일만 돌릴 때는 `npm run test:unit -- <파일>`을 쓴다. `npx vitest run <단위 파일>`은 브라우저 테스트가 하나도 수집되지 않으면 frontend/tests/vitest/run-policy.ts가 Browser tests were not collected로 실패시킨다. 확장 옵션 페이지 수동 확인은 production 빌드(npm run build의 .output/chrome-mv3)를 Playwright가 설치한 Chrome for Testing에 임시 프로필로 --load-extension 해서 channel chromium으로 띄운다. 채널을 지정하지 않은 기본 headless shell에서는 확장 서비스 워커가 뜨지 않는다. 외부 요청은 --host-resolver-rules로 localhost만 남겨 막는다. 저장은 500ms 디바운스이므로 저장됨 표시([data-status="saved"])를 본 뒤 chrome.storage.local의 careerForm.profile을 읽고, 확인한 빌드는 .output/chrome-mv3/build-info.json의 revision과 source_state로 남긴다.
5. verify.py와 Docker(verification-environment): verify.py의 infra 테스트 중 MongoDB 모니터링·백업 알림 규칙 테스트는 docker run으로 promtool을 실행하고 건너뛰기 조건이 없다(infra/tests/test_mongodb_monitoring_alerts.py:27 등). 2026-11-16 develop 기준 복제본에서 Docker가 꺼져 있을 때 18개가 docker API 연결 실패로 떨어지는 것을 관찰했다. Docker를 켠 뒤 실행하고, 켤 수 없으면 통과로 쓰지 않고 환경 실패로 그대로 기록한다.
