import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createPrefixedGitHubIssueTitle,
  createJiraSyncPlan,
  resolveJiraIssueType,
} from './jira_issue_payload.mjs';

test('type:bug 라벨은 Jira 버그로 매핑한다', () => {
  const issue = {
    labels: [{ name: 'status:planning' }, { name: 'type:bug' }],
  };

  assert.equal(resolveJiraIssueType(issue), '버그');
});

test('type:technical 라벨은 Jira 작업으로 매핑한다', () => {
  const issue = {
    labels: [{ name: 'status:planning' }, { name: 'type:technical' }],
  };

  assert.equal(resolveJiraIssueType(issue), '작업');
});

test('Feature Form의 Epic 선택은 Jira 에픽으로 매핑한다', () => {
  const issue = {
    body: '### Jira 이슈 유형\n\nEpic',
    labels: [{ name: 'status:planning' }, { name: 'type:feature' }],
  };

  assert.equal(resolveJiraIssueType(issue), '에픽');
});

test('Feature Form의 Story 선택은 Jira 스토리로 매핑한다', () => {
  const issue = {
    body: '### Jira 이슈 유형\n\nStory',
    labels: [{ name: 'status:planning' }, { name: 'type:feature' }],
  };

  assert.equal(resolveJiraIssueType(issue), '스토리');
});

test('Jira 키를 GitHub Issue 제목 맨 앞에 붙인다', () => {
  assert.equal(
    createPrefixedGitHubIssueTitle('CF-123', '[Feature] Jira 이슈 자동 생성'),
    '[CF-123] [Feature] Jira 이슈 자동 생성',
  );
});

test('같은 Jira 키가 이미 붙은 GitHub Issue 제목은 변경하지 않는다', () => {
  assert.equal(
    createPrefixedGitHubIssueTitle('CF-123', '[CF-123] [Feature] Jira 이슈 자동 생성'),
    '[CF-123] [Feature] Jira 이슈 자동 생성',
  );
});

test('Jira payload 설명은 GitHub Issue 링크와 Form 본문을 보존한다', () => {
  const issue = {
    body: '### 배경\n\n비식별 재현 조건',
    html_url: 'https://github.com/woowacourse-teams/2026-career-form/issues/42',
    labels: [{ name: 'status:planning' }, { name: 'type:bug' }],
    number: 42,
    title: '[Bug] Jira 이슈 생성 실패',
  };

  const plan = createJiraSyncPlan({
    comments: [],
    issue,
    projectKey: 'CF',
    repository: 'woowacourse-teams/2026-career-form',
  });

  assert.equal(plan.shouldCreate, true);
  assert.equal(plan.payload.fields.project.key, 'CF');
  assert.equal(plan.payload.fields.issuetype.name, '버그');
  assert.equal(plan.payload.fields.summary, '[Bug] Jira 이슈 생성 실패');
  assert.deepEqual(plan.payload.fields.description.content[0].content[1].marks, [
    {
      attrs: { href: 'https://github.com/woowacourse-teams/2026-career-form/issues/42' },
      type: 'link',
    },
  ]);
  assert.match(JSON.stringify(plan.payload.fields.description), /비식별 재현 조건/);
});

test('type:technical Issue 생성 payload는 Jira 작업 유형을 사용한다', () => {
  const plan = createJiraSyncPlan({
    comments: [],
    issue: {
      body: '### 배경\n\n비식별 재현 조건',
      html_url: 'https://github.com/woowacourse-teams/2026-career-form/issues/46',
      labels: [{ name: 'type:technical' }],
      number: 46,
      title: '[Technical] Jira 이슈 생성 실패',
    },
    projectKey: 'CF',
    repository: 'woowacourse-teams/2026-career-form',
  });

  assert.equal(plan.shouldCreate, true);
  assert.equal(plan.payload.fields.issuetype.name, '작업');
});

test('Feature Epic Issue 생성 payload는 Jira 에픽 유형을 사용한다', () => {
  const plan = createJiraSyncPlan({
    comments: [],
    issue: {
      body: '### Jira 이슈 유형\n\nEpic',
      html_url: 'https://github.com/woowacourse-teams/2026-career-form/issues/47',
      labels: [{ name: 'type:feature' }],
      number: 47,
      title: '[Feature] Jira 에픽 생성',
    },
    projectKey: 'CF',
    repository: 'woowacourse-teams/2026-career-form',
  });

  assert.equal(plan.shouldCreate, true);
  assert.equal(plan.payload.fields.issuetype.name, '에픽');
});

test('Feature Story Issue 생성 payload는 Jira 스토리 유형을 사용한다', () => {
  const plan = createJiraSyncPlan({
    comments: [],
    issue: {
      body: '### Jira 이슈 유형\n\nStory',
      html_url: 'https://github.com/woowacourse-teams/2026-career-form/issues/48',
      labels: [{ name: 'type:feature' }],
      number: 48,
      title: '[Feature] Jira 스토리 생성',
    },
    projectKey: 'CF',
    repository: 'woowacourse-teams/2026-career-form',
  });

  assert.equal(plan.shouldCreate, true);
  assert.equal(plan.payload.fields.issuetype.name, '스토리');
});

test('기존 Jira sync marker가 있으면 Jira 이슈를 새로 만들지 않는다', () => {
  const issue = {
    body: '### 배경\n\n비식별 재현 조건',
    html_url: 'https://github.com/woowacourse-teams/2026-career-form/issues/42',
    labels: [{ name: 'status:planning' }, { name: 'type:bug' }],
    number: 42,
    title: '[Bug] Jira 이슈 생성 실패',
  };

  const plan = createJiraSyncPlan({
    comments: [
      {
        body: '<!-- jira-sync:woowacourse-teams/2026-career-form#42:CF-99 -->',
      },
    ],
    issue,
    projectKey: 'CF',
    repository: 'woowacourse-teams/2026-career-form',
  });

  assert.deepEqual(plan, {
    marker: '<!-- jira-sync:woowacourse-teams/2026-career-form#42:',
    reason: 'already-synchronized',
    shouldCreate: false,
  });
});

