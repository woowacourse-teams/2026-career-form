# GitHub Issue Form 기반 Jira 이슈 자동 생성 연동 구현 계획

> **For agentic workers:** 구현은 Issue #5의 범위를 벗어나지 않으며, 각 Task에서 먼저 실패하는 테스트를 확인한 뒤 최소 변경을 적용한다.

**목표:** Bug·Technical·Feature(Epic/Story) GitHub Issue를 열면 Jira Cloud 이슈를 한 번 생성하고, 원본 Issue 제목 앞에 Jira 키를 붙인 뒤 Jira 링크 댓글을 남긴다.

**구조:** 순수 Node 모듈이 GitHub Issue와 댓글을 입력받아 Jira 유형, 중복 여부, ADF 요청 본문을 만든다. GitHub Actions는 같은 모듈을 PR 테스트, Issue 생성 이벤트, 수동 dry-run에서 재사용하고, 생성 모드에서만 Jira REST API v3을 호출한다.

**기술:** GitHub Issue Forms, GitHub Actions, Node.js 내장 `node:test`, GitHub CLI, Jira Cloud REST API v3, curl.

## 전역 제약

- Jira API 토큰·이메일·기본 URL은 GitHub repository secrets로만 사람이 등록하며 코드·로그·Fixture에 기록하지 않는다.
- Jira 설명의 `description`은 API v3에 맞는 Atlassian Document Format(ADF)으로 보낸다.
- GitHub Issue 생성 직후의 Jira 생성은 단방향이며 GitHub 상태 라벨은 `status:planning`으로 유지한다.
- 브랜치 생성, Jira Development 패널 REST 호출, Jira 상태 양방향 동기화는 구현하지 않는다. Jira 생성 뒤에는 GitHub Issue 제목을 `[JIRA-키] 기존 제목`으로 갱신한다.
- `.github/`와 `harness/policies/`는 보호 영역이므로 PR은 `harness-change` 라벨이 붙은 Issue #5를 `Closes #5`로 연결한다.
- 로컬 Windows에서 하네스의 POSIX 전용 실행 테스트가 실패하는 경우, 그 실패는 Jira 변경과 분리해 PR 수동 검증 항목으로 기록하고 Linux CI의 `harness/scripts/verify`를 최종 근거로 사용한다.

---

## 파일 구조

| 파일 | 책임 |
| --- | --- |
| `.github/ISSUE_TEMPLATE/bug.yml` | `type:bug` 라벨을 부여한다. |
| `.github/ISSUE_TEMPLATE/feature.yml` | `type:feature` 라벨과 필수 Jira 유형(Epic/Story) 드롭다운을 제공한다. |
| `.github/ISSUE_TEMPLATE/technical-task.yml` | `type:technical` 라벨을 부여한다. |
| `scripts/jira_issue_payload.mjs` | 유형 매핑, 댓글·제목 기반 중복 검사, 제목 접두어, ADF 설명, Jira Create Issue payload를 만드는 순수 모듈과 CLI다. |
| `scripts/jira_issue_payload.test.mjs` | 순수 모듈의 입력/출력 계약을 Node 내장 테스트로 검증한다. |
| `.github/workflows/create-jira-issue.yml` | Issue opened, PR dry-run, 수동 dry-run을 오케스트레이션하고 Jira API/댓글 API 경계를 담당한다. |
| `harness/policies/github-setup.md` | 새 `type:*` 라벨과 Jira repository secrets/테스트 프로젝트 준비 항목을 문서화한다. |

## Task 1: Form 유형 계약과 운영 설정을 명시한다

**파일:**

- 수정: `.github/ISSUE_TEMPLATE/bug.yml`
- 수정: `.github/ISSUE_TEMPLATE/feature.yml`
- 수정: `.github/ISSUE_TEMPLATE/technical-task.yml`
- 수정: `harness/policies/github-setup.md`

**생산 계약:**

