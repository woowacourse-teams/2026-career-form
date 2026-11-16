# 프론트 단위 파일 실행 명령과 확장 옵션 페이지 수동 확인

> Issue: [CF-458](https://github.com/woowacourse-teams/2026-career-form/issues/458)
> Collected: 2026-11-16
> Approval-Digest: ea16894743540db9ef77644ebd4820e6b4fc14638c151f241aa10967d90036ff
> Source-Revision: aaffd610

[승인 후보 스냅샷](approved-candidates.md)의 후보 4를 적는다. jsdom·Chromium 프로젝트 분리, shard 병합 검증, CI 경로 필터, 느린 fixture 테스트 삭제는 Supersedes가 가리키는 CF-417 근거와 그 앞의 이력을 따른다. 이 문서의 수동 확인은 설치 확장 E2E 자동화가 아니다.

## 단위 테스트 파일 실행 (후보 4)

- 단위 테스트 파일만 돌릴 때는 `npm run test:unit -- <파일>`을 쓴다.
- `npx vitest run <단위 파일>`은 브라우저 테스트가 하나도 수집되지 않으면 `frontend/tests/vitest/run-policy.ts`가 `Browser tests were not collected`로 실패시킨다.

## 확장 옵션 페이지 수동 확인 (후보 4)

- production 빌드(`npm run build`의 `.output/chrome-mv3`)를 Playwright가 설치한 Chrome for Testing에 임시 프로필로 `--load-extension` 해서 `channel: "chromium"`으로 띄운다.
- 채널을 지정하지 않은 기본 headless shell에서는 확장 서비스 워커가 뜨지 않는다.
- 외부 요청은 `--host-resolver-rules`로 localhost만 남겨 막는다.
- 저장은 500ms 디바운스다. 저장됨 표시(`[data-status="saved"]`)를 본 뒤 `chrome.storage.local`의 `careerForm.profile`을 읽는다.
- 확인한 빌드는 `.output/chrome-mv3/build-info.json`의 revision과 source_state로 남긴다.
- CF-458에서는 이 방식으로 옵션 페이지 프로필 관리의 자격증 재선택 다섯 흐름을 확인했다. Chrome for Testing 156과 production 빌드를 썼고, 임시 프로필은 흐름마다 지웠다.
