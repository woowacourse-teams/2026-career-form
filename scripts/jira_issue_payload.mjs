import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function createPrefixedGitHubIssueTitle(jiraKey, title) {
  const prefix = `[${jiraKey}] `;

  return title.startsWith(prefix) ? title : `${prefix}${title}`;
}

export function resolveJiraIssueType(issue) {
  if (!Array.isArray(issue?.labels)) {
    return undefined;
  }

  const labelNames = issue.labels.map((label) => label.name);
  const jiraTypeLabels = labelNames.filter((labelName) =>
    ['type:bug', 'type:feature', 'type:technical'].includes(labelName),
  );

  if (jiraTypeLabels.length !== 1) {
    return undefined;
  }

  if (jiraTypeLabels[0] === 'type:bug') {
    return '버그';
  }

  if (jiraTypeLabels[0] === 'type:technical') {
    return '작업';
  }

  if (jiraTypeLabels[0] === 'type:feature') {
    const matched = issue.body?.match(/^### Jira 이슈 유형\s*\r?\n\s*\r?\n([^\r\n]+)/m);
    const selectedType = matched?.[1].trim();

    if (selectedType === 'Epic') {
      return '에픽';
    }

    if (selectedType === 'Story') {
      return '스토리';
    }
  }

  return undefined;
}

export function createJiraSyncPlan({ issue, comments, projectKey, repository }) {
  const marker = `<!-- jira-sync:${repository}#${issue?.number}:`;

  if (!isValidGitHubIssue(issue)) {
    return {
      marker,
      reason: 'invalid-github-issue',
      shouldCreate: false,
    };
  }

  if (!Array.isArray(comments)) {
    return {
      marker,
      reason: 'invalid-github-comments',
      shouldCreate: false,
    };
  }

  if (
    hasJiraIssueKeyPrefix(issue.title) ||
    comments.some((comment) => isExistingJiraLink(comment, marker))
  ) {
    return {
      marker,
      reason: 'already-synchronized',
      shouldCreate: false,
    };
  }

  const issueType = resolveJiraIssueType(issue);

  if (!issueType) {
    return {
      marker,
      reason: 'unsupported-issue-type',
      shouldCreate: false,
    };
  }

  return {
    marker,
    payload: {
      fields: {
        description: createDescription(issue),
        issuetype: { name: issueType },
        project: { key: projectKey },
        summary: issue.title,
      },
    },
    shouldCreate: true,
  };
}

function isValidGitHubIssue(issue) {
  return (
    Number.isInteger(issue?.number) &&
    issue.number > 0 &&
    typeof issue.title === 'string' &&
    typeof issue.body === 'string' &&
    typeof issue.html_url === 'string' &&
    Array.isArray(issue.labels) &&
    issue.labels.every((label) => typeof label?.name === 'string')
  );
}

function isExistingJiraLink(comment, marker) {
  if (typeof comment?.body !== 'string') {
    return false;
  }

  return (
    comment.body.includes(marker) ||
    /Jira Issue Created:\s*\[[A-Z][A-Z0-9_]*-\d+\]\([^\s)]+\/browse\/[A-Z][A-Z0-9_]*-\d+\)/i.test(
      comment.body,
    )
  );
}

function hasJiraIssueKeyPrefix(title) {
  return /^\[[A-Z][A-Z0-9_]*-\d+\]\s/.test(title);
}

function createDescription(issue) {
  return {
    content: [
      {
        content: [
          { text: 'GitHub Issue: ', type: 'text' },
          {
            marks: [{ attrs: { href: issue.html_url }, type: 'link' }],
            text: issue.html_url,
            type: 'text',
          },
        ],
        type: 'paragraph',
      },
      {
        content: textWithHardBreaks(issue.body),
        type: 'paragraph',
      },
    ],
    type: 'doc',
    version: 1,
  };
}

function textWithHardBreaks(text) {
  return text.split(/\r?\n/).flatMap((line, index) => {
    const nodes = index === 0 ? [] : [{ type: 'hardBreak' }];

    if (line) {
      nodes.push({ text: line, type: 'text' });
    }

    return nodes;
  });
}

export function writeJiraSyncPlan({
  commentsPath,
  issuePath,
  outputPath,
  projectKey,
  repository,
}) {
  const comments = JSON.parse(readFileSync(commentsPath, 'utf8'));
  const issue = JSON.parse(readFileSync(issuePath, 'utf8'));
  const plan = createJiraSyncPlan({
    comments,
    issue,
    projectKey,
    repository,
  });

  writeFileSync(outputPath, JSON.stringify(plan));
}

function readArguments(args) {
  return args.reduce((options, argument, index) => {
    if (argument.startsWith('--')) {
      options[argument.slice(2)] = args[index + 1];
    }
    return options;
  }, {});
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const options = readArguments(process.argv.slice(2));
  writeJiraSyncPlan({
    commentsPath: options.comments,
    issuePath: options.issue,
    outputPath: options.output,
    projectKey: options['project-key'],
    repository: options.repository,
  });
}
