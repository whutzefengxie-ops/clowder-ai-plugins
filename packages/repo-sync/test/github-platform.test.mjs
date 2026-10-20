import assert from 'node:assert/strict';
import test from 'node:test';
import { validateConfig } from '../src/config.mjs';
import { githubPr } from '../src/github-platform-pr.mjs';
import { invokeIssue, validateIssueConfig, verifyIssue } from '../src/issue-adapter.mjs';
import { issueBody } from '../src/github-platform-issues.mjs';
import { definitiveIssueFailure } from '../src/issue-lifecycle.mjs';
import { issueConfiguration } from '../src/issue-settings.mjs';
import { readPlatformProject, verifyPlatformProject } from '../src/platform-project.mjs';
import { prConfiguration } from '../src/pr-settings.mjs';
import { githubPlatform } from './github-platform-fixture.mjs';

const base = {
  sourceUrl: 'https://github.com/zts212653/clowder-ai.git',
  internalUrl: 'https://github.com/acme/core.git',
  internalWebUrl: 'https://github.com/acme/core',
  sourceBranch: 'main',
  targetBranch: 'main',
  stateDir: 'C:/private/repo-sync-state',
};

test('automatic detection selects GitHub REST for github.com and GitLab v4 for other internal hosts', () => {
  const github = issueConfiguration(base, { issueMode: 'auto', issueAuthMode: 'session' });
  assert.equal(github.mode, 'github');
  assert.equal(github.apiUrl, 'https://api.github.com');
  assert.equal(github.projectId, 'acme/core');

  const gitlabConfig = { ...base, internalWebUrl: 'https://gitlab.example/team/core' };
  const gitlab = prConfiguration(gitlabConfig, 'auto', {});
  assert.equal(gitlab.mode, 'gitlab');
  assert.equal(gitlab.apiUrl, 'https://gitlab.example/api/v4');
  assert.equal(gitlab.projectId, 'team/core');
});

test('an explicit API version overrides host detection, and mismatched API roots are rejected', () => {
  const enterprise = issueConfiguration(
    { ...base, internalWebUrl: 'https://ghe.example/team/core' },
    { issueMode: 'auto', issueApiUrl: 'https://ghe.example/api/v3', issueAuthMode: 'session' },
  );
  assert.equal(enterprise.mode, 'github');
  assert.equal(enterprise.apiUrl, 'https://ghe.example/api/v3');

  assert.throws(
    () =>
      validateIssueConfig({
        internalWebUrl: 'https://github.com/acme/core',
        issues: {
          mode: 'github',
          apiUrl: 'https://github.com/api/v4',
          projectId: 'acme/core',
          tokenEnv: 'TOKEN',
        },
      }),
    { code: 'INVALID_ISSUE_CONFIG' },
  );
  assert.throws(
    () =>
      validateIssueConfig({
        internalWebUrl: 'https://github.com/acme/core',
        issues: { mode: 'gitlab', apiUrl: 'https://api.github.com', projectId: 'acme/core', tokenEnv: 'TOKEN' },
      }),
    { code: 'INVALID_ISSUE_CONFIG' },
  );
});

test('automatic detection ignores stale API overrides from the previous platform', () => {
  const stale = { ...base, issues: { mode: 'gitlab', apiUrl: 'https://github.com/api/v4', projectId: 'acme/core', tokenEnv: 'TOKEN' } };
  const detected = issueConfiguration(stale, {
    issueMode: 'auto',
    issueApiUrl: 'https://github.com/api/v4',
    issueProjectId: 'acme/core',
    issueAuthMode: 'session',
  });
  assert.equal(detected.mode, 'github');
  assert.equal(detected.apiUrl, 'https://api.github.com');
});

test('a saved GitLab selection over a github.com repository is presented as automatic detection', async () => {
  const { suggestedMode } = await import('../web/platform-kind.mjs');
  assert.equal(suggestedMode({ internalWebUrl: 'https://github.com/acme/core' }, 'gitlab'), 'auto');
  assert.equal(suggestedMode({ internalWebUrl: 'https://gitlab.example/team/core' }, 'gitlab'), 'gitlab');
  assert.equal(suggestedMode({ internalWebUrl: 'https://github.com/acme/core' }, 'github'), 'github');
});

test('Issue and PR adapters must resolve to the same platform project', () => {
  assert.throws(
    () =>
      validateConfig({
        ...base,
        issues: { mode: 'github', apiUrl: 'https://api.github.com', projectId: 'acme/core', tokenEnv: 'TOKEN' },
        pullRequests: {
          mode: 'gitlab',
          apiUrl: 'https://gitlab.example/api/v4',
          projectId: 'team/core',
          tokenEnv: 'TOKEN',
        },
        checks: [],
      }),
    { code: 'PLATFORM_API_SCOPE_CONFLICT' },
  );
  const valid = validateConfig({
    ...base,
    issues: { mode: 'github', apiUrl: 'https://api.github.com', projectId: 'acme/core', tokenEnv: 'TOKEN' },
    pullRequests: { mode: 'github', apiUrl: 'https://api.github.com', projectId: 'acme/core', tokenEnv: 'TOKEN' },
    checks: [],
  });
  assert.equal(valid.pullRequests.mode, 'github');
});

