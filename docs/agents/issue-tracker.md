# GitHub Issue Tracker

GitHub Project draft, repository Issue, `CF-<Issue 번호>` 브랜치, Draft PR을 하나의 작업 식별자로 연결한다. Issue 본문은 범위와 완료 기준의 정본이다.

## 작업 단위

- 하나의 Issue는 하나의 브랜치와 하나의 PR로 종료한다.
- Sub-issue와 Parent 관계를 작업 분해에 사용하지 않는다.
- 한 Issue 안의 구현 순서는 계획 문서와 논리적 커밋으로 관리한다.
- FE, BE, INFRA처럼 독립 구현과 리뷰가 필요한 큰 범위는 별도 Project draft로 둔다.

## 상태 대응

| Issue label | Project Status | 의미 |
|---|---|---|
| `status:planning` | `In Progress` | 승격 후 계약 작성 중 |
| `status:ready` | `In Progress` | 사람이 계약을 승인하고 구현 대기 |
| `status:in-progress` | `In Progress` | 구현과 자동 검증 진행 중 |
| `status:blocked` | `In Progress` | 작업 식별자를 유지한 채 사람 판단 대기 |
| `status:review` | `On Review` | Draft PR 검토 중 |

Project draft를 Issue로 승격한 직후 Project Status는 `In Progress`로 바꾼다. Issue 계약과 계획을 사람이 승인하기 전까지 Issue label은 `status:planning`으로 유지하고, 승인하면 `status:ready`로 바꾼다. 두 라벨을 Project Status `Todo`로 동기화하지 않는다. 실제 구현을 시작하면 `status:in-progress`로 전환한다.

## 연결 계약

Issue와 PR 제목은 같은 `[영역] 작업명`을 사용하며 `FE`, `BE`, `Infra`,
`Harness`, `Plan` 영역을 허용한다. `FE`, `BE`만 전체를 대문자로 쓰고 나머지는 첫
문자만 대문자로 쓴다. `Plan`은 조사, 요구사항 정리, 문서 기획 같은
구현 전 작업에 사용한다. 브랜치는 `CF-<Issue 번호>`이며 PR 본문에는 같은 번호의
`Closes #<Issue 번호>`를 정확히 하나만 둔다. PR 제목에는 `feat:`나 `fix:`를 붙이지
않고, 개별 커밋에는 Conventional Commit type을 유지한다.

## 작업 흐름

1. 사람이 Project draft를 만들고 AI가 대상을 정확히 하나로 확정한다.
2. AI가 제목을 `[영역] 작업명`으로 보정한 뒤 repository Issue로 승격하고 `status:planning`과 Project Status `In Progress`를 함께 적용한다.
3. Issue 본문과 단일 PR의 논리적 커밋 계획을 작성한다.
4. 사람이 Issue 본문과 계획 전문을 승인하면 AI가 원격 본문을 게시하고 확인한 뒤 `status:ready`로 전환한다.
5. 구현 시작 시 `status:in-progress`로 바꾸고 `CF-<Issue 번호>` 브랜치를 만든다.
6. TDD, 전체 검증, 두 축 코드 리뷰를 수행한다.
7. Issue와 같은 제목의 Draft PR을 만들고 Issue label을 `status:review`, Project Status를 `On Review`로 바꾼다.
8. 사람이 Draft PR을 Ready for review로 전환한다.
9. 사람이 최종 승인, Squash Commit 제목 입력, 머지를 수행한다.
10. AI가 PR의 `MERGED` 상태와 merge commit의 `origin/develop` 포함 관계를 증명한다.
11. clean한 관리 worktree와 안전한 로컬 브랜치만 정리하고 dirty 또는 외부 관리 worktree는 보존한다.

상태 변경이 일부 실패하면 완료된 앞 단계를 반복하지 않는다. 같은 Issue와 Project item을 다시 조회해 첫 미완료 단계부터 재개한다.