test('기존 형식의 Jira 링크 댓글이 있으면 Jira 이슈를 새로 만들지 않는다', () => {
  const plan = createJiraSyncPlan({
    comments: [
      {
        body: 'Jira Issue Created: [CF-42](https://example.atlassian.net/browse/CF-42)',
      },
    ],
    issue: {
      body: '### 배경\n\n비식별 재현 조건',
      html_url: 'https://github.com/woowacourse-teams/2026-career-form/issues/42',
      labels: [{ name: 'type:bug' }],
      number: 42,
      title: '[Bug] Jira 이슈 생성 실패',
    },
    projectKey: 'CF',
    repository: 'org/repository',
  });

  assert.equal(plan.shouldCreate, false);
  assert.equal(plan.reason, 'already-synchronized');
});

test('Jira 키가 붙은 GitHub Issue 제목은 Jira 이슈를 새로 만들지 않는다', () => {
  const plan = createJiraSyncPlan({
    comments: [],
    issue: {
      body: '### 배경\n\n비식별 재현 조건',
      html_url: 'https://github.com/woowacourse-teams/2026-career-form/issues/42',
      labels: [{ name: 'type:bug' }],
      number: 42,
      title: '[CF-123] [Bug] Jira 이슈 생성 실패',
    },
    projectKey: 'CF',
    repository: 'org/repository',
  });

  assert.equal(plan.shouldCreate, false);
  assert.equal(plan.reason, 'already-synchronized');
});

test('Jira 유형을 판별할 수 없는 Issue는 생성하지 않는다', () => {
  const plan = createJiraSyncPlan({
    comments: [],
    issue: {
      body: '### 배경\n\n비식별 재현 조건',
      html_url: 'https://github.com/woowacourse-teams/2026-career-form/issues/43',
      labels: [{ name: 'status:planning' }],
      number: 43,
      title: '분류되지 않은 Issue',
    },
    projectKey: 'CF',
    repository: 'woowacourse-teams/2026-career-form',
  });

  assert.deepEqual(plan, {
    marker: '<!-- jira-sync:woowacourse-teams/2026-career-form#43:',
    reason: 'unsupported-issue-type',
    shouldCreate: false,
  });
});

test('여러 Jira 유형 라벨이 있는 Issue는 생성하지 않는다', () => {
  const plan = createJiraSyncPlan({
    comments: [],
    issue: {
      body: '### 배경\n\n비식별 재현 조건',
      html_url: 'https://github.com/woowacourse-teams/2026-career-form/issues/44',
      labels: [{ name: 'type:bug' }, { name: 'type:technical' }],
      number: 44,
      title: '유형이 충돌하는 Issue',
    },
    projectKey: 'CF',
    repository: 'woowacourse-teams/2026-career-form',
  });

  assert.equal(plan.shouldCreate, false);
  assert.equal(plan.reason, 'unsupported-issue-type');
});

test('Feature Form의 허용되지 않은 Jira 유형은 생성하지 않는다', () => {
  const plan = createJiraSyncPlan({
    comments: [],
    issue: {
      body: '### Jira 이슈 유형\n\nTask',
      html_url: 'https://github.com/woowacourse-teams/2026-career-form/issues/45',
      labels: [{ name: 'type:feature' }],
      number: 45,
      title: '잘못된 Feature 유형',
    },
    projectKey: 'CF',
    repository: 'woowacourse-teams/2026-career-form',
  });

  assert.equal(plan.shouldCreate, false);
  assert.equal(plan.reason, 'unsupported-issue-type');
});

test('유효하지 않은 GitHub Issue 응답은 Jira 생성 전에 중단한다', () => {
  const plan = createJiraSyncPlan({
    comments: [],
    issue: {
      body: null,
      html_url: 'https://github.com/woowacourse-teams/2026-career-form/issues/42',
      labels: [{ name: 'type:bug' }],
      number: 42,
      title: '[Bug] Jira 이슈 생성 실패',
    },
    projectKey: 'CF',
    repository: 'org/repository',
  });

  assert.equal(plan.shouldCreate, false);
  assert.equal(plan.reason, 'invalid-github-issue');
});

test('CLI는 dry-run용 Jira plan JSON만 출력한다', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'jira-issue-payload-'));
  const issuePath = path.join(directory, 'issue.json');
  const commentsPath = path.join(directory, 'comments.json');
  const outputPath = path.join(directory, 'plan.json');

  try {
    writeFileSync(
      issuePath,
      JSON.stringify({
        body: '### 배경\n\n비식별 재현 조건',
        html_url: 'https://github.com/woowacourse-teams/2026-career-form/issues/42',
        labels: [{ name: 'type:bug' }],
        number: 42,
        title: '[Bug] Jira 이슈 생성 실패',
      }),
    );
    writeFileSync(commentsPath, '[]');

    execFileSync(process.execPath, [
      'scripts/jira_issue_payload.mjs',
      '--comments',
      commentsPath,
      '--issue',
      issuePath,
      '--output',
      outputPath,
      '--project-key',
      'CF',
      '--repository',
      'woowacourse-teams/2026-career-form',
    ]);

    const plan = JSON.parse(readFileSync(outputPath, 'utf8'));
    assert.equal(plan.shouldCreate, true);
    assert.equal(plan.payload.fields.issuetype.name, '버그');
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});
