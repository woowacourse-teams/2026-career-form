# 프로젝트 작업 지침

## 작업 시작

- 모든 개발 작업은 사람이 `status:ready`로 확정한 GitHub Issue에서 시작한다.
- Issue 본문을 작업 범위와 완료 기준의 정본으로 사용한다.
- 하나의 Issue는 하나의 작업 브랜치와 하나의 PR로 완료한다. Sub-issue는 만들지 않는다.
- 일반·릴리스 수정 작업 브랜치는 `CF-<Issue 번호>`, 운영 hotfix 작업 브랜치는
  `hotfix/CF-<Issue 번호>` 형식으로 만든다.
- AI는 새 clone 또는 worktree에서 파일을 수정하기 전에 운영체제에 맞는 Python으로 `harness/scripts/ensure-environment.py`를 실행해 작업 환경을 자동 구성한다. 자동 구성에 실패하면 수정하지 않고 원인을 보고한다.
- 하네스, Git 훅, 에이전트 검증의 공식 실행 환경은 WSL/Linux다. Windows 사용자는 WSL 내부 파일시스템의 `/home/...` 아래에 저장소를 clone하고 WSL의 `git`, `python3`, 가상환경으로 검증한다. Windows PowerShell 직접 실행은 지원 대상이 아니다.
- 작업 계획은 필요할 때 `docs/plans/<Issue 번호>-<slug>.md`에 기록한다.
- 공용 `HANDOFF.md`를 작업 상태 기록에 사용하지 않는다.

## 구현과 검증

프로젝트의 기획, 설계, 구현과 검토를 시작하기 전에 작업과 관련된 범위에서 다음
기준 문서를 읽는다.

1. `docs/PRODUCT_CONCEPT.md`
2. `docs/PROFILE_FIELDS.md`

- 관련 없는 사용자 변경을 보존하고 현재 Issue 범위만 수정한다.
- 동작을 바꾸기 전에 실패하는 테스트를 만들고, 변경 뒤 관련 테스트와 전체 검증을 실행한다.
- 완료 전 운영체제에 맞는 가상환경 Python으로 `harness/scripts/verify.py`를 실행하고 최신 결과를 PR에 기록한다.
- 컨벤션은 `docs/conventions/common.md`와 작업 스택에 맞는 문서를 따른다.
- 개별 커밋과 PR 제목은 서로 다른 형식을 사용하며 `docs/conventions/commit.md`를 따른다. 브랜치와 병합은 `docs/conventions/branching.md`를 따른다.

## 범위와 승인

- Issue 범위를 넘는 작업은 현재 작업에 섞지 않는다. 독립 기능이나 FE, BE, Infra 영역으로 나눌 필요가 있으면 GitHub Project의 별도 draft 후보로 제안한다.
- 실제 채용 지원서 제출, 임시저장, 페이지 이동, 미리보기는 사용자가 수행한다.
- 시크릿 접근, 파괴적 명령, 데이터 마이그레이션, 배포는 AI가 실행하지 않는다.
- PR 최종 승인과 머지는 사람이 수행한다.
- 공유 보호 영역은 별도 하네스 Issue와 `harness-change` 라벨로 변경한다.

## 개인정보

- 실제 지원서 입력값, 계정 정보, 브라우저 세션 상태를 개인정보로 취급한다.
- 문서, Issue, PR, 로그에는 비식별 처리한 구조와 검증 결과만 기록한다.

## 회사 어댑터

회사 어댑터를 만들거나 수정하기 전에 아래 문서를 순서대로 읽는다.

1. `docs/adapters/adapter-development.md`
2. `docs/adapters/companies/<company>/`의 대상 회사 문서
3. `docs/adapters/field-inventory.md`

어댑터 동작을 바꾸면 코드, 자동화 테스트, 대상 회사 문서, 지원 현황표를 함께 갱신한다. 페이지 구조가 달라져 안전한 매핑을 검증할 수 없으면 범용 매처로 우회하지 않고 해당 필드를 입력 불가로 표시한다.