test('built-in GitHub Issue adapter finds, creates, links and closes only the mapped Issue', async () => {
  const p = await githubPlatform();
  try {
    validateIssueConfig(p.config);
    assert.equal(await invokeIssue(p.config, { ...p.request, operation: 'find' }), null);
    let issue = await invokeIssue(p.config, { ...p.request, operation: 'create' });
    assert.equal(issue.internalId, '7');
    verifyIssue(p.config, p.request, issue);
    assert.equal(await invokeIssue(p.config, { ...p.request, operation: 'find' }).then((r) => r.internalId), '7');

    await githubPr(p.config, 'create', {
      deliveryId: 'd1',
      branch: 'sync/key',
      targetBranch: 'main',
      title: 'title',
      body: 'body',
    });
    const linked = await invokeIssue(p.config, {
      ...p.request,
      internalId: '7',
      operation: 'link',
      pr: { url: p.pullUrl, head: 'head', branch: 'sync/key', targetBranch: 'main' },
    });
    assert.equal(linked.links.length, 1);
    const writes = p.writes();
    await invokeIssue(p.config, {
      ...p.request,
      internalId: '7',
      operation: 'link',
      pr: { url: p.pullUrl, head: 'head', branch: 'sync/key', targetBranch: 'main' },
    });
    assert.equal(p.writes(), writes);

    issue = await invokeIssue(p.config, { ...p.request, internalId: '7', operation: 'update', desiredState: 'closed' });
    assert.equal(issue.state, 'closed');
  } finally {
    await p.close();
  }
});

test('GitHub Issue lookup keeps duplicates and platform errors closed', async () => {
  const p = await githubPlatform();
  try {
    await invokeIssue(p.config, { ...p.request, operation: 'create' });
    p.duplicate();
    await assert.rejects(() => invokeIssue(p.config, { ...p.request, operation: 'find' }), { code: 'ISSUE_DUPLICATED' });
    p.denied(404);
    await assert.rejects(
      () => invokeIssue(p.config, { ...p.request, operation: 'find' }),
      (error) => error.code === 'ISSUE_API_REJECTED' && error.message.includes('404') && !error.message.includes('PRIVATE'),
    );
  } finally {
    await p.close();
  }
});

test('project identity check matches the GitHub repository and rejects another repo', async () => {
  const p = await githubPlatform();
  try {
    const project = await readPlatformProject(p.config, p.config.issues);
    assert.equal(verifyPlatformProject(p.config.issues, p.config, project), true);
    assert.equal(
      verifyPlatformProject(
        p.config.issues,
        { ...p.config, internalWebUrl: 'https://internal.example/team/other' },
        project,
      ),
      false,
    );
  } finally {
    await p.close();
  }
});

for (const [name, headers, expected] of [
  ['fine-grained permissions', { 'x-accepted-github-permissions': 'issues=write; pull_requests=write' }, 'issues=write'],
  ['classic scope gaps', { 'x-oauth-scopes': 'read:org' }, '没有 repo'],
  ['SAML SSO', { 'x-github-sso': 'required; url=https://github.com/orgs/team/sso' }, 'SAML SSO'],
])
  test(`GitHub 403 diagnostics explain ${name} without exposing raw output`, async () => {
    const p = await githubPlatform();
    try {
      p.denied(403, headers);
      await assert.rejects(
        () => invokeIssue(p.config, { ...p.request, operation: 'find' }),
        (error) =>
          error.code === 'ISSUE_API_REJECTED' &&
          error.message.includes(expected) &&
          !error.message.includes('PRIVATE'),
      );
    } finally {
      await p.close();
    }
  });

test('an oversized source Issue is truncated to the GitHub body limit with provenance preserved', async () => {
  const p = await githubPlatform();
  try {
    const body = 'x'.repeat(86_059);
    const issue = await invokeIssue(p.config, {
      ...p.request,
      issue: { ...p.request.issue, body },
      operation: 'create',
    });
    assert.equal(issue.internalId, '7');
    const sent = p.lastIssueBody();
    assert.ok(sent.length <= 65_536, `body length ${sent.length}`);
    assert.match(sent, /\[repo-sync-issue:key\]/);
    assert.match(sent, /issues\/1/);
    assert.match(sent, /已截断/);
    assert.match(sent, /^x{100}/);
  } finally {
    await p.close();
  }
});

test('GitHub 422 and other definitive 4xx rejections are not reported as unknown create results', async () => {
  const p = await githubPlatform();
  try {
    p.denied(422);
    await assert.rejects(
      () => invokeIssue(p.config, { ...p.request, operation: 'create' }),
      (error) =>
        error.code === 'ISSUE_API_REJECTED' &&
        error.httpStatus === 422 &&
        error.message.includes('65,536') &&
        !error.message.includes('PRIVATE'),
    );
  } finally {
    await p.close();
  }
  assert.equal(definitiveIssueFailure({ code: 'ISSUE_API_REJECTED', httpStatus: 422 }), true);
  assert.equal(definitiveIssueFailure({ code: 'ISSUE_AUTH_REQUIRED' }), true);
  assert.equal(definitiveIssueFailure({ code: 'ISSUE_API_REJECTED', httpStatus: 502 }), false);
  assert.equal(definitiveIssueFailure({ code: 'ISSUE_API_UNAVAILABLE' }), false);
});

test('GitHub PR creation is idempotent and readback carries the frozen identity', async () => {
  const p = await githubPlatform();
  try {
    const input = { deliveryId: 'd2', branch: 'sync/key', targetBranch: 'main' };
    assert.equal(await githubPr(p.config, 'find', input), null);
    await githubPr(p.config, 'create', { ...input, title: 'title', body: 'body' });
    const found = await githubPr(p.config, 'find', input);
    assert.deepEqual(found, {
      deliveryId: 'd2',
      branch: 'sync/key',
      targetBranch: 'main',
      head: 'head',
      base: 'base',
      state: 'open',
      url: p.pullUrl,
    });
    p.denied(403);
    await assert.rejects(() => githubPr(p.config, 'find', input), { code: 'PR_API_REJECTED' });
  } finally {
    await p.close();
  }
});
