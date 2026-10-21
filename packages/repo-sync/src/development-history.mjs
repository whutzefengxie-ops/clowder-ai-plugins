import { fail } from './config.mjs';
import { phase } from './execution.mjs';
import { matches } from './policy.mjs';
import { git } from './process.mjs';
import { entries, equalEntry } from './trees.mjs';

const sha = (value) => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
export async function developmentHistory(receiver, provider, repo, pr, introduced, base, options = {}) {
  if (pr.commits === undefined) return {}; // Older injected providers do not claim a complete development list.
  if (!Number.isSafeInteger(pr.commits) || pr.commits < 1)
    fail('PR_HISTORY_INCOMPLETE', 'PR 开发提交数量无效，无法确认完整历史。');
  const summary = { developmentCommitCount: pr.commits };
  if (receiver.config.commitStrategy !== 'rewrite' || introduced.length !== 1 || pr.commits === 1) return summary;
  if (!sha(pr.head?.sha) || !Number.isSafeInteger(pr.number) || pr.number < 1)
    fail('PR_HISTORY_INCOMPLETE', '展开 squash PR 需要明确的 PR 编号和冻结 head。');
  const ref = `refs/sync/pr/${pr.number}`;
  await fetchPrHead(receiver, pr.number, ref);
  const frozenHead = await receiver.git.sha(ref);
  if (frozenHead !== pr.head.sha) fail('PR_HISTORY_CHANGED', 'PR head 与读取的 ref 不一致；未创建 Issue / PR。');
  // GitHub 的 pulls/{n}/commits 只返回前 250 条；大 PR 会被截断。
  // 已把 PR head 拉进私有对象库，直接用 Git 计算 base..head 的完整提交，
  // 既不受 API 上限影响，也与后续冻结清单使用同一顺序。
  const output = await git(receiver.git.directory, [
    'rev-list',
    '--reverse',
    '--topo-order',
    pr.head.sha,
    `^${base}`,
  ]);
  const commits = output ? output.split('\n').filter(Boolean) : [];
  if (commits.length !== pr.commits || new Set(commits).size !== commits.length || commits.at(-1) !== pr.head.sha)
    fail('PR_HISTORY_INCOMPLETE', 'PR 开发提交清单缺失、重复或被平台截断；未创建 Issue / PR，请核对来源读取权限和完整清单。');
  const replay = { schema: 1, head: pr.head.sha, commits, landingBase: base, landing: pr.merge_commit_sha };
  try {
    await verifyDevelopmentHistory(receiver, { source: { number: pr.number, developmentReplay: replay }, base: { upstream: base }, target: pr.merge_commit_sha });
  } catch (error) {
    if (error.code !== 'PR_REPLAY_TREE_MISMATCH' || !error.details?.paths?.length) throw error;
    const accepted = options.snapshots?.[pr.merge_commit_sha];
    if (options.policy === 'block' || (options.policy !== 'auto' && !accepted))
      fail(
        'PR_REPLAY_CONFLICT',
        'PR 合入时包含冲突解决；请确认是否使用合并快照继续，确认前不创建 Issue / PR。',
        {
          number: pr.number,
          head: pr.head.sha,
          landing: pr.merge_commit_sha,
          base,
          files: error.details.paths,
        },
      );
    return {
      ...summary,
      conflictResolution: {
        mode: 'snapshot',
        files: error.details.paths,
        head: pr.head.sha,
        landing: pr.merge_commit_sha,
        base,
        acceptedBy: accepted ? 'user' : 'policy',
      },
    };
  }
  return { ...summary, developmentReplay: replay };
}

export function validateDevelopmentReplay(replay) {
  if (!replay || replay.schema !== 1 || !sha(replay.head) || !sha(replay.landingBase) || !sha(replay.landing) ||
      !Array.isArray(replay.commits) || replay.commits.length < 2 || replay.commits.some((item) => !sha(item)) ||
      new Set(replay.commits).size !== replay.commits.length || !replay.commits.includes(replay.head))
    fail('PR_HISTORY_INCOMPLETE', '冻结的 PR 开发历史损坏；保留原记录，不退回压缩提交。');
}

