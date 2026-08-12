# Jira Cloud 한국어 이슈 타입 매핑 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CF 프로젝트가 허용하는 한국어 Jira 이슈 타입 이름으로 GitHub Issue Form 유형을 생성한다.

**Architecture:** `resolveJiraIssueType`의 반환 문자열만 CF create metadata의 이름으로 바꾼다. Jira payload 생성은 이 반환값을 그대로 `fields.issuetype.name`에 사용하므로 워크플로 구조나 시크릿 처리는 바꾸지 않는다.

**Tech Stack:** Node.js 내장 테스트 러너, GitHub Actions, Jira Cloud REST API v3

## Global Constraints

- Jira API 토큰과 실제 지원서 정보는 코드·테스트·로그에 넣지 않는다.
- 실제 Jira 이슈 생성은 사람이 수행한다.
- 변경 범위는 CF 이슈 타입 문자열과 그 회귀 테스트로 한정한다.

---

### Task 1: CF 이슈 타입 이름 회귀 방지

**Files:**
- Modify: `scripts/jira_issue_payload.test.mjs`
- Modify: `scripts/jira_issue_payload.mjs`

**Interfaces:**
- Consumes: `resolveJiraIssueType(issue)`의 `type:bug`, `type:technical`, Feature `Epic | Story` 입력
- Produces: Jira Cloud `fields.issuetype.name`에 사용할 `버그`, `작업`, `에픽`, `스토리`

- [ ] **Step 1: Write the failing test**

`resolveJiraIssueType`과 `createJiraSyncPlan`의 기대값을 실제 CF 이슈 타입 이름인 `버그`, `작업`, `에픽`, `스토리`로 바꾼다.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/jira_issue_payload.test.mjs`

Expected: 영문 `Bug`, `Task`, `Epic`, `Story`를 반환해 매핑 테스트와 Bug payload 테스트가 실패한다.

- [ ] **Step 3: Write minimal implementation**

`scripts/jira_issue_payload.mjs`에서 각 GitHub 유형의 반환 문자열을 아래 값으로만 변경한다.

```js
type:bug -> '버그'
type:technical -> '작업'
Epic -> '에픽'
Story -> '스토리'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test scripts/jira_issue_payload.test.mjs`

Expected: 모든 Jira payload 단위 테스트가 통과한다.

- [ ] **Step 5: Run repository verification**

Run: `harness/scripts/verify`

Expected: 표준 검증과 workflow 정적 검증이 통과한다.

- [ ] **Step 6: Commit**

```bash
git add docs/design/5-jira-localized-issue-types.md docs/plans/5-jira-localized-issue-types.md scripts/jira_issue_payload.mjs scripts/jira_issue_payload.test.mjs
git commit -m "fix: Jira 한국어 이슈 유형으로 생성한다"
```
