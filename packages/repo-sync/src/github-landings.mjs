import { fail } from './config.mjs';

export function groupLandings(boundaries, associations, branch, includeDirect = false) {
  const groups = [];
  for (const sha of boundaries) appendLanding(groups, sha, associations[sha], branch);
  for (const group of groups)
    if (group.pr && group.pr.merge_commit_sha !== group.target)
      fail('SOURCE_UNPROVEN', `PR 实际合入边界与提交 ${group.target.slice(0, 12)} 不符，不能搬运开发分支范围。`);
  confirmDirect(groups, includeDirect);
  return groups;
}
function appendLanding(groups, sha, items, branch) {
  if (!Array.isArray(items)) fail('METADATA_INCOMPLETE', '主干提交关联清单缺失，不能把读取失败当作无 PR。');
  if (!items.length) {
    groups.push({ kind: 'commit', target: sha, boundaries: [sha] });
    return;
  }
  const candidates = items.filter((pr) => pr.merged_at && pr.base?.ref === branch);
  if (candidates.length !== 1)
    fail(
      'SOURCE_UNPROVEN',
      `主干提交 ${sha.slice(0, 12)} 不能唯一归属来源分支已合入 PR（${candidates.length} 个匹配）。请核对关联；包含无 PR 提交的确认不能跳过多义或不匹配的 PR。`,
    );
  const pr = candidates[0],
    previous = groups.at(-1);
  if (typeof pr.node_id !== 'string' || !pr.node_id)
    fail('METADATA_INCOMPLETE', '来源 PR 缺少稳定身份，不能采用不完整关联。');
  if (previous?.pr?.node_id === pr.node_id) {
    previous.target = sha;
    previous.boundaries.push(sha);
  } else groups.push({ kind: 'pr', pr, target: sha, boundaries: [sha] });
}
function confirmDirect(groups, includeDirect) {
  const direct = groups.filter((group) => group.kind === 'commit');
  if (direct.length && !includeDirect)
    fail(
      'DIRECT_COMMITS_CONFIRMATION_REQUIRED',
      `发现 ${direct.length} 笔无关联 PR 的主干提交：${direct
        .slice(0, 10)
        .map((group) => group.target.slice(0, 12))
        .join(
          '、',
        )}${direct.length > 10 ? '等' : ''}。未创建交付或推进基线。若需完整接收，请在目标表单勾选“包含无 PR 的主干提交”后重新读取；每笔单独创建内部同步 PR，不伪造上游 PR。`,
    );
}