export async function verifyDevelopmentHistory(receiver, delivery) {
  const replay = delivery.source.developmentReplay;
  validateDevelopmentReplay(replay);
  if (replay.landingBase !== delivery.base.upstream || replay.landing !== delivery.target ||
      !Number.isSafeInteger(delivery.source.number) || delivery.source.number < 1)
    fail('PR_HISTORY_CHANGED', '开发历史与本笔 main 接受范围不匹配，未重放或发布。');
  const ref = `refs/sync/pr/${delivery.source.number}`;
  await phase('pr-history', '读取并核对原 PR 的完整开发提交', async () => {
    await fetchPrHead(receiver, delivery.source.number, ref);
    if (await receiver.git.sha(ref) !== replay.head)
      fail('PR_HISTORY_CHANGED', '原 PR head 与冻结清单不一致；请核对上游变化，未发布候选。');
  });
  const output = await git(receiver.git.directory, ['rev-list', '--reverse', '--topo-order', replay.head, `^${replay.landingBase}`]);
  const sources = output ? output.split('\n') : [];
  if (sources.length !== replay.commits.length || sources.some((item) => !replay.commits.includes(item)) || sources.at(-1) !== replay.head)
    fail('PR_HISTORY_INCOMPLETE', 'PR API 清单与实际 Git 范围不一致；不能重复搬运已接受的主干提交或漏掉开发提交。');
  await assertReplayProjection(receiver, delivery, replay);
  return sources;
}

// 连续扫描多个 PR 时会逐个 fetch refs/pull/N/head；github.com 偶尔会在一次连接上超时，
// 不能因此让整轮扫描失败，也不能把网络问题误报成权限或 PR 缺失。只对网络类错误重试。
export async function fetchPrHead(receiver, number, ref, run = git, wait = (ms) => new Promise((done) => setTimeout(done, ms))) {
  const directory = receiver.git.directory,
    url = receiver.git.config.sourceUrl;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await run(directory, ['fetch', '--no-tags', url, `+refs/pull/${number}/head:${ref}`]);
      return;
    } catch (error) {
      lastError = error;
      if (!['NETWORK_FAILED', 'COMMAND_TIMEOUT'].includes(error.code) || attempt === 3) break;
      await wait(1000 * attempt);
    }
  }
  const transient = ['NETWORK_FAILED', 'COMMAND_TIMEOUT'].includes(lastError?.code);
  fail(
    'PR_HISTORY_UNAVAILABLE',
    transient
      ? `无法读取 PR #${number} 的 Git 对象：连接 github.com 失败或超时（已重试 3 次）。这是外部网络 / 代理问题，不是权限或 PR 已删除；网络恢复后重试原同步，已完成对象与台账保留，不需要重新配置。`
      : `无法读取 PR #${number} 的 Git 对象（refs/pull/${number}/head，退出状态 ${lastError?.details?.exitCode ?? '未知'}）。请核对 GitHub 是否提供该 PR ref 和外部仓库读取权限；修复后重试原同步，不退回单条提交。`,
    { number, cause: lastError?.code },
  );
}

async function changedPaths(directory, before, after) {
  const output = await git(directory, ['diff', '--no-renames', '--name-only', '-z', before, after]);
  return new Set(output.split('\0').filter(Boolean));
}

export async function assertReplayProjection(receiver, delivery, replay) {
  const directory = receiver.git.directory;
  const parents = (await git(directory, ['show', '-s', '--format=%P', replay.landing])).split(' ').filter(Boolean);
  const landingParent = parents[0];
  if (!landingParent) fail('PR_REPLAY_TREE_MISMATCH', 'PR landing commit 缺少可核对的 main 父提交；未发布候选。');
  const internal = delivery.base.internal ?? (await receiver.git.sha('refs/sync/internal'));
  const [headTree, landingTree, parentTree, internalTree] = await Promise.all([
    entries(directory, replay.head),
    entries(directory, replay.landing),
    entries(directory, landingParent),
    entries(directory, internal),
  ]);
  const [sourceChanges, parentChanges, landingChanges] = await Promise.all([
    changedPaths(directory, replay.landingBase, replay.head),
    changedPaths(directory, replay.landingBase, landingParent),
    changedPaths(directory, landingParent, replay.landing),
  ]);
  const preserved = (path) => (receiver.config.internalPaths ?? []).some((rule) => matches(path, rule));
  const mismatches = [];
  for (const path of sourceChanges) {
    // landing 相对其父提交没有变化 => 这个差异继承自并行 main，不是本 PR 改的，
    // 交给 check #2（parentChanges vs internal 基线）去要求先接收，不在这里阻塞。
    if (
      !preserved(path) &&
      !equalEntry(headTree.get(path), landingTree.get(path)) &&
      !equalEntry(landingTree.get(path), parentTree.get(path))
    )
      mismatches.push(path);
  }
  for (const path of parentChanges) {
    if (!sourceChanges.has(path) && !preserved(path) && !equalEntry(parentTree.get(path), internalTree.get(path))) mismatches.push(path);
  }
  for (const path of landingChanges) {
    if (!sourceChanges.has(path) && !preserved(path) && !equalEntry(landingTree.get(path), internalTree.get(path))) mismatches.push(path);
  }
  if (mismatches.length)
    fail('PR_REPLAY_TREE_MISMATCH', 'PR landing 包含未在 PR head 或内部基线中证明的核心文件变化；请先接收并行 main 提交或核对冲突处理。', {
      paths: [...new Set(mismatches)],
      upstream: replay.landing,
      internal,
    });
}
