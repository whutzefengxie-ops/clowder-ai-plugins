import { fail } from './config.mjs';
import { phase } from './execution.mjs';
import { api } from './gh-api.mjs';
import { collectIssues } from './github-issues.mjs';
import { git } from './process.mjs';
import { attachIssueRequirements } from './requirements.mjs';
import { sourceTarget } from './source-target.mjs';

export function groupLandings(boundaries, associations, branch) {
  const groups = [];
  for (const sha of boundaries) {
    const candidates = associations[sha].filter((pr) => pr.merged_at && pr.base.ref === branch);
    if (candidates.length !== 1) fail('SOURCE_UNPROVEN', '主干提交不能唯一归属已合入 PR，暂停核对真实来源集合');
    const pr = candidates[0];
    const previous = groups.at(-1);
    if (previous?.pr.node_id === pr.node_id) {
      previous.target = sha;
      previous.boundaries.push(sha);
    } else groups.push({ pr, target: sha, boundaries: [sha] });
  }
  for (const group of groups) {
    if (group.pr.merge_commit_sha !== group.target)
      fail('SOURCE_UNPROVEN', 'PR 实际合入边界与 main 范围不符，不能搬运开发分支范围');
  }
  return groups;
}
export function githubRepository(url) {
  const match =
    /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(
      url,
    );
  if (!match) fail('SOURCE_PLATFORM_UNSUPPORTED', '来源需要 github.com 仓库；本地仓仅用于合成验证');
  return `${match[1]}/${match[2]}`;
}
export async function discover(receiver, selection, provider = { api, collectIssues }) {
  if (receiver.config.mode === 'version') fail('WRONG_MODE', '按版本更新从 Git 读取 tag，不扫描 Issue / PR');
  return receiver.store.locked(() => discoverLocked(receiver, selection, provider));
}
async function discoverLocked(receiver, selection, provider) {
  const state = await receiver.read();
  if (!state) fail('NOT_ADOPTED', '先登记基线');
  if (receiver.active(state)) fail('RECOVERY_FIRST', '先恢复未完成交付，再扫描新的范围');
  const repo = githubRepository(receiver.config.sourceUrl);
  const repository = await phase('github-repository', '读取 GitHub 仓库元数据', () => provider.api(`repos/${repo}`));
  const heads = await receiver.git.fetch();
  if (!(await receiver.git.isAncestor(state.accepted.upstream, heads.upstream)))
    fail('SOURCE_REWRITTEN', '上游 main 历史发生改写');
  const target = await sourceTarget(receiver, state, heads, selection);
  const output = await git(receiver.git.directory, [
    'rev-list',
    '--first-parent',
    '--reverse',
    `${state.accepted.upstream}..${target.commit}`,
  ]);
  const boundaries = output ? output.split('\n') : [];
  return phase('github-deliveries', '读取并核对 PR / Issue / commit 对应', async () => {
    const associations = {};
    for (const sha of boundaries)
      associations[sha] = await provider.api(`repos/${repo}/commits/${sha}/pulls?per_page=100`, true);
    const groups = groupLandings(boundaries, associations, receiver.config.sourceBranch);
    const plans = [];
    let base = state.accepted.upstream;
    for (const group of groups) {
      const pr = await provider.api(`repos/${repo}/pulls/${group.pr.number}`);
      if (!pr.merged || pr.merge_commit_sha !== group.target) fail('SOURCE_CHANGED', '扫描过程中 PR 来源发生变化');
      const introduced = (await git(receiver.git.directory, ['rev-list', `${base}..${group.target}`])).split('\n');
      const messages = [];
      for (const sha of introduced)
        messages.push(await git(receiver.git.directory, ['show', '-s', '--format=%B', sha]));
      const issues = await provider.collectIssues(repo, pr, introduced, messages);
      plans.push({
        target: group.target,
        syncTarget: target,
        source: {
          id: pr.node_id,
          repositoryId: repository.node_id,
          number: pr.number,
          url: pr.html_url,
          title: pr.title,
          mergedAt: pr.merged_at,
        },
        issues,
      });
      base = group.target;
    }
    attachIssueRequirements(plans);
    await receiver.replaceQueue(state, plans, heads, target.commit);
    state.syncTarget = target;
    await receiver.store.save(state);
    return state;
  });
}
