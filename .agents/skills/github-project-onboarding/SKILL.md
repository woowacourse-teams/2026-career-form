---
name: github-project-onboarding
description: GitHub Project 접근이 처음부터 안 되거나 gh 인증, project scope, 조직 Project 권한 문제를 진단한다. 사용자가 "프로젝트 접근이 안 돼", "gh project가 실패해", "처음 하네스를 설정해줘"처럼 이 저장소의 GitHub Project 접근 준비나 오류 해결을 요청할 때 사용한다. Issue 승격이나 상태 변경 등 Project 쓰기 작업 자체에는 사용하지 않는다.
---

# GitHub Project Onboarding

접근 문제를 원격 쓰기 작업과 분리해 진단한다. 인증 토큰과 원문 인증 출력을 대화, 로그, Issue, PR에 노출하지 않는다.

## 진단 순서

1. 저장소 루트에서 `harness/scripts/diagnose-project-access`를 실행한다.
2. 출력 code에 해당하는 한 단계만 안내한다.
3. 사람의 인증 작업이 끝나면 같은 명령을 다시 실행한다.
4. `ready`가 확인된 뒤 원래 요청으로 돌아간다. 이 스킬만 실행한 경우 Issue, Project item, label을 변경하지 않는다.

## 결과별 처리

### `gh_missing`

GitHub CLI 공식 설치 페이지를 안내하고 중단한다. 설치 여부를 추정하지 않는다.

### `unauthenticated`

사용자에게 `gh auth login`을 실행하도록 안내하고 중단한다. 브라우저 인증이나 일회용 코드는 사용자가 처리한다.

### `project_scope_missing`

사용자에게 `gh auth refresh -s project`를 실행하도록 안내하고 중단한다. scope를 우회하거나 다른 자격 증명을 찾지 않는다.

### `project_unavailable`

`harness/project.json`의 owner와 number가 대상 Project와 일치하는지 확인한다. 설정이 맞다면 조직 멤버십과 Project 권한을 사람이 확인하도록 요청한다. 원문 오류에 계정이나 조직 정보가 포함될 수 있으므로 그대로 복사하지 않는다.

### `ready`

Project 번호와 owner를 설정 파일에서 읽어 접근 준비가 끝났다고 보고한다. 원래 요청이 쓰기 작업을 명시했다면 해당 작업 스킬로 전환하고, 그렇지 않으면 진단만 마친다.

## 안전 경계

- `gh auth token`, 환경 변수, credential 저장소를 읽지 않는다.
- 인증 오류의 stdout과 stderr를 그대로 출력하지 않는다.
- 진단 과정에서 Project item, Issue, label, field 값을 변경하지 않는다.
- 해결 명령이 사람 입력을 기다리면 실행을 맡기고 결과를 기다린다.
