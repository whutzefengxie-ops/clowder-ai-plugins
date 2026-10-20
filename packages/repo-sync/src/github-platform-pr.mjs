import { fail } from './config.mjs';
import { projectPath } from './api-configuration.mjs';
import { githubPlatformApi } from './github-platform-api.mjs';

const marker = (r) => `[repo-sync-pr:${r.deliveryId}]`;
export async function githubPr(config, action, r) {
  const api = githubPlatformApi(config, config.pullRequests, 'PR');
  if (action === 'create') {
    await api.request('pulls', 'POST', {
      title: r.title,
      body: `${r.body ?? ''}\n\n${marker(r)}`,
      head: r.branch,
      base: r.targetBranch,
    });
    return null;
  }
  const owner = projectPath(config.pullRequests.projectId, 'github').split('/')[0],
    matches = await api.list(
      `pulls?state=all&head=${encodeURIComponent(`${owner}:${r.branch}`)}&base=${encodeURIComponent(r.targetBranch)}`,
    );
  if (
    matches.some(
      (item) =>
        item.head?.ref !== r.branch ||
        item.base?.ref !== r.targetBranch ||
        !item.body?.includes(marker(r)),
    ) ||
    matches.length > 1
  )
    fail('PR_OBJECT_MISMATCH', '同一候选分支存在重复或来源不匹配的 PR，未创建第二个对象；请核对原交付。');
  if (!matches.length) return null;
  const number = matches[0].number;
  if (!Number.isSafeInteger(number) || number < 1) fail('PR_OBJECT_MISMATCH', '平台 PR 回执编号无效，未采用。');
  const item = await api.request(`pulls/${number}`);
  if (!item?.body?.includes(marker(r))) fail('PR_OBJECT_MISMATCH', '平台 PR 缺少原交付的稳定来源标识，未采用。');
  return {
    deliveryId: r.deliveryId,
    branch: item.head?.ref,
    targetBranch: item.base?.ref,
    head: item.head?.sha,
    base: item.base?.sha,
    state: item.merged === true ? 'merged' : item.state === 'open' ? 'open' : 'closed',
    url: item.html_url,
  };
}