- `type:bug`는 Jira `Bug`, `type:technical`은 Jira `Task`를 뜻한다.
- `type:feature` Issue는 본문 `### Jira 이슈 유형` 아래의 `Epic` 또는 `Story`만 Jira 유형으로 허용한다.

- [ ] **Step 1: Form별 Jira 유형 메타데이터 테스트를 먼저 작성한다**

`scripts/jira_issue_payload.test.mjs`에 다음과 같은 입력/출력 테스트를 추가한다.

```js
test('type:bug 라벨은 Jira Bug로 매핑한다', () => {
  assert.equal(resolveJiraIssueType(issueWithLabels(['type:bug'])), 'Bug');
});

test('Feature Form의 Story 선택은 Jira Story로 매핑한다', () => {
  const issue = issueWithLabels(['type:feature'], '### Jira 이슈 유형\n\nStory');
  assert.equal(resolveJiraIssueType(issue), 'Story');
});
```

테스트가 잡아낼 결함: 잘못된 라벨 또는 Feature 선택값이 Jira 유형을 잘못 생성하는 경우.

- [ ] **Step 2: 테스트가 아직 모듈이 없어 실패하는지 확인한다**

Run: `node --test scripts/jira_issue_payload.test.mjs`

Expected: `ERR_MODULE_NOT_FOUND` 또는 `resolveJiraIssueType is not a function`.

- [ ] **Step 3: 세 Form의 구분 정보를 추가한다**

각 Form의 `labels`에 기존 `status:planning`을 유지하면서 다음 라벨을 추가한다.

```yaml
# bug.yml
labels:
  - status:planning
  - type:bug

# technical-task.yml
labels:
  - status:planning
  - type:technical
```

`feature.yml`에는 `type:feature`를 추가하고, `risky-operations` 앞에 필수 단일 선택 드롭다운을 둔다.

```yaml
- type: dropdown
  id: jira_issue_type
  attributes:
    label: Jira 이슈 유형
    description: Jira에서 생성할 작업 유형을 선택합니다.
    options:
      - Epic
      - Story
  validations:
    required: true
```

`harness/policies/github-setup.md`에는 세 `type:*` 라벨과 `JIRA_BASE_URL`, `JIRA_USER_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY`(repository variable, 기본 `CF`)의 사람 설정 책임 및 테스트 프로젝트 사용을 적는다.

- [ ] **Step 4: YAML 형식과 Form 메타데이터를 검증한다**

Run: `node --test scripts/jira_issue_payload.test.mjs`

Expected: 모듈 구현 전에는 유형 테스트만 실패하고, 기존 Form YAML은 `python harness/scripts/verify`의 YAML 검사에서 형식 오류가 없다.

## Task 2: Jira 요청을 만드는 순수 모듈을 TDD로 구현한다

**파일:**

- 생성: `scripts/jira_issue_payload.mjs`
- 수정: `scripts/jira_issue_payload.test.mjs`

**인터페이스:**

```js
export function resolveJiraIssueType(issue);
export function createJiraSyncPlan({ issue, comments, repository, projectKey });
export function writeJiraSyncPlan({ issuePath, commentsPath, repository, projectKey, outputPath });
```

`createJiraSyncPlan`은 `{ shouldCreate, reason?, marker, issueType?, payload? }`를 반환한다. `payload`는 Jira REST API v3의 `{ fields: { project, issuetype, summary, description } }` 형태다.

- [ ] **Step 1: Bug·Technical·Feature(Epic/Story) 매핑의 실패 테스트를 추가한다**

```js
test('Technical Issue는 Jira Task payload를 만든다', () => {
  const plan = createJiraSyncPlan({
    issue: issueWithLabels(['type:technical']),
    comments: [],
    repository: 'woowacourse-teams/2026-career-form',
    projectKey: 'CF',
  });
  assert.equal(plan.shouldCreate, true);
  assert.equal(plan.payload.fields.issuetype.name, 'Task');
});
```

테스트가 잡아낼 결함: `type:technical` 또는 Feature dropdown이 잘못된 Jira issue type으로 변환되는 경우.

