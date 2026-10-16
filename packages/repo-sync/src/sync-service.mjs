import { randomBytes } from 'node:crypto';
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
    if (!run || !['RUNNING', 'WAITING_REVIEW'].includes(run.status)) return;
    const task = await scope.tasks.latest();
    if (blockedTask(task)) return;
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
    await scope.tasks.start({
      action: 'resume-sync',
      observeOnly: true,
      runId: run.id,
      requestId: randomBytes(16).toString('hex'),
      expectedBinding: receiver.config.bindingId,
      expectedRevision: scope.options.connection?.describe().revision,
      ...(scope.options.projectId ? { projectId: scope.options.projectId } : {}),
    });
  }
  status() {
    return { lastCheckedAt: this.lastCheckedAt ?? null, error: this.error ?? null };
  }
  async close() {
    this.stopped = true;
    clearInterval(this.timer);
    this.controller.abort();
    await this.job?.catch(() => {});
  }
}

function blockedTask(task) {
  return ['RUNNING', 'CANCELLING', 'STOP_UNCONFIRMED'].includes(task?.status) || task?.persistence?.status === 'FAILED';
}
