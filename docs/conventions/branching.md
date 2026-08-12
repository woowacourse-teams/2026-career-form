# 브랜치 컨벤션

Release 브랜치가 없는 Git Flow를 사용한다.

```text
feature/* -> develop -> main
hotfix/* ----------------> main -> develop
```

## 브랜치 형식

- 일반 작업: `feature/<Issue 번호>-<영문 slug>`
- 운영 긴급 수정: `hotfix/<Issue 번호>-<영문 slug>`
- 일반 버그 수정은 `develop`에서 `feature/*`로 시작한다.
- `release/*` 브랜치는 만들지 않는다.

## 병합 경로

| 경로 | 방식 | 환경 |
|---|---|---|
| `feature/*` -> `develop` | Squash Merge | 개발 서버에서 검증 후 스테이징 반영 |
| `develop` -> `main` | 일반 Merge 또는 Fast-forward | 스테이징에서 운영으로 승격 |
| `hotfix/*` -> `main` | Squash Merge | 개발 서버 선검증 후 운영 반영 |
| `main` -> `develop` | 일반 Merge | 운영 Hotfix를 다음 개발 버전에 반영 |

원격에는 `main`과 `develop` 장기 브랜치가 있으며 기본 브랜치는 `main`이다. 두 브랜치는 GitHub Ruleset으로 직접 push, force push, 삭제를 막고 PR 승인 1명을 요구한다.