- [ ] **Step 2: RED 결과를 확인한다**

Run: `node --test scripts/jira_issue_payload.test.mjs`

Expected: `createJiraSyncPlan is not a function`으로 실패한다.

- [ ] **Step 3: 최소 매핑과 ADF payload를 구현한다**

`resolveJiraIssueType`은 단 하나의 `type:*` 라벨만 받아 Bug/Task를 반환하고, Feature일 때는 `### Jira 이슈 유형` 섹션의 첫 비어 있지 않은 줄이 `Epic` 또는 `Story`인 경우에만 반환한다. 그 외에는 오류 메시지와 함께 생성하지 않는다.

`createJiraSyncPlan`은 다음 ADF 문서를 생성한다.

```js
{
  fields: {
    project: { key: 'CF' },
    issuetype: { name: 'Story' },
    summary: issue.title,
    description: {
      type: 'doc',
      version: 1,
      content: [
        { type: 'paragraph', content: [/* GitHub Issue 링크 */] },
        /* Issue Form 본문을 줄바꿈 보존 paragraph로 표현 */
      ],
    },
  },
}
```

링크 URL은 `issue.html_url`을 사용하고, 본문 텍스트는 ADF text/hardBreak 노드로 JSON escaping 없이 구성한다.

- [ ] **Step 4: GREEN 결과를 확인한다**

Run: `node --test scripts/jira_issue_payload.test.mjs`

Expected: 네 유형 매핑 테스트가 모두 통과한다.

- [ ] **Step 5: ADF 설명의 관찰 가능한 계약 테스트를 추가한다**

```js
test('Jira payload 설명은 GitHub Issue 링크와 Form 본문을 보존한다', () => {
  const plan = createJiraSyncPlan({ issue: exampleIssue, comments: [], repository: 'woowacourse-teams/2026-career-form', projectKey: 'CF' });
  assert.deepEqual(plan.payload.fields.description.content[0].content[1].marks, [
    { type: 'link', attrs: { href: 'https://github.com/woowacourse-teams/2026-career-form/issues/42' } },
  ]);
  assert.match(JSON.stringify(plan.payload.fields.description), /비식별 재현 조건/);
});
```

테스트가 잡아낼 결함: Jira 생성 설명에서 원본 URL 또는 계약 본문이 빠지는 경우.

- [ ] **Step 6: ADF 구현 후 전체 Node 테스트를 통과시킨다**

Run: `node --test scripts/jira_issue_payload.test.mjs`

Expected: `pass`만 출력되고 외부 Jira API 호출은 없다.

## Task 3: 중복 방지와 안전한 CLI 경계를 구현한다

**파일:**

- 수정: `scripts/jira_issue_payload.mjs`
- 수정: `scripts/jira_issue_payload.test.mjs`

**인터페이스:**

- marker는 `<!-- jira-sync:<repository>#<issue-number>:<jira-key> -->` 형식이다.
- CLI 입력은 `--issue`, `--comments`, `--repository`, `--project-key`, `--output` 파일 경로/값만 받고 JSON 결과를 `--output`에 쓴다.

- [ ] **Step 1: 기존 marker의 생성 생략 테스트를 작성한다**

```js
test('기존 Jira sync marker가 있는 Issue는 생성하지 않는다', () => {
  const plan = createJiraSyncPlan({
    issue: exampleIssue,
    comments: [{ body: '<!-- jira-sync:woowacourse-teams/2026-career-form#42:CF-99 -->' }],
    repository: 'woowacourse-teams/2026-career-form',
    projectKey: 'CF',
  });
  assert.deepEqual(plan, {
    shouldCreate: false,
    reason: 'already-synchronized',
    marker: '<!-- jira-sync:woowacourse-teams/2026-career-form#42:',
  });
});
```

테스트가 잡아낼 결함: workflow 재실행이 두 번째 Jira 이슈를 만드는 경우.

- [ ] **Step 2: RED 결과를 확인한다**

