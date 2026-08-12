# GitHub 초기 설정

저장소 관리자가 한 번 수행하는 서버 설정이다. 하네스 구현 PR과 분리하고 각 단계의 결과를 다른 팀원이 확인한다.

## 브랜치

- [x] `main` 브랜치를 운영 기준 브랜치로 둔다.
- [x] `develop` 브랜치를 개발 통합 브랜치로 둔다.
- [x] 기본 브랜치를 `develop`으로 지정한다.
- [ ] Squash Merge와 일반 Merge를 활성화하고 Rebase Merge 사용 여부를 팀에서 정한다.

## 라벨

- [x] `status:planning`
- [x] `status:ready`
- [x] `status:in-progress`
- [x] `status:blocked`
- [x] `status:review`
- [x] `harness-change`
- [x] `type:bug`
- [x] `type:feature`
- [x] `type:technical`

작업 상태 라벨은 한 Issue에 하나만 유지한다. `status:ready`는 사람만 붙이고, 이후 작업 상태 라벨은 `issue-workflow`가 전환한다.

`type:bug`, `type:feature`, `type:technical`은 Jira 생성 유형을 판별하는 Issue Form 라벨이다. 작업 상태 라벨이 아니므로 `status:*` 라벨과 함께 유지한다.

## Ruleset

- [x] `harness/policies/github-ruleset.md`의 `main` 설정을 적용한다.
- [x] 같은 문서의 `develop` 설정을 적용한다.
- [ ] 세 GitHub Actions 검사를 필수 상태 검사로 지정한다.
- [x] 최소 한 명의 사람 승인을 요구한다.
- [x] force push와 브랜치 삭제를 금지한다.

## 리뷰 소유권

- [x] 초기 운영에서는 CODEOWNERS를 사용하지 않는다.
- [x] 모든 PR에 다른 사람의 승인 1명을 요구한다.
- [ ] 하네스 변경의 리뷰 누락이 반복되면 CODEOWNERS 도입을 재검토한다.

## 배포 연결

- [ ] 개발 서버, 스테이징 서버, 운영 서버의 배포 워크플로우를 별도 담당자가 만든다.
- [ ] 배포 환경과 시크릿은 GitHub Environment에서 관리한다.
- [ ] 스테이징과 운영 배포에 필요한 사람 승인자를 지정한다.

## Jira 연동

- [ ] Jira Cloud 테스트 프로젝트에 `Epic`, `Story`, `Task`, `Bug` 이슈 유형과 이슈 생성 권한을 준비한다.
- [ ] Repository variable `JIRA_PROJECT_KEY`를 설정한다. 비워 두면 workflow는 `CF`를 기본값으로 사용한다.
- [ ] Repository secrets `JIRA_BASE_URL`, `JIRA_USER_EMAIL`, `JIRA_API_TOKEN`을 사람이 등록한다.
- [ ] 기본 브랜치 반영 뒤 비식별 Issue로 workflow dispatch dry-run을 실행한다.
- [ ] 테스트 프로젝트에서 Bug, Technical, Feature(Epic), Feature(Story) 생성과 GitHub 링크 댓글을 사람이 확인한다.

Jira API 토큰은 로그, Issue, PR, Fixture에 기록하지 않는다. AI는 시크릿을 등록,열람하지 않으며, 실제 Jira 이슈 삭제나 운영 프로젝트 정리 작업을 수행하지 않는다.
