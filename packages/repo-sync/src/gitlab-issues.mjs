import { fail } from './config.mjs';
import { gitlabApi } from './gitlab-api.mjs';

const marker = (r) => `[repo-sync-issue:${r.key}]`;
function receipt(r, item, links = []) {
  if (!item?.description?.includes(marker(r)))
    fail('ISSUE_IDENTITY_CONFLICT', '内部 Issue 缺少稳定来源标识；禁止采用或关闭其他对象');
  return {
    sourceId: r.sourceId,
    key: r.key,
    internalId: String(item.iid),
    url: item.web_url,
    state: item.state === 'opened' ? 'open' : item.state,
    links,
  };
}
function prId(config, pr) {
  const base = config.internalWebUrl.replace(/\/$/, '');
  if (!pr?.url?.startsWith(`${base}/-/merge_requests/`))
    fail('ISSUE_PR_INVALID', 'GitLab 关联需要此仓库的具体 MR 地址');
  const id = pr.url.slice(`${base}/-/merge_requests/`.length);
  if (!/^\d+$/.test(id)) fail('ISSUE_PR_INVALID', 'MR 编号无效');
  return id;
}
function checkPr(item, pr) {
  if (
    item.web_url !== pr.url ||
    item.sha !== pr.head ||
    item.source_branch !== pr.branch ||
    item.target_branch !== pr.targetBranch ||
    !['opened', 'merged'].includes(item.state)
  )
    fail('ISSUE_PR_CONFLICT', '内部 PR 的 head、源分支或目标分支与冻结交付不符，未关联 Issue');
}
export async function gitlabIssue(config, r) {
  const api = gitlabApi(config);
  if (r.operation === 'find') {
    const matches = (
      await api.list(`issues?scope=all&state=all&search=${encodeURIComponent(marker(r))}&in=description`)
    ).filter((item) => item.description?.includes(marker(r)));
    if (matches.length > 1) fail('ISSUE_DUPLICATED', '稳定来源标识对应多个内部 Issue，请核对后恢复原映射');
    return matches.length ? receipt(r, matches[0]) : null;
  }
  if (r.operation === 'create') {
    return receipt(
      r,
      await api.request('issues', 'POST', {
        title: r.issue.title,
        description: `${r.issue.body ?? ''}\n\n来源：${r.issue.url}\n${marker(r)}`,
      }),
    );
  }
  if (!/^\d+$/.test(r.internalId)) fail('ISSUE_IDENTITY_CONFLICT', 'GitLab Issue 编号需要项目内 iid');
  const path = `issues/${r.internalId}`;
  const item = await api.request(path);
  receipt(r, item);
  if (r.operation === 'update') {
    await api.request(path, 'PUT', { state_event: r.desiredState === 'closed' ? 'close' : 'reopen' });
    return receipt(r, await api.request(path));
  }
  return receipt(r, item, await relatedLinks(config, api, r, path));
}
async function relatedLinks(config, api, r, path) {
  const links = [];
  if (r.pr) {
    const id = prId(config, r.pr),
      mr = await api.request(`merge_requests/${id}`);
    checkPr(mr, r.pr);
    const linkMarker = `[repo-sync-link:${r.key}:${id}]`;
    if (r.operation === 'link' && !mr.description?.includes(linkMarker)) {
      await api.request(`merge_requests/${id}`, 'PUT', {
        description: `${mr.description ?? ''}\n\nRelated to #${r.internalId}\n${linkMarker}`,
      });
    }
    const related = await api.list(`${path}/related_merge_requests`);
    const fresh = await api.request(`merge_requests/${id}`);
    checkPr(fresh, r.pr);
    if (fresh.description?.includes(linkMarker) && related.some((entry) => entry.web_url === r.pr.url))
      links.push(r.pr);
  }
  return links;
}
