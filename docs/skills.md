# 스킬 선택 기준

이 저장소는 외부 스킬을 `.agents/skills`에 직접 복사하고 각 폴더의 `UPSTREAM.json`으로 원본 커밋을 고정한다. 자동 업데이트와 심볼릭 링크를 사용하지 않는다.

## 채택

| 단계 | 스킬 | 선택 이유 |
|---|---|---|
| 모호한 요구사항 구체화 | `deep-interview` | 목표, 범위, 제약, 완료 기준을 한국어 질문 흐름으로 정리한다 |
| 설계 압박 질문 | `grill-me`, `grilling` | 고위험 결정에서 빠진 가정과 선택지를 집중 검토한다 |
| 구현 계획 | `writing-plans` | 파일, 작업 순서, 테스트를 실행 단위로 만든다 |
| 작업 격리 | `using-git-worktrees` | 기존 변경을 보존하며 Issue별 작업 공간을 만든다 |
| 계획 실행 | `executing-plans` | 작성한 계획을 검토 지점과 함께 순서대로 실행한다 |
| 테스트 | `test-driven-development` | 실패 테스트에서 시작하는 Red, Green, Refactor를 강제한다 |
| 완료 검증 | `verification-before-completion` | 완료 주장 직전에 최신 명령 결과를 요구한다 |
| 코드 리뷰 | `code-review` | 저장소 규칙과 Issue 명세를 나눠 전체 diff를 검토한다 |

`finishing-a-development-branch`는 `executing-plans`의 의존 스킬이라 함께 보관한다. 이 저장소에서는 그 스킬의 선택지 중 branch push와 Draft PR까지만 허용하고, 로컬 머지, 최종 승인, 원격 머지는 수행하지 않는다.

## 보류

| 후보 | 판단 |
|---|---|
| `to-tickets` | 자체 Issue tracker 설정과 라벨 체계를 전제로 해 현재 하네스와 중복된다. Parent Issue와 Sub-issue 자동 생성 요구가 구체화되면 어댑터를 만든다 |
| `brainstorming` | `deep-interview`와 역할이 겹친다. 팀의 실제 기획 Issue로 비교 eval 후 하나로 통일한다 |
| `requesting-code-review` | 현재 `code-review`가 저장소 규칙과 Issue 명세를 함께 검사하므로 중복 설치하지 않는다 |

외부 스킬의 산문을 팀 규칙에 맞게 직접 고치지 않는다. 충돌하는 행동은 `AGENTS.md`, `issue-workflow`, Codex 훅, GitHub 게이트가 우선 차단한다. 업데이트는 별도 `harness-change` PR에서 원본 diff, 라이선스, 대표 Issue 동작을 검토한다.
