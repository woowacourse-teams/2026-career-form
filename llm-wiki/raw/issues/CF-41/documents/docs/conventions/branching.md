# 브랜치 컨벤션

`develop` 개발과 스테이징 검증을 분리하는 release 브랜치 기반 Git Flow를 사용한다.

```text
CF-* -> develop
          |
          | Start release
          v
release/<MAJOR.MINOR.PATCH> -> main
          |
          +-----------------> develop

hotfix/CF-* -> main -> develop
                    \-> active release/*

revert/<main-merge-sha> -> main
```

## 브랜치 형식

- 일반·릴리스 수정 작업: `CF-<Issue 번호>`
- 운영 긴급 수정: `hotfix/CF-<Issue 번호>`
- 릴리스 검증: `release/<MAJOR.MINOR.PATCH>`
- 운영 배포 실패 되돌림: `revert/<main-merge-sha>`

일반 작업은 `develop`, hotfix 작업은 `main`에서 시작한다. Start release는 현재 `develop` HEAD에서
`release/<MAJOR.MINOR.PATCH>`를 만들며, 동시에 활성 release 브랜치는 하나만
유지한다. release 수정 작업은 대상 release에서 `CF-<Issue 번호>`로 분기한다.

## 병합 경로

| 경로 | 방식 | 환경 |
|---|---|---|
| `CF-*` → `develop` | Squash Merge | 일반 작업 통합 |
| `CF-*` → `release/*` | Squash Merge | 스테이징 중 릴리스 수정 |
| `release/*` → `main` | Merge Commit | 검증된 릴리스의 운영 반영 |
| `release/*` → `develop` | Merge Commit | 릴리스 수정의 개발선 동기화 |
| `hotfix/CF-*` → `main` | Squash Merge | 운영 긴급 수정 |
| `main` → `develop` | Merge Commit | 운영 수정 동기화 |
| `main` → `release/*` | Merge Commit | 활성 릴리스 동기화 |
| `revert/*` → `main` | Merge Commit | 운영 배포 실패 되돌림 |

`develop` → `main`과 일반 `CF-*` → `main`은 허용하지 않는다. `CF-*`와
`hotfix/CF-*` 작업 PR은 연결 Issue 하나를 종료하고 Issue와 같은 제목을
사용한다. release·동기화·revert 시스템 PR은 `[Release] 작업명` 제목을 사용하고
Issue를 종료하지 않는다.

## hotfix와 되돌림

`hotfix/CF-*`는 `main`에서 분기해 `main`으로만 병합한다. 운영 반영 후
`main` → `develop`과, 활성 release가 있으면 `main` → `release/*` 동기화 PR을
각각 만든다. 브랜치 경로가 hotfix 작업을 구분하므로 `hotfix` 라벨을 병합 허용
조건으로 사용하지 않는다.

운영 배포 자체가 실패하면 배포된 main 병합 커밋을 기준으로
`revert/<main-merge-sha>`를 만들고 `[Release]` Draft PR을 `main`으로 보낸다.
서버는 직전 image digest로 자동 rollback하고 CI는 되돌림 커밋과 Draft PR을
생성한다. 사람은 실패 원인과 되돌림 범위를 확인한 뒤 승인·병합하며, revert PR
병합은 이미 rollback된 서버를 다시 배포하지 않고 main 소스 상태만 정렬한다.

원격의 장기 브랜치는 `main`과 `develop`이며 기본 브랜치는 `develop`이다.
`main`, `develop`, `release/*`는 GitHub Ruleset으로 직접 push, force push, 삭제를
막고 승인 리뷰 1개를 요구한다. 하네스는 브랜치 경로 계약을 검사하지만 실제 병합
방식 선택, 활성 release 하나 유지, 브랜치 생성·삭제는 사람이 확인한다.
