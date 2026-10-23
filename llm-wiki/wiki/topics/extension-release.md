# 확장 프로그램 릴리스

> Topic: extension-release
> Status: Current
> Current: [CF-327 확장 릴리스 절차 근거](../../raw/issues/CF-327/documents/extension-release.md)
> History: [CF-327 확장 릴리스 절차 근거](../../raw/issues/CF-327/documents/extension-release.md)
> Updated: 2026-10-23

## 현재 상태

확장 프로그램(Chrome Web Store) 릴리스는 CI 밖의 수동 절차다. `frontend-ci.yml`은 테스트와 커버리지만 실행하고 빌드·ZIP·Web Store·`VITE_API_BASE_URL` 단계는 어느 workflow에도 없다. 절차는 (1) Web Store 게시본보다 높은 version으로 `frontend/wxt.config.ts`와 `package.json`을 올리고 (2) `VITE_API_BASE_URL=<환경 origin> npm run zip`으로 빌드하고 (3) ZIP의 version, `host_permissions`, build-info revision을 확인하고 (4) 사람이 업로드·심사·게시하고 (5) 품질 수집의 `extensionVersion` 분포로 보급을 확인한다.

백엔드 origin은 저장소·GitHub·코드 어디에도 저장되지 않고 빌드 명령의 환경변수로만 들어간다. origin만 허용되며 값이 manifest `host_permissions`에 고정되므로 주소가 바뀌면 재빌드·재심사가 필요하고, 이전 게시본과 origin이 다르면 Chrome이 사용자에게 새 권한 승인을 요구할 수 있다. 로컬 `.env*`는 gitignore라 빌드 PC 설정이 그대로 들어가며 미지정 빌드는 `NOT_CONFIGURED`로 동작한다. 확장 버전은 백엔드 릴리스 태그와 독립으로 관리한다. 스테이징 검증용 확장은 스테이징 origin으로 별도 빌드해 로컬 로드한다. 2026-10-23 기준 게시본은 0.4.0이고 소스는 0.1.0으로, 지금까지 업로드 시 로컬에서만 버전을 올려 왔다. 업로드·심사·게시는 사람이 수행한다.

## 변경 이유

확장 릴리스 절차가 `frontend/README.md`의 한 절에만 있고 origin 주입, 버전 상향, 보급 확인은 어디에도 없어 1.4.0 릴리스에서 다시 조사해야 했다. 백엔드 Runbook과 분리된 topic으로 두고 [배포 Runbook](deployment-runbook.md)에서 연결한다.

## 관련 지식

- [배포 Runbook](deployment-runbook.md)
- [확장·백엔드 호환 배포](release-compatibility.md)
- [확장 품질 보고의 fetch 호출 문맥](extension-fetch-context.md)
- Wiki 밖 정본: [프론트엔드 README의 Web Store 제출 전 준비](../../../frontend/README.md)
