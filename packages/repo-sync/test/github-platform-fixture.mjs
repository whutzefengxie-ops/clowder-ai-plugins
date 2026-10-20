import { createServer } from 'node:http';

const web = 'https://internal.example/team/core';
const issueUrl = `${web}/issues/7`;
const pullUrl = `${web}/pull/2`;
export async function githubPlatform(options = {}) {
  const state = {
    issues: [],
    pull: null,
    writes: 0,
    mismatch: false,
    denied: false,
    duplicate: false,
    requests: [],
    nextIssue: 7,
  };
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-GitHub-Api-Version', '2022-11-28');
    if (state.denied) {
      res.statusCode = state.deniedStatus ?? 403;
      for (const [name, value] of Object.entries(state.deniedHeaders ?? {})) res.setHeader(name, value);
      return res.end(JSON.stringify(state.deniedBody ?? { message: 'PRIVATE_DO_NOT_RECORD' }));
    }
    let input = '';
    for await (const chunk of req) input += chunk;
    const payload = input ? JSON.parse(input) : {};
    const url = new URL(req.url, 'http://localhost');
    let path = url.pathname.replace(/^\/api\/v3\/repos\/team\/core/, '');
    state.requests.push({ path, method: req.method, search: url.searchParams });
    if (req.method !== 'GET') state.writes++;
    if (path === '') return res.end(JSON.stringify(project()));
    if (path === '/issues') {
      if (req.method === 'POST') {
        const issue = {
          number: state.nextIssue++,
          html_url: `${web}/issues/${state.nextIssue - 1}`,
          state: 'open',
          body: payload.body,
          title: payload.title,
          ...(options.pullRequestsInList ? { pull_request: { url: 'x' } } : {}),
        };
        state.issues.push(issue);
        return res.end(JSON.stringify(issue));
      }
      const list = options.pullRequestsInList ? [...state.issues, state.pull].filter(Boolean) : state.issues;
      return res.end(JSON.stringify(state.duplicate ? [...list, ...list] : list));
    }
    const issueMatch = /^\/issues\/(\d+)$/.exec(path);
    if (issueMatch) {
      const issue = state.issues.find((item) => item.number === Number(issueMatch[1]));
      if (!issue) {
        res.statusCode = 404;
        return res.end(JSON.stringify({ message: 'Not Found' }));
      }
      if (req.method === 'PATCH') issue.state = payload.state;
      if (options.issueBody !== undefined) issue.body = options.issueBody;
      if (options.issueNumber !== undefined) issue.number = options.issueNumber;
      return res.end(JSON.stringify(issue));
    }
    if (path === '/pulls') {
      if (req.method === 'POST') {
        state.pull = {
          number: 2,
          html_url: pullUrl,
          state: 'open',
          merged: false,
          body: payload.body,
          head: { ref: payload.head, sha: 'head' },
          base: { ref: payload.base, sha: 'base' },
        };
        return res.end(JSON.stringify(state.pull));
      }
      const matches =
        state.pull && state.pull.body.includes('[repo-sync-pr:') && !(options.hidePullFromList === true)
          ? [state.pull]
          : [];
      return res.end(JSON.stringify(matches));
    }
    const pullMatch = /^\/pulls\/(\d+)$/.exec(path);
    if (pullMatch) {
      if (!state.pull) {
        res.statusCode = 404;
        return res.end(JSON.stringify({ message: 'Not Found' }));
      }
      if (req.method === 'PATCH') state.pull.body = payload.body;
      if (state.mismatch) state.pull.head.sha = 'wrong';
      return res.end(JSON.stringify(state.pull));
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ message: 'Not Found' }));
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  process.env.REPO_SYNC_GH_TEST_TOKEN = 'synthetic-github-token';
  const port = server.address().port;
  const config = {
    allowLocal: true,
    internalWebUrl: web,
    issues: {
      mode: 'github',
      apiUrl: `http://127.0.0.1:${port}/api/v3`,
      projectId: 'team/core',
      tokenEnv: 'REPO_SYNC_GH_TEST_TOKEN',
    },
    pullRequests: {
      mode: 'github',
      apiUrl: `http://127.0.0.1:${port}/api/v3`,
      projectId: 'team/core',
      tokenEnv: 'REPO_SYNC_GH_TEST_TOKEN',
    },
  };
  const request = {
    sourceId: 'source',
    key: 'key',
    repository: web,
    issue: { title: 'source title', body: 'source body', url: 'https://github.com/demo/core/issues/1' },
  };
  return {
    config,
    request,
    web,
    issueUrl,
    pullUrl,
    writes: () => state.writes,
    requests: state.requests,
    pullBody: () => state.pull?.body,
    lastIssueBody: () => state.issues[0]?.body,
    setIssueBody: (value) => {
      state.issues[0].body = value;
    },
    mismatch: () => {
      state.mismatch = true;
    },
    denied: (status = 403, headers = {}, body) => {
      state.deniedStatus = status;
      state.deniedHeaders = headers;
      state.deniedBody = body;
      state.denied = true;
    },
    duplicate: () => {
      state.duplicate = true;
    },
    close: async () => {
      await new Promise((done) => server.close(done));
    },
  };
}
function project() {
  return {
    id: 42,
    full_name: 'team/core',
    html_url: web,
    default_branch: 'main',
  };
}
