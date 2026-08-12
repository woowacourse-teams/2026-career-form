# 브랜치 컨벤션

Release 브랜치가 없는 Git Flow를 사용한다.

```text
CF-* -> develop -> main
```

## 브랜치 형식

- 모든 Issue 작업: `CF-<Issue 번호>`
- 일반 작업과 일반 버그 수정은 `develop`에서 시작한다.
- `release/*` 브랜치는 만들지 않는다.

## 병합 경로

| 경로 | 방식 | 환경 |
|---|---|---|
| `CF-*` -> `develop` | Squash Merge | 개발 서버에서 검증 후 스테이징 반영 |
| `develop` -> `main` | Merge Commit | 스테이징에서 운영으로 승격하고 프로덕션 배포 |

원격에는 `main`과 `develop` 장기 브랜치가 있으며 기본 브랜치는 `develop`이다. 두 브랜치는 GitHub Ruleset으로 직접 push, force push, 삭제를 막고 PR 승인 1명을 요구한다. `CF-*`에서 `main`으로 직접 보내는 PR과 `main`에서 `develop`으로 보내는 PR은 허용하지 않는다.
