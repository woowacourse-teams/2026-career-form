# 브랜치와 환경

| 기준 | 개발 서버 | 스테이징 서버 | 운영 서버 |
|---|---|---|---|
| 소스 | `CF-*`, `develop` | `release/<MAJOR.MINOR.PATCH>` | `hotfix/CF-*`, `main` |
| 목적 | 작업·통합 검증 | 고정된 릴리스 후보 검증 | 사용자 서비스 |
| AI 배포 | 금지 | 금지 | 금지 |

Start release는 현재 `develop` HEAD에서 활성 release 브랜치 하나를 만든다. 이후
`develop` 개발은 계속 진행하고 스테이징은 release 브랜치만 검증한다. 검증 중 수정은
`CF-*` → `release/*`로 반영하고, 승인된 release를 `main`과 `develop`에 Merge
Commit으로 병합한다.

운영 hotfix는 `main`에서 분기한 `hotfix/CF-*` → `main`으로 반영한 뒤 `main` → `develop`과
활성 `release/*`에 동기화한다. 운영 배포 실패는 `revert/<main-merge-sha>` Draft
PR로 되돌린다.

하네스는 브랜치 경로와 PR 종류만 정적으로 검사한다. 활성 release 하나
유지, 서버 배포 workflow, 환경 변수, 배포 승인과 실제 되돌림은 별도 담당자가
구성하고 실행한다.
