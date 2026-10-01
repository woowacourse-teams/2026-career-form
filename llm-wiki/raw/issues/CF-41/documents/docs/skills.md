# 스킬 선택 기준

이 저장소는 외부 스킬을 `.agents/skills`에 직접 복사하고 각 폴더의 `UPSTREAM.json`으로 원본 커밋을 고정한다. 자동 업데이트와 심볼릭 링크를 사용하지 않는다.

## 채택

| 단계 | 스킬 | 선택 이유 |
|---|---|---|
| 전체 생명주기 | `cf-issue-lifecycle` | 기획, 구현, 사람 머지 대기와 사후 정리를 원격 상태로 재개한다 |
| Project 접근 진단 | `cf-github-project-onboarding` | 인증과 권한 문제를 원격 쓰기와 분리한다 |
| Issue 기획 | `cf-project-issue-planning` | draft를 계약과 단일 PR 계획으로 구체화한다 |
| 모호한 요구사항 구체화 | `cf-deep-interview` | 목표, 범위, 제약, 완료 기준을 한국어 질문 흐름으로 정리한다 |
| 설계 압박 질문 | `cf-grill-me`, `cf-grilling` | 고위험 결정에서 빠진 가정과 선택지를 집중 검토한다 |
| 구현 계획 | `cf-writing-plans` | 파일, 작업 순서, 테스트를 실행 단위로 만든다 |
| 작업 격리 | `cf-using-git-worktrees` | 기존 변경을 보존하며 Issue별 작업 공간을 만든다 |
| 계획 실행 | `cf-executing-plans` | 작성한 계획을 검토 지점과 함께 순서대로 실행한다 |
| 테스트 | `cf-test-driven-development` | 실패 테스트에서 시작하는 Red, Green, Refactor를 강제한다 |
| 완료 검증 | `cf-verification-before-completion` | 완료 주장 직전에 최신 명령 결과를 요구한다 |
| 코드 리뷰 | `cf-code-review` | 저장소 규칙과 Issue 명세를 나눠 전체 diff를 검토한다 |
| 머지 후 정리 | `cf-post-merge-cleanup` | 머지를 증명하고 clean한 관리 자원만 정리한다 |

`cf-finishing-a-development-branch`는 외부 스킬의 원본 추적을 위해 보관하지만 표준 Issue 생명주기에서는 호출하지 않는다. Draft PR 생성은 `cf-issue-workflow`, 머지 후 정리는 `cf-post-merge-cleanup`이 담당한다.

## 호출 관계

| 호출자 | 직접 호출하는 스킬 |
|---|---|
| `cf-issue-lifecycle` | `cf-project-issue-planning`, `cf-issue-workflow`, `cf-post-merge-cleanup` |
| `cf-project-issue-planning` | `cf-github-project-onboarding`, `cf-deep-interview`, `cf-grill-me`, `cf-issue-workflow` |
| `cf-grill-me` | `cf-grilling` |
| `cf-issue-workflow` | `cf-using-git-worktrees`, `cf-writing-plans`, `cf-executing-plans`, `cf-test-driven-development`, `cf-verification-before-completion`, `cf-code-review` |
| `cf-writing-plans` | `cf-executing-plans` |
| `cf-executing-plans` | `cf-using-git-worktrees` |
| `cf-post-merge-cleanup` | 없음 |

`cf-finishing-a-development-branch`는 위 그래프 밖에 있다. 각 `SKILL.md` frontmatter의 `metadata.calls`가 기계가 읽는 호출 관계 정본이다.

## 보류

| 후보 | 판단 |
|---|---|
| `to-tickets` | 자체 Issue tracker 설정과 라벨 체계를 전제로 해 현재 하네스와 중복된다. Parent Issue와 Sub-issue 자동 생성 요구가 구체화되면 어댑터를 만든다 |
| `brainstorming` | `cf-deep-interview`와 역할이 겹친다. 팀의 실제 기획 Issue로 비교 eval 후 하나로 통일한다 |
| upstream `requesting-code-review` | 현재 `cf-code-review`가 저장소 규칙과 Issue 명세를 함께 검사하므로 중복 설치하지 않는다 |

외부 스킬의 `UPSTREAM.json`과 `LICENSE`는 수정하지 않는다. 저장소에서 실행할 `cf-*` 어댑터 산문과 내부 호출은 팀 계약에 맞게 유지한다. upstream 갱신은 별도 `harness-change` PR에서 원본 diff, 라이선스, 어댑터 변경과 대표 Issue 동작을 검토한다.
