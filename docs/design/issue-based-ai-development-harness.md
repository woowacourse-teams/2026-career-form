# Issue 기반 Codex 개발 하네스 설계

## 개요

이 저장소에서는 모든 개발자가 Codex와 같은 하네스 안에서 작업한다. GitHub
Issue가 작업 범위와 완료 기준의 정본이며, 프로젝트 전용 `cf-issue-workflow` 스킬이
기획, 구현, 검증, Git 작업에 필요한 개별 스킬을 연결한다.

AI는 사람이 확정한 Issue에서 시작해 Draft PR 생성과 원격 계약 검증까지 담당한다.
Issue와 Draft PR의 원격 수정, PR 최종 승인과 머지, 시크릿 접근, 파괴적 명령,
마이그레이션, 배포는 사람이 담당한다.

## 작업 흐름

```text
기획과 요구사항 구체화
        ↓
Project draft를 Issue로 승격하고 In Progress 전환
        ↓
AI가 Issue 본문을 게시하고 status:planning에서 중단
        ↓
사람이 GitHub Issue를 수정하고 재개
        ↓
AI가 원격 Issue를 검증하고 status:ready 전환
        ↓
cf-issue-workflow 실행
        ↓
worktree 체크포인트 초기화
        ↓
계획 확인 -> 구현 -> 검증을 단계 시작 전에 기록
        ↓
현재 HEAD 검증 근거 확인 뒤 AI가 Draft PR 생성
        ↓
사람이 GitHub Draft PR을 수정하고 재개
        ↓
AI가 원격 PR을 검증하고 status:review 전환
        ↓
사람이 Ready for review로 전환
        ↓
사람이 최종 승인 및 머지
```

## Issue 계약과 상태

Issue 본문은 다음 정보를 담는 작업 계약이다.

- 배경과 해결할 문제
- 목표 결과
- 포함 범위와 제외 범위
- 확정된 제품 및 기술 결정
- 관찰 가능한 인수 조건
- 자동 검증 항목과 사람의 수동 검증 항목
- 의존 Issue와 차단 관계
- 위험 작업 여부와 참고 문서

계약 판단에 필요한 정보는 생략하지 않되 같은 사실은 역할에 맞는 섹션 한 곳에만
작성한다. 문장을 제거해도 계약 판단이 달라지지 않으면 제거하며 분량을 수치로
제한하지 않는다.

AI가 Issue 초안을 게시한 뒤에는 `status:planning`을 유지한다. 사람이 GitHub에서
제목과 본문을 수정하고 재개하면 AI가 원격 계약을 검증한 뒤 `status:ready`로
전환한다. `status:ready` 이후에는 Issue 본문을 변경하지 않는다. 정정이 필요하면
사람이 먼저 `status:planning`으로 되돌리고 본문을 고친 뒤 같은 검증을 거쳐 다시 확정한다.
범위가 커지면 기존 Issue에 추가하지 않고 Project의 독립 draft 후보로 제안한다.

Issue의 작업 상태는 본문이 아니라 라벨, 담당자, 연결 PR로 표현한다.

| 상태 | 의미 | 전환 주체 |
|---|---|---|
| `status:planning` | 기획, 요구사항 정리 또는 Issue 수동 편집 중 | 사람, AI 보조 |
| `status:ready` | 사람이 범위와 완료 기준을 확인하고 AI 검증을 통과함 | 사람 확인, AI 전환 |
| `status:in-progress` | 구현, 검증 또는 Draft PR 수동 편집 중 | 사람, AI |
| `status:blocked` | 외부 판단이나 권한이 필요함 | AI |
| `status:review` | Draft PR과 검증 근거가 준비됨 | AI |
| Closed | 연결 PR이 머지됨 | GitHub |

진행 상황을 Issue 댓글에 반복해서 남기지 않는다. 다음 작업자가 반드시 알아야 하는
차단 사유만 댓글로 기록하고, 구현과 검증 근거는 PR에 기록한다.

PR 본문은 변경 결과, 이유, 구현 방식, 기존 기능 영향, 검토한 대안과 리뷰 포인트를
바로 보여준다. 자동 및 수동 검증의 최신 상태는 본문 하단의 접힌 검증 기록에 남긴다.
Issue와 ADR의 배경 및 결정 전문은 반복하지 않는다.

