import { fail } from './config.mjs';
import { githubPlatformApi } from './github-platform-api.mjs';

const marker = (r) => `[repo-sync-issue:${r.key}]`;
const maxBody = 65000;

// GitHub Issue 正文上限为 65,536 字符；来源 Issue 可能是一整篇 PRD。
// 截断时保留来源链接和稳定标识，方便回到外部 Issue 查看完整内容。
export function issueBody(r) {
  const suffix = `\n\n来源：${r.issue.url}\n${marker(r)}`,
    source = r.issue.body ?? '';
  if (source.length + suffix.length <= maxBody) return `${source}${suffix}`;
  const note = `\n\n…（正文共 ${source.length} 字，超过 GitHub 65,536 字符上限，已截断；完整内容见来源链接）`,
    room = Math.max(0, maxBody - suffix.length - note.length);
  return `${source.slice(0, room)}${note}${suffix}`;
}
function receipt(r, item, links = []) {
  if (typeof item?.body !== 'string' || !item.body.includes(marker(r)))
    fail('ISSUE_IDENTITY_CONFLICT', '内部 Issue 缺少稳定来源标识；禁止采用或关闭其他对象');
  if (!Number.isSafeInteger(item.number) || item.number < 1)
    fail('ISSUE_RESPONSE_INVALID', '内部 Issue 回执缺少有效的项目内编号，未采用');
  return {
    sourceId: r.sourceId,
    key: r.key,
    internalId: String(item.number),
    url: issueUrl(item),
    state: item.state === 'open' ? 'open' : item.state,
    links,
  };
}
function issueUrl(item) {
  if (typeof item?.html_url !== 'string' || !item.html_url) fail('ISSUE_RESPONSE_INVALID', '内部 Issue 回执缺少链接');
  return item.html_url;
}
function prId(config, pr) {
  const base = config.internalWebUrl.replace(/\/$/, '');
  const relative = pr?.url?.startsWith(`${base}/`) ? pr.url.slice(base.length) : '',
    match = /^\/pull\/(\d+)$/.exec(relative);
  if (!match) fail('ISSUE_PR_INVALID', 'GitHub 关联需要此仓库的具体 Pull request 地址');
  const id = match[1];
  if (!/^\d+$/.test(id)) fail('ISSUE_PR_INVALID', 'PR 编号无效');
  return id;
}
function prState(item) {
  if (item?.merged === true) return 'merged';
  return item?.state === 'open' ? 'opened' : 'closed';
}
function checkPr(item, pr) {
  if (
    !item ||
    (item.body !== null && item.body !== undefined && typeof item.body !== 'string') ||
    item.html_url !== pr.url ||
    item.head?.sha !== pr.head ||
    item.head?.ref !== pr.branch ||
    item.base?.ref !== pr.targetBranch ||
    !['opened', 'closed', 'merged'].includes(prState(item))
  )
    fail('ISSUE_PR_CONFLICT', '内部 PR 的 head、源分支或目标分支与冻结交付不符，未关联 Issue');
}
export async function githubIssue(config, r) {
  const api = githubPlatformApi(config);
  if (r.operation === 'find') {
    // GitHub 搜索索引有延迟，创建后立即用 search 回读可能查不到；按创建时间倒序列出并核对稳定标识，
    // 保证“先查后建、写后回读”不会因索引未更新而重复建单。
    const matches = (await api.list('issues?state=all&sort=created&direction=desc')).filter((item) => {
      if (item?.body != null && typeof item.body !== 'string')
        fail('ISSUE_RESPONSE_INVALID', '内部 Issue 描述格式无效，无法确认查找完整性');
      return typeof item.body === 'string' && item.body.includes(marker(r));
    });
    if (matches.length > 1) fail('ISSUE_DUPLICATED', '稳定来源标识对应多个内部 Issue，请核对后恢复原映射');
    return matches.length ? receipt(r, matches[0]) : null;
  }
  if (r.operation === 'create') {
    const created = await api.request('issues', 'POST', {
      title: r.issue.title,
      body: issueBody(r),
    });
    if (!Number.isSafeInteger(created?.number))
      fail('ISSUE_RESPONSE_INVALID', '内部 Issue 创建回执缺少编号，未采用');
    return receipt(r, await api.request(`issues/${created.number}`));
  }
  if (!/^[1-9]\d*$/.test(r.internalId)) fail('ISSUE_IDENTITY_CONFLICT', 'GitHub Issue 编号需要项目内数字');
  const path = `issues/${r.internalId}`;
  const item = await api.request(path);
  receipt(r, item);
  if (r.operation === 'update') {
    await api.request(path, 'PATCH', { state: r.desiredState === 'closed' ? 'closed' : 'open' });
    return receipt(r, await api.request(path));
  }
  return receipt(r, item, await relatedLinks(config, api, r));
}
async function relatedLinks(config, api, r) {
  const links = [];
  if (r.pr) {
    const id = prId(config, r.pr),
      pr = await api.request(`pulls/${id}`);
    checkPr(pr, r.pr);
    const required = [`Related to #${r.internalId}`, `[repo-sync-link:${r.key}:${id}]`];
    const missing = required.filter((line) => !descriptionLines(pr).includes(line));
    if (r.operation === 'link' && missing.length) {
      await api.request(`pulls/${id}`, 'PATCH', {
        body: `${pr.body ?? ''}\n\n${missing.join('\n')}`,
      });
    }
    const fresh = await api.request(`pulls/${id}`);
    checkPr(fresh, r.pr);
    if (required.every((line) => descriptionLines(fresh).includes(line))) links.push(r.pr);
  }
  return links;
}
function descriptionLines(pr) {
  return (pr.body ?? '').split(/\r?\n/);
}
