import { fail } from './config.mjs';
import { phase } from './execution.mjs';
import { gitlabApi } from './gitlab-api.mjs';
import { gitlabPr } from './gitlab-pr.mjs';
import { event } from './store.mjs';

export function configureAutoMerge(receiver, input) {
  if (typeof input.autoMerge !== 'boolean') fail('INVALID_AUTO_MERGE', '请明确选择是否允许本轮平台自动合入。');
  if (input.autoMerge && receiver.config.pullRequests?.mode !== 'gitlab')
    fail('AUTO_MERGE_UNSUPPORTED', '自动合入需要已配置的平台兼容 API；Git 推送不代表平台合入权限。');
  return receiver.change((state) => {
    const run = state.automation;
    if (!run || run.id !== input.runId || run.status === 'COMPLETE') fail('AUTOMATION_CHANGED', '原同步轮次已改变。');
    const active = receiver.active(state);
    if (active?.id !== (input.deliveryId || undefined)) fail('DELIVERY_CHANGED', '当前 PR 已变化，请刷新后再设置自动合入。');
    if (active?.cancellation?.status === 'REQUESTED') fail('CANCELLATION_PENDING', '先完成原 PR 撤销。');
    run.autoMerge = input.autoMerge;
    event(state, receiver.active(state), input.autoMerge ? '用户明确启用本轮平台自动合入；仍须候选检查和平台规则允许。' : '用户关闭本轮自动合入，尚未发出的合入请求停止。');
  });
}

export async function autoMergeDelivery(receiver) {
  return receiver.change(async (state) => {
    if (state.automation?.autoMerge !== true) return;
    if (receiver.config.pullRequests?.mode !== 'gitlab') fail('AUTO_MERGE_UNSUPPORTED', '当前平台未提供可核验的合入 API。');
    const d = receiver.requireActive(state);
    if (d.status !== 'WAITING_APPROVAL' || !d.prUrl || !d.checks?.passed || d.checks.head !== d.candidate)
      fail('CHECKS_REQUIRED', '仅允许已检查且已回读的冻结 PR 自动合入。');
    const found = await gitlabPr(receiver.config, 'find', { deliveryId: d.id, branch: d.branch, targetBranch: receiver.config.targetBranch });
    if (!found || found.url !== d.prUrl || found.head !== d.candidate || found.base !== d.base.internal)
      fail('PR_OBJECT_MISMATCH', '自动合入前 PR 身份或 base/head 已变化；未提交合入请求。');
    if (found.state === 'merged') {
      d.autoMerge = { ...(d.autoMerge ?? {}), status: 'MERGED', confirmedAt: new Date().toISOString() };
      return;
    }
    if (found.state !== 'open') fail('AUTO_MERGE_BLOCKED', 'PR 不处于打开状态，未合入。');
    const id = /\/(\d+)$/.exec(found.url)?.[1];
    if (!id) fail('PR_OBJECT_MISMATCH', '自动合入的 MR 编号无效。');
    const api = gitlabApi(receiver.config, receiver.config.pullRequests, 'PR');
    const detail = await api.request(`merge_requests/${id}`);
    if (detail.sha !== d.candidate || detail.web_url !== d.prUrl || detail.state !== 'opened' ||
        detail.source_branch !== d.branch || detail.target_branch !== receiver.config.targetBranch)
      fail('PR_OBJECT_MISMATCH', '自动合入的最新 MR 身份与冻结交付不同。');
    const pipeline = detail.head_pipeline?.status ?? detail.pipeline?.status;
    if (detail.draft === true || detail.work_in_progress === true || detail.has_conflicts === true ||
        detail.merge_status === 'cannot_be_merged' ||
        (pipeline && !['success', 'skipped'].includes(pipeline)))
      fail('AUTO_MERGE_BLOCKED', '平台 PR 草稿、冲突或流水线状态尚不允许合入；检查平台规则后恢复原同步。');
    const heads = await receiver.git.heads();
    if (heads.internal !== d.base.internal || await receiver.git.remoteBranch(d.branch) !== d.candidate)
      fail('PR_BASE_CHANGED', '内部 main 或候选已改变，先核验原交付，不自动合入。');
    d.autoMerge = { status: 'INTENT_SAVED', head: d.candidate, requestedAt: new Date().toISOString() };
    await phase('merge-intent', '保存冻结 PR 的自动合入意图', () => receiver.store.save(state), false);
    await phase('platform-merge', '由平台合入原 PR 并回读', async () => {
      await api.request(`merge_requests/${id}/merge`, 'PUT', { sha: d.candidate, squash: false, should_remove_source_branch: false });
      const fresh = await gitlabPr(receiver.config, 'find', { deliveryId: d.id, branch: d.branch, targetBranch: receiver.config.targetBranch });
      if (!fresh || fresh.url !== d.prUrl || fresh.head !== d.candidate || fresh.state !== 'merged')
        fail('AUTO_MERGE_PENDING', '平台合入回执尚未确认；保留原 PR 和意图，先回读实际合入结果。');
    }, false);
    d.autoMerge.status = 'MERGED';
    d.autoMerge.confirmedAt = new Date().toISOString();
    event(state, d, '平台已回读原 PR 合入；接下来执行第五步 Git 与 Issue 核验，不直接推送 main。');
  });
}
