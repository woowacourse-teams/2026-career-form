# Issue 14 공용 하네스 생명주기 구현 계획

**목표:** Windows와 POSIX에서 실행되는 공용 하네스와 `cf-*` 스킬의 재개 가능한 Issue 생명주기를 하나의 PR로 제공한다.

**구조:** Python 인터프리터 선택과 GitHub 본문 렌더링을 순수 Python 모듈로 분리한다. 단계별 스킬은 독립적으로 유지하고 상태 계획 모듈과 `cf-issue-lifecycle`이 GitHub 상태를 기준으로 다음 단계를 선택한다. 템플릿은 생성 원본, 기존 계약 검증기는 독립 안전 기준으로 유지한다.

## 1. 크로스플랫폼 Python 실행 계약

- [x] Windows와 POSIX 가상환경 Python 선택의 실패 테스트를 추가한다.
- [x] 환경 구성 subprocess와 Git 훅이 Python 파일을 직접 실행하지 않게 한다.
- [x] doctor, bootstrap, verify가 공통 선택기를 사용하게 한다.
- [x] 관련 테스트와 전체 검증을 실행한다.

커밋: `fix: 크로스플랫폼 Python 하네스 실행 경로 통일`

## 2. 템플릿 기반 Issue와 PR 본문 생성

- [x] 선택한 Issue Form의 textarea 순서, label과 기본값을 Markdown으로 렌더링한다.
- [x] PR 템플릿 모든 섹션을 채우고 종료 참조를 하나만 만든다.
- [x] OS 임시 UTF-8 Markdown 파일을 생성하는 CLI를 추가한다.
- [x] 인라인 `--body`를 차단하고 `--body-file`을 허용한다.
- [ ] GitHub 화면에서 생성 결과를 사람이 확인한다.

커밋: `feat: 템플릿 기반 Issue 및 PR 본문 생성`

## 3. 저장소 스킬 CF 이름 통일

- [x] 기존 13개 스킬 폴더와 frontmatter name에 `cf-`를 붙인다.
- [x] 기본 프롬프트, eval 이름, 내부 참조와 문서를 실제 이름에 맞춘다.
- [x] 외부 스킬의 `UPSTREAM.json`과 `LICENSE`를 보존한다.
- [x] `#123` 뒤 description이 YAML 파싱 후에도 보존되게 한다.

커밋: `refactor: 저장소 스킬 CF 이름 통일`

## 4. 전체 Issue 생명주기

- [x] `cf-issue-lifecycle`과 `cf-post-merge-cleanup`을 추가한다.
- [x] 기획에서 onboarding, interview와 grill 조건을 연결한다.
- [x] 구현에서 worktree, plans, execution, TDD, verification과 review를 연결한다.
- [x] 미병합, merge commit 미포함, dirty 및 외부 worktree 정리를 차단한다.
- [x] `cf-finishing-a-development-branch`를 표준 생명주기에서 분리한다.

커밋: `feat: CF Issue 전체 생명주기 구성`

## 5. 라우팅 eval과 문서

- [x] 각 핵심 스킬의 포함 및 배제 라우팅 사례를 짝으로 기록한다.
- [x] 중복 로컬 스킬 환경 사례와 판단 근거를 기록한다.
- [x] ADR, 스킬 관계, 승인 지점과 머지 후 정리 정책을 문서화한다.
- [ ] 새 Windows 세션에서 경로, 훅, 템플릿 개행과 라우팅을 사람이 확인한다.
- [x] `harness/scripts/verify.py`와 코드 리뷰를 통과한다.

커밋: `test: CF 스킬 라우팅 및 생명주기 검증`

## 6. Issue와 PR 영역 prefix 대문자 통일

- [x] `[INFRA]`, `[HARNESS]`, `[RELEASE]`를 포함한 모든 영역 prefix를 대문자로 제한하는 실패 테스트를 추가한다.
- [x] 제목 검증기와 배포 PR 계약이 대문자 prefix만 허용하게 한다.
- [x] 기획 스킬, 정책, 컨벤션과 예시 제목을 대문자 계약에 맞춘다.
- [x] Issue #14와 PR #15 제목을 `[HARNESS]`로 맞춘다.
- [x] 관련 테스트와 전체 검증을 통과한다.

커밋: `fix: Issue와 PR 영역 prefix 대문자 강제`