GitHub Project draft는 기능 단위 백로그다. FE, BE, INFRA처럼 독립 구현이 필요한 큰
영역만 별도 draft로 나누고 Sub-issue는 사용하지 않는다. 승격된 Issue 하나는
`CF-<Issue 번호>` 브랜치 하나와 PR 하나로 완료한다.
[GitHub Issue Form 문서](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms),
[GitHub Projects 문서](https://docs.github.com/en/issues/planning-and-tracking-with-projects)

## 책임과 승인 경계

| 작업 | 담당 | 강제 방식 |
|---|---|---|
| 기획 방향 결정 | 사람 | 승인 체크포인트 |
| 요구사항 질문과 정리 | AI | 스킬 |
| Issue 초안 게시 | AI | `status:planning` 유지 |
| Issue 수정과 재개 | 사람 | GitHub 원격 정본 |
| Issue 최종 확정 | 사람 확인, AI 검증 | `status:ready` |
| 코드 조사, 계획, 구현 | AI | 오케스트레이션 |
| 중단 뒤 작업 재개 | AI | worktree 체크포인트와 실제 Git 및 PR 대조 |
| TDD와 완료 검증 | AI | 스킬, 테스트, CI |
| 범위 초과 처리 | AI | 독립 draft 제안, 현재 작업 제외 |
| draft 승격 | AI | `status:planning`, Project `In Progress` |
| Draft PR 생성 | AI | `status:in-progress` 유지 |
| Draft PR 수정과 재개 | 사람 | GitHub 원격 정본 |
| Draft PR 검증과 리뷰 전환 | AI | PR 계약 검사, `status:review` |
| Ready for review 전환 | 사람 | GitHub PR 상태 |
| PR 최종 승인과 머지 | 사람 | GitHub Ruleset |
| 시크릿, 삭제, 마이그레이션 | 사람 | Codex 훅으로 AI 실행 차단 |
| 배포 | 별도 담당자 | 하네스 실행 권한에서 제외 |

## 외부 스킬

단계별 스킬은 독립적으로 두고 `cf-issue-lifecycle`이 기획, 구현, Issue와 Draft PR의
수동 편집 대기, 사람 머지 대기와 정리를 연결한다. `cf-issue-workflow`는 ready Issue의
구현, worktree 체크포인트, Draft PR 게시와 사람 재개 후 원격 PR 검증을 담당한다.

| 단계 | 후보 |
|---|---|
| 요구사항 구체화 | `cf-deep-interview` |
| 고위험 설계 검토 | `cf-grill-me`, 선택 사용 |
| Project 접근 진단 | `cf-github-project-onboarding` |
| draft 승격과 Issue 계획 | `cf-project-issue-planning` |
| 구현 계획 | `cf-writing-plans` |
| 작업 격리 | `cf-using-git-worktrees` |
| 계획 실행 | `cf-executing-plans` |
| TDD | `cf-test-driven-development` |
| 완료 검증 | `cf-verification-before-completion` |
| 코드 리뷰 | `cf-code-review` |
| 전체 생명주기 | `cf-issue-lifecycle` |
| 머지 후 정리 | `cf-post-merge-cleanup` |

외부 스킬은 심볼릭 링크나 사용자 전역 설치로 공유하지 않는다. 검토한 원본을
`.agents/skills/<skill-name>/`에 직접 저장한다. 각 외부 스킬 폴더에는 원본 저장소,
경로, 고정 커밋 SHA를 기록한 `UPSTREAM.json`과 원본 `LICENSE`를 함께 둔다.
업데이트는 자동 반영하지 않고 별도 PR에서 diff와 라이선스를 검토한다.

Codex는 저장소의 `.agents/skills`에서 프로젝트 스킬을 발견한다.
[Codex Skills 문서](https://developers.openai.com/codex/skills)

## 컨벤션과 강제 계층

```text
AGENTS.md와 docs/conventions
    -> AI에게 작성 방법을 안내

.codex/rules와 Codex 훅
    -> 위험한 명령과 도구 실행을 통제

Git 훅
    -> 커밋 메시지와 로컬 변경을 검사

GitHub Actions와 Ruleset
    -> PR과 머지를 서버에서 강제
```

`docs/conventions`는 사람이 읽는 작성 기준이며 자체 강제성이 없다. `AGENTS.md`와
스킬이 적용 시점을 안내한다. 포맷, 테스트, 커밋 형식처럼 기계적으로 판정할 수 있는
항목은 하네스 스크립트, Git 훅, CI가 검사한다.

`.codex/rules/command-policy.rules`는 코드 스타일이 아니라 Codex 명령 실행 권한을
제어한다. 파일 삭제나 도구 입력처럼 명령 접두사만으로 판단하기 어려운 작업은
`PreToolUse` 훅이 실행 전에 차단한다.

GitHub Ruleset은 PR, 필수 검사, 사람 승인, force push 금지를 서버에서 강제한다.
[GitHub Ruleset 문서](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)

## 커밋 컨벤션

기본 형식은 다음과 같다.

```text
<type>: <한글 설명>
```

- type은 `feat`, `fix`, `refactor`, `test`, `perf`, `docs`, `chore`, `ci`,
  `build`, `revert` 중 하나를 사용한다.
- scope는 사용하지 않는다.
- 설명과 본문은 한글로 작성한다.
- 제목만 읽어도 실제 변경 내용을 알 수 있게 작성한다.
- 문장 끝에 마침표를 붙이지 않는다.
- 한 커밋에는 하나의 논리적 변경만 담는다.
- 하위 호환성을 깨면 `type!`과 `BREAKING CHANGE` Footer를 함께 사용한다.
- 설명은 명사형으로 작성하고 `한다`로 끝내지 않는다.

AI는 `docs/conventions/commit.md`를 따라 메시지를 작성한다. `commit-msg` Git 훅은
type, scope 미사용, 한글 포함, 마침표, Breaking Change 형식을 검사한다.

Issue와 PR 제목은 `[영역] 작업명` 형식을 사용한다. 영역은 `FE`, `BE`, `AI`, `Infra`,
`Harness`, `Plan`을 허용한다. `FE`, `BE`, `AI`만 전체를 대문자로 쓴다. `AI`는 제품의
LLM, 모델, 프롬프트, 에이전트 기능 작업에 사용하고 `Harness`는 개발 하네스와
워크플로우 변경에 사용한다. `Plan`은 구현 전 조사와 기획에 사용한다. `feat:`,
`fix:` 같은 type을 붙이지 않고 명사형으로 작성한다. 최종 승인자는 GitHub 머지
화면에서 Squash Commit 제목과 본문을 직접 확인한다. `pr-contract.yml`은 PR 제목,
브랜치 번호, 종료 Issue 번호와 시스템 PR 종류를 검사한다.

## 브랜치와 환경

`develop`의 계속되는 개발과 스테이징 검증을 분리하는 release 브랜치 기반 Git Flow를
사용한다.

```text
CF-* -> develop -> release/<MAJOR.MINOR.PATCH> -> main
```

| 브랜치 | 시작점 | 병합 대상과 방식 | 환경 |
|---|---|---|---|
| `CF-<issue>` | `develop` 또는 수정 대상 release | `develop`, `release/*`로 Squash Merge | 개발 서버 |
| `hotfix/CF-<issue>` | `main` | `main`으로 Squash Merge | 운영 긴급 수정 |
| `develop` | 장기 브랜치 | Start release의 기준 | 통합 기준 |
| `release/<MAJOR.MINOR.PATCH>` | 현재 `develop` HEAD | `main`, `develop`으로 Merge Commit | 스테이징 서버 |
| `main` | 운영 기준 | 프로덕션 배포 기준 | 운영 서버 |
| `revert/<main-merge-sha>` | 운영 실패 병합 | `main`으로 Merge Commit | 운영 복구 |

Start release는 현재 `develop` HEAD에서 만들고 활성 release 브랜치는 하나만 둔다.
release, hotfix 동기화, revert 시스템 PR은 `[Release]` 제목을 사용하며 Issue를
종료하지 않는다. `hotfix/CF-*` → `main`만 운영 긴급 수정으로 허용하고 일반
`CF-*` → `main`과 임의의 `develop` → `main`은 거부한다.

현재 저장소의 기본 브랜치는 `develop`이다. `main`, `develop`, `release/*`는 GitHub
Ruleset으로 직접 push, force push, 삭제를 막고 사람 승인 1명을 요구한다. 실제
브랜치 생성, Ruleset 변경, 승인, 병합, 배포와 되돌림은 사람이 수행한다.

## 네 명의 병렬 작업을 위한 충돌 방지

실시간 작업 상태를 공용 `HANDOFF.md`에 기록하지 않는다. Issue와 연결 PR은 원격 협업
상태의 정본이고, 단계 실행 상태는 worktree 전용 Git 디렉터리의 체크포인트에 둔다.
재개 시 체크포인트를 현재 브랜치, HEAD, 계획 파일, 검증 결과와 Draft PR에 대조한다.
환경변수와 `MEMORY.md`는 완료 상태의 기준으로 사용하지 않는다.

다음 경로는 일반 기능 PR에서 수정하지 않는 공유 보호 영역이다.

```text
AGENTS.md
.agents/skills/**
.codex/**
.github/ISSUE_TEMPLATE/**
.github/workflows/**
.githooks/**
harness/**
docs/conventions/**
```

공유 보호 영역 변경에는 별도 하네스 Issue, `harness-change` 라벨, 하네스 전체 테스트,
다른 팀원 한 명 이상의 리뷰를 요구한다. `shared-files.yml`이 이 계약을 검사한다.
초기 운영에서는 CODEOWNERS 없이 사람 승인 1명과 `harness-change` 라벨 검사를 사용한다.
하네스 리뷰 누락이 반복되거나 담당 영역이 고정되면 CODEOWNERS 도입을 재검토한다.

외부 스킬의 메타데이터와 라이선스는 공용 잠금 파일 대신 각 스킬 폴더의
`UPSTREAM.json`과 `LICENSE`로 분리해 서로 다른 스킬 업데이트의 충돌을 줄인다.

## 파일 구조와 책임

```text
2026-career-form/
├── AGENTS.md                          # Codex가 자동으로 읽는 짧은 프로젝트 지침과 문서 라우터
├── README.md                          # 사람을 위한 프로젝트 소개와 하네스 시작 방법
├── .gitignore                         # 워크트리, 캐시, 생성 로그 제외 규칙
│
├── .agents/skills/
│   ├── cf-issue-lifecycle/SKILL.md       # 기획부터 머지 후 정리까지 연결하는 오케스트레이터
│   ├── cf-issue-workflow/SKILL.md        # ready Issue에서 Draft PR까지 연결
│   ├── cf-post-merge-cleanup/SKILL.md    # 검증된 머지 뒤 로컬 작업 자원 정리
│   └── cf-<external-skill>/
│       ├── SKILL.md                   # 저장소에 직접 포함한 외부 스킬 원본
│       ├── UPSTREAM.json              # 원본 저장소, 경로, 고정 SHA 기록
│       ├── LICENSE                    # 외부 스킬 원본 라이선스
│       └── <supporting-files>         # 원본 스킬이 사용하는 references, scripts, assets
│
├── .codex/
│   ├── config.toml                    # sandbox, 승인 정책, 훅 활성화 설정
│   ├── hooks.json                     # Codex 이벤트와 하네스 스크립트 연결
│   └── rules/command-policy.rules     # 위험 명령의 허용, 승인, 금지 정책
│
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── feature.yml                # 기능 Issue Form
│   │   ├── bug.yml                    # 버그 Issue Form
│   │   ├── technical-task.yml         # 인프라, 리팩터링, 하네스 Issue Form
│   │   └── config.yml                 # 빈 Issue 허용 여부와 선택 화면 설정
│   ├── workflows/
│   │   ├── issue-contract.yml         # status:ready 전환 시 Issue 계약 검사
│   │   ├── pr-contract.yml            # PR 제목, Issue 연결, 대상 브랜치 검사
│   │   ├── quality-gate.yml           # 포맷, 린트, 테스트, 빌드 실행
│   │   └── shared-files.yml           # 공유 보호 영역 변경 조건 검사
│   └── pull_request_template.md        # 검증 근거와 수동 확인을 받는 PR 양식
│
├── .githooks/
│   ├── commit-msg                     # 커밋 메시지 구조 검사
│   ├── pre-commit                     # 커밋 전 빠른 품질 검사
│   └── pre-push                       # push 전 전체 검증
│
├── harness/
│   ├── README.md                      # 하네스 구조와 문제 해결 방법
│   ├── policies/
│   │   ├── workflow.md                # Issue에서 Draft PR까지의 단계 정의
│   │   ├── issue-contract.md          # Issue 불변 정책과 독립 draft 기준
│   │   ├── approval-matrix.md         # 사람, AI, 자동 게이트의 책임
│   │   ├── environments.md            # 브랜치와 개발, 스테이징, 운영 환경 관계
│   │   ├── github-setup.md             # 사람이 수행할 GitHub 최초 설정 체크리스트
│   │   └── github-ruleset.md           # GitHub에 적용할 서버 측 보호 설정
│   ├── lib/                            # 계약을 부작용 없이 판정하는 Python 모듈
│   ├── requirements.txt                # 검증 도구의 고정 Python 의존성
│   ├── scripts/
│   │   ├── bootstrap                  # 전용 가상 환경, Git hooksPath 구성
│   │   ├── doctor                     # Codex, Git, gh, 훅, 스킬 상태 점검
│   │   ├── guard-tool-use             # 삭제, 시크릿, 마이그레이션, 배포 차단
│   │   ├── validate-issue             # Issue 상태와 필수 정보 검사
│   │   ├── validate-branch            # Git Flow 브랜치와 병합 경로 검사
│   │   ├── validate-commit-message    # 커밋 메시지 구조 검사
│   │   ├── validate-pr                # PR 계약 검사
│   │   ├── validate-shared-files      # 공유 영역 라벨 조건 검사
│   │   ├── validate-skills            # 스킬 실물, 원본, 라이선스 검사
│   │   └── verify                     # 모든 프로젝트 품질 검사의 단일 진입점
│   └── tests/                          # 계약, CLI, 저장소 연결의 Python 행동 테스트
│
└── docs/
    ├── skills.md                       # 외부 스킬 채택과 보류 근거
    ├── design/
    │   └── issue-based-ai-development-harness.md # 이 설계의 정본
    ├── conventions/
    │   ├── common.md                  # 스택 독립 코드와 테스트 원칙
    │   ├── commit.md                  # 팀 커밋 컨벤션 전체
    │   ├── branching.md               # release와 hotfix Git Flow 및 병합 정책
    │   └── stacks/README.md           # 스택별 컨벤션 추가 방법
    └── plans/
        ├── README.md                  # Issue별 구현 계획 이름과 보관 규칙
        └── <issue-number>-<slug>.md   # 병렬 작업과 충돌하지 않는 Issue별 계획
```

`harness/policies`와 `harness/README.md`는 설명 문서라 자체 강제성이 없다.
`harness/scripts`는 Codex 훅, Git 훅, GitHub Actions에서 호출될 때 정책을 검사하거나
실행을 차단한다. `harness/tests`는 그 차단 동작을 검증한다.

## 범위

### 포함

- Issue와 PR 계약
- Codex 프로젝트 설정, 명령 정책, 훅
- 외부 스킬 고정과 프로젝트 오케스트레이션
- Git 훅과 GitHub Actions
- 브랜치, 커밋, 환경 정책
- 네 명의 병렬 작업 충돌 방지
- 하네스 자체 행동 테스트

### 제외

- 애플리케이션 기술 스택 결정
- 스택별 포맷, 린트, 테스트 명령
- 배포 파이프라인 구현
- 실제 배포, 시크릿 접근, 마이그레이션
- Codex 이외 AI 도구 지원
- 야간 무인 실행

## 구현 작업 목록

- [x] #1 Issue 상태와 Issue Form 계약을 확정한다
- [x] #2 외부 스킬 후보를 비교 평가하고 원본을 고정한다
- [x] #3 `AGENTS.md`와 공용 `HANDOFF.md` 정책을 Issue 중심으로 변경한다
- [x] #4 커밋과 브랜치 컨벤션 문서를 구성한다
- [x] #5 Codex 설정, 명령 정책, 위험 작업 차단 훅을 구성한다
- [x] #6 하네스 검사 스크립트와 행동 테스트를 구성한다
- [x] #7 Git 훅과 PR 계약 검사를 구성한다
- [x] #8 GitHub Actions와 공유 파일 변경 게이트를 구성한다
- [ ] #9 GitHub Ruleset과 하네스 경로 리뷰 정책을 적용한다
- [x] #10 Issue 오케스트레이션 스킬을 구현한다
- [ ] #11 샘플 Issue로 Draft PR까지 전체 흐름을 검증한다
- [ ] #12 기술 스택 확정 후 품질 명령을 연결한다

## 남은 결정

- 애플리케이션 기술 스택과 품질 명령
- 개발 서버 배포를 자동화할지 배포 담당자가 수동 승인할지
- 외부 스킬 후보 eval에 사용할 대표 Issue
