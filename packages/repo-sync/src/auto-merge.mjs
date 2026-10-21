import { fail } from './config.mjs';
import { phase, safeError } from './execution.mjs';
import { githubMerge, githubPr, githubPrDetail } from './github-platform-pr.mjs';
import { gitlabApi } from './gitlab-api.mjs';
import { gitlabPr } from './gitlab-pr.mjs';
import { githubMergeReadiness, mergeReadiness, mergeWait } from './merge-readiness.mjs';
import { event } from './store.mjs';

export function autoMergeSupported(mode) {
  return mode === 'gitlab' || mode === 'github';
}

export function configureAutoMerge(receiver, input) {
  if (typeof input.autoMerge !== 'boolean')
    fail('INVALID_AUTO_MERGE', '请明确选择是否允许本轮平台自动合入。');
  if (input.autoMerge && !autoMergeSupported(receiver.config.pullRequests?.mode))
    fail(
      'AUTO_MERGE_UNSUPPORTED',
      '自动合入需要 GitLab v4 或 GitHub REST 的可核验合入 API；请先配置平台 PR 创建方式，再开启自动合入。',
    );
  return receiver.change((state) => {
    const run = state.automation;
    if (!run || run.id !== input.runId || run.status === 'COMPLETE')
      fail('AUTOMATION_CHANGED', '原同步轮次已改变。');
    const active = receiver.active(state);
    if (active?.repair && active.repair.status !== 'COMPLETE') fail('REPAIR_PENDING', '修复 PR 需要明确审核合入；原轮次保持暂停。');
    if (active?.id !== (input.deliveryId || undefined))
      fail('DELIVERY_CHANGED', '当前 PR 已变化，请刷新后再设置自动合入。');
    if (active?.cancellation?.status === 'REQUESTED') fail('CANCELLATION_PENDING', '先完成原 PR 撤销。');
    run.autoMerge = input.autoMerge;
    event(
      state,
      receiver.active(state),
      input.autoMerge
        ? '用户明确启用本轮平台自动合入；仍须候选检查和平台规则允许。'
        : '用户关闭本轮自动合入，尚未发出的合入请求停止。',
    );
  });
}