Run: `node --test scripts/jira_issue_payload.test.mjs`

Expected: marker가 있어도 `shouldCreate: true`이거나 marker가 없어 실패한다.

- [ ] **Step 3: marker 검사·잘못된 유형 거부·CLI 파일 I/O를 구현한다**

`comments`의 `body`에서 정확한 repository/Issue 번호 marker prefix를 찾으면 `shouldCreate: false`를 반환한다. 지원하지 않는 type label, 두 개 이상의 type label, Feature 본문의 누락/알 수 없는 선택값에는 `shouldCreate: false`와 사람이 읽을 수 있는 `reason`을 반환한다. CLI는 Issue와 댓글 JSON을 읽어 plan 파일만 생성하며 네트워크, 시크릿, Jira 호출을 하지 않는다.

- [ ] **Step 4: CLI의 실제 파일 I/O 테스트와 GREEN 결과를 확인한다**

```js
test('CLI는 dry-run용 Jira plan JSON만 출력한다', () => {
  // 임시 issue/comments JSON을 만들고 node scripts/jira_issue_payload.mjs를 실행한다.
  // 출력 JSON의 shouldCreate와 fields.issuetype.name을 직접 검증한다.
});
```

Run: `node --test scripts/jira_issue_payload.test.mjs`

Expected: marker, 지원하지 않는 유형, CLI 입력을 포함한 모든 테스트가 통과한다.

## Task 4: GitHub Actions에서 테스트·dry-run·Jira 생성을 연결한다

**파일:**

- 수정: `.github/workflows/create-jira-issue.yml`

**인터페이스:**

- `issues.opened` 이벤트는 실제 Jira 생성 모드다.
- `workflow_dispatch`는 `issue_number`(필수)와 `dry_run`(기본 `true`) 입력을 받는다.
- `pull_request`는 `scripts/**`, 세 Issue Form, 이 workflow가 바뀔 때만 테스트 job을 실행하며 Jira 시크릿을 참조하지 않는다.

- [ ] **Step 1: workflow 없이 순수 모듈 테스트가 실행됨을 확인한다**

Run: `node --test scripts/jira_issue_payload.test.mjs`

Expected: Jira API·GitHub Issue 댓글 API 호출 없이 모든 테스트가 통과한다.

- [ ] **Step 2: 기존 Gajira 기반 workflow를 제거하고 최소 job 뼈대를 추가한다**

다음 트리거와 최소 권한을 사용한다.

```yaml
on:
  issues:
    types: [opened]
  pull_request:
    paths:
      - '.github/ISSUE_TEMPLATE/bug.yml'
      - '.github/ISSUE_TEMPLATE/feature.yml'
      - '.github/ISSUE_TEMPLATE/technical-task.yml'
      - '.github/workflows/create-jira-issue.yml'
      - 'scripts/jira_issue_payload.mjs'
      - 'scripts/jira_issue_payload.test.mjs'
  workflow_dispatch:
    inputs:
      issue_number:
        required: true
        type: string
      dry_run:
        required: true
        default: true
        type: boolean

permissions:
  contents: read
  issues: write
```

PR job은 `node --test`와 `go install github.com/rhysd/actionlint/cmd/actionlint@v1.7.12 && actionlint`를 실행한다. Action source checkout은 저장소의 기존 고정 SHA `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`를 사용한다.

- [ ] **Step 3: 실제 동작이 아닌 plan 생성 dry-run을 연결한다**

sync job은 `gh api`로 지정 Issue와 전체 댓글을 `$RUNNER_TEMP` JSON 파일로 받고, Node CLI로 `$RUNNER_TEMP/jira-plan.json`을 만든다. `dry_run`이면 `jq`로 유형·생성 여부만 출력하고 Jira API와 `gh issue comment`를 호출하지 않는다. input `issue_number`는 `^[1-9][0-9]*$` 정규식이 아니면 즉시 실패한다.

- [ ] **Step 4: Jira 생성과 GitHub 링크 댓글을 최소 변경으로 추가한다**

