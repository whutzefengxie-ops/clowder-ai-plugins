import { randomBytes } from 'node:crypto';
import { autoMergeDelivery } from './auto-merge.mjs';
import { safeError } from './execution.mjs';
import { transferState } from './transfer-state.mjs';

// The server owns observation. Browser lifecycle never owns merge/Issue completion.
export class SyncService {
  constructor(resolveScope, interval = 10000) {
    this.resolveScope = resolveScope;
    this.controller = new AbortController();
    this.timer = setInterval(() => this.tick(), interval);
    this.timer.unref();
  }
  async tick() {
    if (this.stopped || this.job) return;
    if (Date.now() < (this.retryAt ?? 0)) return;
    this.job = this.observe();
    try {
      await this.job;
    } catch {
      /* Read errors are surfaced on the next scoped status read. */
    } finally {
      this.job = null;
    }
  }
  async observe() {
    const scope = await this.resolveScope(),
      receiver = scope.receiver;
    if (!receiver || scope.tasks.busy()) return;
    const transfer = await transferState(receiver.config);
    if (transfer && transfer.status !== 'ACTIVE') return;
    const state = await receiver.status(),
      run = state?.automation;
    if (!run) return;
    const task = await scope.tasks.latest();
    if (blockedTask(task)) return;
    if (run.status === 'FAILED') {
      const decision = automaticRetry(run, state.active?.id, this.autoRetry, Date.now());
      this.autoRetry = decision.memory;
      if (!decision.start) return;
      await startResume(scope, receiver, run, false);
      return;
    }
    this.autoRetry = null;
    if (!['RUNNING', 'WAITING_REVIEW'].includes(run.status)) return;
    if (
      run.status === 'WAITING_REVIEW' &&
      state.active &&
      (run.autoMerge === true ||
        (state.active.autoMerge?.requestedAt &&
          !state.active.autoMerge.requestRejected &&
          state.active.autoMerge.status !== 'MERGED'))
    ) {
      if (Date.parse(state.active.autoMerge?.nextCheckAt) > Date.now()) return;
      try {
        const result = await autoMergeDelivery(receiver, {
          observeOnly: true,
          expected: {
            runId: run.id,
            deliveryId: state.active.id,
            head: state.active.candidate,
          },
        });
        this.lastCheckedAt = new Date().toISOString();
        this.error = null;
        this.readErrors = 0;
        this.retryAt = 0;
        if (!['ready', 'merged', 'blocked'].includes(result.kind)) return;
      } catch (error) {
        this.error = safeError(error);
        this.readErrors = (this.readErrors ?? 0) + 1;
        this.retryAt = Date.now() + (error.retryAfterMs ?? 10000 * this.readErrors);
        if ([401, 403].includes(error.httpStatus) || this.readErrors >= 3) {
          await receiver.change((saved) => {
            if (saved.automation.id !== run.id || receiver.active(saved)?.id !== state.active.id) return;
            saved.automation.status = 'FAILED';
            saved.automation.error = safeError(error);
          });
        }
        return;
      }
    }
    if (run.status === 'WAITING_REVIEW' && state.active && !state.active.acceptedInternal) {
      try {
        const head = await receiver.git.remoteBranch(receiver.config.targetBranch, {
          signal: this.controller.signal,
          timeout: 15000,
        });
        if (this.stopped) return;
        this.lastCheckedAt = new Date().toISOString();
        this.error = null;
        if (head === state.active.base.internal && run.autoMerge !== true) return;
      } catch (error) {
        this.error = safeError(error);
        return;
      }
    }
    if (this.stopped) return;
    await startResume(scope, receiver, run);
  }
  status() {
    return {
      lastCheckedAt: this.lastCheckedAt ?? null,
      error: this.error ?? null,
    };
  }
  async close() {
    this.stopped = true;
    clearInterval(this.timer);
    this.controller.abort();
    await this.job?.catch(() => {});
  }
}

function blockedTask(task) {
  return (
    ['RUNNING', 'CANCELLING', 'STOP_UNCONFIRMED'].includes(task?.status) ||
    task?.persistence?.status === 'FAILED'
  );
}

function startResume(scope, receiver, run, observeOnly = true) {
  return scope.tasks.start({
    action: 'resume-sync',
    observeOnly,
    runId: run.id,
    requestId: randomBytes(16).toString('hex'),
    expectedBinding: receiver.config.bindingId,
    expectedRevision: scope.options.connection?.describe().revision,
    ...(scope.options.projectId ? { projectId: scope.options.projectId } : {}),
  });
}

// 用户反馈以及任务记录都表明：Git 的 128（连接中断、HTTP 502、临时 ref 锁）、
// 平台 API 短暂不可用和推送回执不明，在恢复同步后即可通过。这里在轮次 FAILED 后
// 自动重试两次，仍失败才交还给用户。
const autoRetryCodes = new Set([
  'COMMAND_FAILED',
  'NETWORK_FAILED',
  'ISSUE_API_UNAVAILABLE',
  'PR_API_UNAVAILABLE',
  'PUSH_RESULT_UNKNOWN',
]);
export function automaticRetry(run, deliveryId, memory, now = Date.now()) {
  if (run?.status !== 'FAILED' || !autoRetryCodes.has(run.error?.code)) return { memory: null, start: false };
  const key = `${run.id}:${deliveryId ?? ''}:${run.error.code}`;
  const current = memory?.key === key ? memory : { key, count: 0, at: 0 };
  if (current.count >= 2 || now < current.at) return { memory: current, start: false };
  return {
    memory: { key, count: current.count + 1, at: now + (current.count === 0 ? 10000 : 30000) },
    start: true,
  };
}