export async function autoMergeDelivery(receiver, options = {}) {
  let outcome = { kind: 'wait' };
  await receiver.change(async (state) => {
    const unresolved = receiver.active(state)?.autoMerge;
    if (
      state.automation?.autoMerge !== true &&
      !(options.observeOnly && unresolved?.requestedAt && !unresolved.requestRejected)
    )
      return;
    if (!autoMergeSupported(receiver.config.pullRequests?.mode))
      fail('AUTO_MERGE_UNSUPPORTED', '当前平台未提供可核验的合入 API；请在平台人工合入或改用 GitLab v4 / GitHub REST。');
    const mode = receiver.config.pullRequests.mode;
    const d = receiver.requireActive(state);
    if (
      options.expected &&
      (state.automation.id !== options.expected.runId ||
        d.id !== options.expected.deliveryId ||
        d.candidate !== options.expected.head)
    )
      fail('DELIVERY_CHANGED', '后台观察的原 PR 已改变');
    if (options.observeOnly && Date.parse(d.autoMerge?.nextCheckAt) > Date.now()) return;
    if (d.status !== 'WAITING_APPROVAL' || !d.prUrl || !d.checks?.passed || d.checks.head !== d.candidate)
      fail('CHECKS_REQUIRED', '仅允许已检查且已回读的冻结 PR 自动合入。');
    const findPr = () =>
      mode === 'github'
        ? githubPr(receiver.config, 'find', {
            deliveryId: d.id,
            branch: d.branch,
            targetBranch: receiver.config.targetBranch,
          })
        : gitlabPr(receiver.config, 'find', {
            deliveryId: d.id,
            branch: d.branch,
            targetBranch: receiver.config.targetBranch,
          });
    const found = await findPr();
    if (!found || found.url !== d.prUrl || found.head !== d.candidate || found.base !== d.base.internal)
      fail('PR_OBJECT_MISMATCH', '自动合入前 PR 身份或 base/head 已变化；未提交合入请求。');
    if (found.state === 'merged') {
      d.autoMerge = {
        ...(d.autoMerge ?? {}),
        status: 'MERGED',
        confirmedAt: new Date().toISOString(),
      };
      d.mergeObservation = {
        source: 'platform',
        head: d.candidate,
        url: d.prUrl,
        observedAt: new Date().toISOString(),
      };
      outcome = { kind: 'merged' };
      return;
    }
    if (found.state !== 'open') fail('AUTO_MERGE_BLOCKED', 'PR 不处于打开状态，未合入。');
    const number = Number(/\/(\d+)$/.exec(found.url)?.[1]);
    if (!Number.isSafeInteger(number) || number < 1) fail('PR_OBJECT_MISMATCH', '自动合入的 PR 编号无效。');
    const pending = Boolean(d.autoMerge?.requestedAt && !d.autoMerge.requestRejected);
    let retryPending = false;
    if (pending && Date.now() - Date.parse(d.autoMerge.requestedAt) > 60000) {
      if (d.autoMerge.retried) {
        d.autoMerge.status = 'BLOCKED';
        d.autoMerge.reason = '合入请求两次未确认，PR 仍打开；请打开原 PR 手动合入，或恢复同步后再试';
        d.autoMerge.requestRejected = true;
        event(state, d, d.autoMerge.reason);
        if (!options.observeOnly) fail('AUTO_MERGE_BLOCKED', d.autoMerge.reason);
        return;
      }
      retryPending = true;
    }
    if (mode === 'github') {
      const detail = await githubPrDetail(receiver.config, number);
      if (
        detail.head?.sha !== d.candidate ||
        detail.html_url !== d.prUrl ||
        detail.state !== 'open' ||
        detail.head?.ref !== d.branch ||
        detail.base?.ref !== receiver.config.targetBranch
      )
        fail('PR_OBJECT_MISMATCH', '自动合入的最新 PR 身份与冻结交付不同。');
      outcome = pending && !retryPending ? { kind: 'pending', reason: '确认原合入请求结果；不会重复请求合入' } : githubMergeReadiness(detail, d.candidate);
    } else {
      const api = gitlabApi(receiver.config, receiver.config.pullRequests, 'PR');
      const detail = await api.request(`merge_requests/${number}`);
      if (
        detail.sha !== d.candidate ||
        detail.web_url !== d.prUrl ||
        detail.state !== 'opened' ||
        detail.source_branch !== d.branch ||
        detail.target_branch !== receiver.config.targetBranch
      )
        fail('PR_OBJECT_MISMATCH', '自动合入的最新 MR 身份与冻结交付不同。');
      outcome = pending && !retryPending ? { kind: 'pending', reason: '确认原合入请求结果；不会重复请求合入' } : mergeReadiness(detail, d.candidate);
    }
    if (outcome.kind !== 'ready') {
      const oldReason = d.autoMerge?.reason;
      d.autoMerge = mergeWait(d, outcome, Date.now(), receiver.config.autoMergeWaitMs);
      if (!outcome.manual && Date.now() >= Date.parse(d.autoMerge.deadlineAt))
        outcome = {
          kind: 'blocked',
          reason: '自动等待已超时，确认原 PR 状态后恢复以继续等待',
        };
      if (outcome.kind === 'blocked') {
        d.autoMerge.status = 'BLOCKED';
        d.autoMerge.reason = outcome.reason;
        if (!options.observeOnly) fail('AUTO_MERGE_BLOCKED', outcome.reason);
      }
      if (oldReason !== d.autoMerge.reason) event(state, d, d.autoMerge.reason);
      return;
    }
    if (options.observeOnly) return;
    const heads = await receiver.git.heads();
    if (heads.internal !== d.base.internal || (await receiver.git.remoteBranch(d.branch)) !== d.candidate)
      fail('PR_BASE_CHANGED', '内部 main 或候选已改变，先核验原交付，不自动合入。');
    d.autoMerge = {
      status: 'INTENT_SAVED',
      head: d.candidate,
      requestedAt: new Date().toISOString(),
      ...(d.autoMerge?.retried || retryPending ? { retried: true } : {}),
    };
    await phase('merge-intent', '保存冻结 PR 的自动合入意图', () => receiver.store.save(state), false);
    await phase(
      'platform-merge',
      '由平台合入原 PR 并回读',
      async () => {
        try {
          if (mode === 'github')
            await githubMerge(receiver.config, Number(number), d.candidate);
          else
            await gitlabApi(receiver.config, receiver.config.pullRequests, 'PR').request(
              `merge_requests/${number}/merge`,
              'PUT',
              {
                sha: d.candidate,
                squash: false,
                should_remove_source_branch: false,
              },
            );
        } catch (error) {
          if (error.code !== 'PR_API_UNAVAILABLE' && !(error.httpStatus >= 500)) {
            d.autoMerge.status = 'BLOCKED';
            d.autoMerge.requestRejected = true;
            throw error;
          }
          d.autoMerge = mergeWait(
            d,
            { kind: 'pending', reason: '合入回执丢失，正在只读确认原 PR' },
            Date.now(),
            receiver.config.autoMergeWaitMs,
          );
          d.autoMerge.lastError = safeError(error);
          outcome = { kind: 'pending' };
          return;
        }
        let fresh;
        try {
          fresh = await findPr();
        } catch (error) {
          // A successful write followed by an unavailable read is an unknown result, not a rejected write.
          d.autoMerge = mergeWait(
            d,
            { kind: 'pending', reason: '合入请求已发送，正在回读原 PR 结果' },
            Date.now(),
            receiver.config.autoMergeWaitMs,
          );
          d.autoMerge.lastError = safeError(error);
          outcome = { kind: 'pending' };
          return;
        }
        if (!fresh || fresh.url !== d.prUrl || fresh.head !== d.candidate)
          fail('PR_OBJECT_MISMATCH', '合入回读不属于原 PR');
        if (fresh.state !== 'merged') {
          d.autoMerge = mergeWait(d, { kind: 'pending', reason: '平台正在处理原合入请求' }, Date.now(), receiver.config.autoMergeWaitMs);
          outcome = { kind: 'pending' };
          return;
        }
        outcome = { kind: 'merged' };
      },
      false,
    );
    if (outcome.kind !== 'merged') return;
    d.autoMerge.status = 'MERGED';
    d.autoMerge.confirmedAt = new Date().toISOString();
    d.mergeObservation = {
      source: 'platform',
      head: d.candidate,
      url: d.prUrl,
      observedAt: d.autoMerge.confirmedAt,
    };
    event(state, d, '平台已回读原 PR 合入；接下来执行第五步 Git 与 Issue 核验，不直接推送 main。');
  });
  return outcome;
}
