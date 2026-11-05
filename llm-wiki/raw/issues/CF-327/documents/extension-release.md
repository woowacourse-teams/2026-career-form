# 확장 프로그램 수동 릴리스 절차

> Issue: CF-327
> Collected: 2026-10-23
> Approval-Digest: 460019c1c58c3248f460202a9b0e81f8fa783ffef0981abc96f7bccb2ae237f0
> Source-Revision: 82bcb5cd7e384096ee9b6f70e7f71803ed561af6

이 문서는 2026-10-23에 승인된 CF-327 후보 2를 수집한 기록이다. Approval-Digest는 [승인 후보 스냅샷](approved-candidates.md) 전체 UTF-8 바이트의 SHA-256이다. 확장 프로그램(Chrome Web Store) 릴리스는 이전 topic Wiki에 없던 주제라 Supersedes가 없다. 운영·스테이징 origin 값과 계정 정보는 기록하지 않는다.

## 승인 후보

확장 프로그램 릴리스는 CI 밖의 수동 절차다. frontend-ci는 테스트와 커버리지만 실행하고 빌드·ZIP·Web Store·`VITE_API_BASE_URL` 단계는 어느 workflow에도 없다. 절차: (1) Web Store 게시본보다 높은 version으로 `frontend/wxt.config.ts`와 `package.json`을 올린다 (2) `VITE_API_BASE_URL=<환경 origin> npm run zip` — origin만 허용되고 값이 manifest `host_permissions`에 고정되므로 주소가 바뀌면 재빌드·재심사가 필요하다. 로컬 `.env*`는 gitignore라 빌드 PC 설정이 그대로 들어가며 미지정 빌드는 `NOT_CONFIGURED`로 동작한다 (3) ZIP의 version, `host_permissions`, build-info revision을 확인한다 (4) 사람이 업로드·심사·게시한다 (5) 품질 수집의 `extensionVersion` 분포로 보급을 확인한다. 확장 버전은 릴리스 태그와 독립으로 관리한다. 스테이징 검증용 확장은 스테이징 origin으로 별도 빌드한다(CF-183 선례). 2026-10-23 기준 게시본은 0.4.0이고 소스는 0.1.0으로, 지금까지 업로드 시 로컬에서만 버전을 올려 왔다.

## CI에 없는 것

- `.github/workflows/frontend-ci.yml`은 8-shard vitest와 통합 커버리지 검증만 실행한다. `wxt build`, `npm run zip`, Web Store 업로드 단계는 없다.
- `.github` 전체에서 `VITE_API_BASE_URL`을 설정하는 workflow가 없다. 백엔드 origin은 저장소, GitHub Environment, 코드 어디에도 저장되지 않고 빌드 명령의 환경변수로만 들어간다.
- `frontend/package.json`의 `zip` 스크립트는 `assert-release-flags.mjs`(디버그 플래그 금지) → `wxt zip` → `assert-zip.mjs`(MV3, 화면·content script·background 존재, 넓은 host permission 금지, 목업 미포함) 순서로 검사한다. 모두 로컬 실행용이다.

## 빌드 시 origin 주입

`frontend/wxt.config.ts`는 `import.meta.env.VITE_API_BASE_URL`, 없으면 `loadEnv("production")`이 읽은 파일 값을 쓴다. 값은 HTTP(S) origin이어야 하고 path, query, fragment, 자격 증명이 있으면 빌드가 실패한다. 이 값이 manifest `host_permissions`에 `<origin>/*`로 들어가고 `entrypoints/background.ts`와 `src/autofill/policy/background.ts`가 API 호출에 쓴다. 따라서:

- origin이 바뀌면(IP→도메인, HTTP→HTTPS 등) 확장을 다시 빌드해 재심사를 받아야 한다.
- 이전 게시본과 origin이 다르면 Chrome이 사용자에게 새 사이트 권한 승인을 요구하고 승인 전까지 확장을 비활성화할 수 있다.
- 값을 지정하지 않으면 `host_permissions`가 비고 확장은 분석 요청 없이 `NOT_CONFIGURED`를 표시한다.
- `frontend/.gitignore`가 `.env.*`를 무시하므로 빌드 PC의 `.env.local`, `.env.production.local` 값이 그대로 산출물에 들어간다. 운영 ZIP을 만들 때는 셸 환경변수로 운영 origin을 명시해 파일 값을 덮어쓴다.

## 버전

- manifest `version`은 `frontend/wxt.config.ts`에 하드코딩돼 있고 `frontend/package.json`의 version과 같은 값을 유지한다. 2026-10-23 기준 소스는 `0.1.0`이고 Web Store 게시본은 `0.4.0`(같은 날 갱신)이다. 지금까지는 업로드 직전 로컬에서만 번호를 올렸다.
- Web Store는 게시본보다 높은 version만 받는다. 업로드 전 대시보드의 현재 게시 버전을 확인하고 그보다 높게 올린다.
- 확장 버전은 백엔드 릴리스 태그(`v<MAJOR.MINOR.PATCH>`)와 독립으로 관리한다. 같은 백엔드 릴리스에 확장 수정이 없으면 확장 버전은 올리지 않는다.

## 절차

1. 빌드 기준 커밋을 정한다. 운영 확장은 운영에 배포됐거나 배포될 release 브랜치 head(= main 병합 결과)로 빌드한다.
2. `frontend/wxt.config.ts`와 `frontend/package.json`의 version을 게시본보다 높게 올린다.
3. `frontend`에서 `npm ci` 뒤 `VITE_API_BASE_URL=<환경 origin> npm run zip`을 실행한다.
4. `frontend/.output/*-chrome.zip`의 `manifest.json`에서 `version`과 `host_permissions`(`<환경 origin>/*` 하나)를, `build-info.json`에서 revision이 기준 커밋인지 확인한다. 개인정보, 실제 지원서 값, 계정·시크릿이 없는지 확인한다.
5. 사람이 Chrome Web Store 개발자 대시보드에 ZIP을 업로드하고 심사를 요청한 뒤 게시한다. AI는 업로드·게시를 수행하지 않는다.
6. 게시 후 사용자 Chrome이 자동 갱신될 시간을 두고, 품질 수집 결과의 `extensionVersion` 분포가 새 버전으로 바뀌는지 확인한다. 백엔드 `QualityCollectionService`는 `extensionVersion`을 숫자 점 형식으로 검증해 그룹화한다.
7. 스토어에서 설치한 확장으로 운영 대상 자동 기입을 한 번 실행해 연결을 확인한다.

## 스테이징 검증용 확장

스테이징 백엔드는 운영과 다른 origin이므로 스테이징 E2E용 확장은 스테이징 origin으로 따로 빌드해 Chrome에 압축 해제 로드한다. CF-183 릴리스 수정이 같은 방식으로 `VITE_API_BASE_URL`에 스테이징 origin을 넣어 검증했다. 스테이징 확장을 스토어에 올리지 않는다.

## 근거

- `frontend/README.md`: Chrome 로컬 로드, `VITE_API_BASE_URL` 설명, Web Store 제출 전 준비
- `frontend/wxt.config.ts`, `frontend/entrypoints/background.ts`, `frontend/src/autofill/policy/background.ts`
- `frontend/scripts/assert-zip.mjs`, `frontend/scripts/assert-release-flags.mjs`, `frontend/scripts/build-info.ts`
- `.github/workflows/frontend-ci.yml`
- `backend/src/main/java/com/careerform/quality/QualityCollectionService.java`
- CF-183 Issue 본문의 자동 검증 명령(스테이징 origin 빌드)