`shouldCreate`가 `true`이고 dry-run이 아닐 때만 payload에서 Jira REST API v3 `POST /rest/api/3/issue`를 호출한다. Basic authentication은 `JIRA_USER_EMAIL`과 `JIRA_API_TOKEN` secrets를 `curl --user`에만 전달하고 로그에 출력하지 않는다. `curl --fail-with-body`의 응답에서 key를 읽은 뒤, 아래 댓글을 한 번 만든다.

```markdown
<!-- jira-sync:woowacourse-teams/2026-career-form#42:CF-99 -->
Jira Issue Created: [CF-99](https://example.atlassian.net/browse/CF-99)
```

`concurrency` group은 Issue 번호로 직렬화해 동시 실행 중복을 막는다. Jira API 실패 시 제목·댓글을 바꾸지 않고 job을 실패시킨다. Jira 키를 얻은 뒤에는 GitHub Issue 제목을 `[JIRA-키] 기존 제목`으로 PATCH하고, 제목에 Jira 키가 있으면 댓글이 누락된 재실행에서도 새 Jira 이슈를 만들지 않는다.

- [ ] **Step 5: workflow 정적 검증과 dry-run을 실행한다**

Run: `node --test scripts/jira_issue_payload.test.mjs`

Expected: 로컬 테스트가 전부 통과한다. PR에서는 `actionlint`와 같은 테스트가 시크릿 없이 실행된다. 기본 브랜치 반영 후에는 사람이 비식별 Issue 번호로 `workflow_dispatch`의 `dry_run=true`를 실행해 생성 예정 유형과 payload를 확인한다.

## Task 5: 전체 검증, 리뷰, 문서 근거를 준비한다

**파일:**

- 수정: `docs/plans/5-jira-issue-autocreate.md`
- 수정: `.github/pull_request_template.md`를 복사해 PR 본문 작성 (저장소 파일은 수정하지 않음)

- [ ] **Step 1: 변경 범위와 marker/시크릿 노출을 점검한다**

Run: `git diff --check` 및 `rg -n -i 'JIRA_API_TOKEN|JIRA_USER_EMAIL|JIRA_BASE_URL' --glob '!docs/plans/**' .`

Expected: secret 값·실제 지원서 정보는 없고, secret 이름은 workflow/policy 설명에만 존재한다.

- [ ] **Step 2: 관련 자동 검증을 실행한다**

Run: `node --test scripts/jira_issue_payload.test.mjs` 및 `python harness/scripts/verify`

Expected: Node tests 통과. Windows에서 하네스의 기존 POSIX 실행 테스트가 실패하면 실패 목록과 Linux CI에서 확인할 명령을 PR에 기록한다.

- [ ] **Step 3: Issue 인수 조건별 근거를 PR에 작성한다**

Bug/Technical/Feature(Epic)/Feature(Story)는 unit test 이름과 workflow dry-run으로 연결하고, 실제 Jira 생성과 시크릿 비노출은 사람의 테스트 프로젝트 수동 검증으로 남긴다.

- [ ] **Step 4: self-review와 독립 코드 리뷰를 수행한다**

변경 diff에서 shell injection, 문자열 JSON 조립, 시크릿 출력, marker 중복, 지원하지 않는 Form의 우발적 생성, Gajira 잔존을 검토한다. 높은 위험 문제가 나오면 수정 후 Node tests와 `harness/scripts/verify`를 다시 실행한다.

- [ ] **Step 5: 논리적 커밋과 Draft PR을 만든다**

```text
test: Jira 이슈 생성 요청 로직을 검증한다
ci: GitHub Issue와 Jira 이슈 생성을 연동한다
docs: Jira 연동 설정 절차를 안내한다
```

PR 제목은 `ci: GitHub Issue와 Jira 이슈 생성을 연동한다`, base는 `develop`, 본문에는 `Closes #5`와 `harness-change` 라벨을 포함한다. Draft PR만 만들고 사람 승인·머지는 수행하지 않는다.
