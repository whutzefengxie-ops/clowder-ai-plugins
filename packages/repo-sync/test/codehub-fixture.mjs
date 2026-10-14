import { createServer } from 'node:http';
import { git } from '../src/process.mjs';
export async function codehubPlatform(f) {
  const state = { issues: [], mrs: [], creates: { issues: 0, prs: 0 }, denied: false },
    web = 'https://codehub.example/innersource/team_G/core',
    token = 'SYNTHETIC_BROWSER_TOKEN';
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Next-Page', '');
    if (req.headers['private-token'] !== token || state.denied) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ message: 'unauthorized' }));
    }
    let text = '';
    for await (const data of req) text += data;
    const path = new URL(req.url, 'http://localhost').pathname,
      value = text ? JSON.parse(text) : null;
    res.end(JSON.stringify(await route(state, f, web, req, value, path)));
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  return {
    web,
    token,
    state,
    api: `http://127.0.0.1:${server.address().port}/api/v4`,
    close: () => new Promise((done) => server.close(done)),
  };
}
async function route(state, f, web, req, value, path) {
  if (path.endsWith('/related_merge_requests')) {
    const id = path.match(/\/issues\/(\d+)/)[1];
    return state.mrs.filter((mr) => mr.description.includes(`Related to #${id}`));
  }
  const mrMatch = /\/merge_requests\/(\d+)$/.exec(path),
    issueMatch = /\/issues\/(\d+)$/.exec(path);
  if (mrMatch) {
    const mr = state.mrs.find((item) => String(item.iid) === mrMatch[1]);
    if (req.method === 'PUT') mr.description = value.description;
    return mr;
  }
  if (issueMatch) {
    const issue = state.issues.find((item) => String(item.iid) === issueMatch[1]);
    if (req.method === 'PUT') issue.state = value.state_event === 'close' ? 'closed' : 'opened';
    return issue;
  }
  if (path.endsWith('/merge_requests')) return mergeCollection(state, f, web, req, value);
  if (path.endsWith('/issues')) return issueCollection(state, web, req, value);
  return {
    id: 5,
    web_url: web,
    path_with_namespace: 'innersource/team_G/core',
    default_branch: 'main',
    issues_enabled: true,
    merge_requests_enabled: true,
  };
}
async function mergeCollection(state, f, web, req, value) {
  if (req.method === 'POST') {
    const iid = ++state.creates.prs,
      mr = {
        iid,
        web_url: `${web}/merge_requests/${iid}`,
        description: value.description,
        source_branch: value.source_branch,
        target_branch: value.target_branch,
        state: 'opened',
        sha: (await git(f.internal, ['rev-parse', `refs/heads/${value.source_branch}`])).trim(),
        diff_refs: { base_sha: (await git(f.internal, ['rev-parse', 'refs/heads/main'])).trim() },
      };
    state.mrs.push(mr);
    return mr;
  }
  const branch = new URL(req.url, 'http://localhost').searchParams.get('source_branch');
  return state.mrs.filter((mr) => !branch || mr.source_branch === branch);
}
function issueCollection(state, web, req, value) {
  if (req.method === 'POST') {
    const iid = ++state.creates.issues,
      issue = { iid, web_url: `${web}/issues/${iid}`, description: value.description, state: 'opened' };
    state.issues.push(issue);
    return issue;
  }
  const search = new URL(req.url, 'http://localhost').searchParams.get('search');
  return state.issues.filter((issue) => !search || issue.description.includes(search));
}
