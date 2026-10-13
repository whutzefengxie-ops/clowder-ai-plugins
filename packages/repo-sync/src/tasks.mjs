import { fail } from './config.mjs';
import { runExecution, safeError } from './execution.mjs';
import { publicTask, readTask, saveTask, taskInput, taskPlan } from './task-store.mjs';

const running = new Set(['RUNNING', 'CANCELLING', 'STOP_UNCONFIRMED']);
export class Tasks {
  constructor(resolveReceiver, perform) {
    this.resolveReceiver = resolveReceiver;
    this.perform = perform;
    this.writes = Promise.resolve();
  }
  busy() {
    return this.executing || running.has(this.value?.status);
  }
  async latest(id) {
    const receiver = await this.resolveReceiver();
    let value =
      this.value && this.value.bindingId === receiver?.config.bindingId && (!id || this.value.id === id)
        ? this.value
        : await readTask(receiver?.config, id);
    if (value && running.has(value.status) && value !== this.value) {
      value = { ...value, cancellable: false };
      try {
        process.kill(value.ownerPid, 0);
      } catch {
        value.status = 'INTERRUPTED';
        value.error = {
          code: 'EXECUTOR_INTERRUPTED',
          message: '执行器已退出，原任务中断；请先确认 Git / 检查子进程和旧执行锁，再恢复',
        };
      }
    }
    return publicTask(value, value === this.value);
  }
  async start(input) {
    const hash = taskInput(input);
    if (this.admitting) fail('OPERATION_RUNNING', '正在登记任务，请稍后读取任务状态');
    this.admitting = true;
    try {
      return await this.admit(input, hash);
    } finally {
      this.admitting = false;
    }
  }
  async admit(input, hash) {
    const receiver = await this.resolveReceiver();
    if (!receiver) fail('CONFIGURATION_REQUIRED', '先保存真实仓库配置');
    if (receiver.config.bindingId && input.expectedBinding !== receiver.config.bindingId)
      fail('CONFIGURATION_CHANGED', '仓库绑定已变化，请刷新核对后执行');
    const old =
      this.value?.id === input.requestId && this.value.bindingId === receiver.config.bindingId
        ? this.value
        : await readTask(receiver.config, input.requestId);
    if (old) {
      if (old.inputHash !== hash) fail('REQUEST_CHANGED', '相同请求标识不能更改任务参数');
      return this.latest(old.id);
    }
    if (this.busy() || running.has((await this.latest())?.status))
      fail('OPERATION_RUNNING', '已有任务正在执行，请读取原任务；不能重复发起');
    this.config = receiver.config;
    this.writes = Promise.resolve();
    this.controller = new AbortController();
    const allowCancel = ['heads', 'adopt', 'tags', 'prepare'].includes(input.action);
    this.context = {
      signal: this.controller.signal,
      allowCancel,
      cancellable: allowCancel,
      report: (event) => this.report(event),
    };
    this.value = {
      id: input.requestId,
      inputHash: hash,
      ownerPid: process.pid,
      bindingId: receiver.config.bindingId,
      action: input.action,
      status: 'RUNNING',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      cancellable: allowCancel,
      steps: taskPlan(input.action),
    };
    try {
      await saveTask(this.config, this.value, true);
    } catch {
      this.value = null;
      fail('TASK_STORE_FAILED', '任务无法安全登记，尚未开始执行；请核对私有目录');
    }
    this.executing = true;
    this.job = this.execute(input);
    return publicTask(this.value, true);
  }
  persist() {
    const snapshot = structuredClone(this.value);
    this.writes = this.writes.then(() => saveTask(this.config, snapshot));
    this.writes.catch(() => {});
  }
  report(event) {
    if (!['RUNNING', 'CANCELLING'].includes(this.value?.status)) return;
    if (event.kind === 'start') {
      let step = this.value.steps.find((step) => step.key === event.id && step.status === 'PENDING');
      if (!step) {
        step = { id: `${event.id}-${this.value.steps.length}`, key: event.id, label: event.label };
        this.value.steps.push(step);
      }
      step.status = 'RUNNING';
      step.startedAt = new Date().toISOString();
      this.step = step;
      this.value.cancellable = event.cancellable;
    } else if (event.kind === 'progress' && this.step) {
      const { phase, percent, completed, total } = event;
      this.step.progress = { phase, percent, completed, total };
      if (!this.progressDue()) return;
    } else if (this.step && ['done', 'failed'].includes(event.kind)) {
      this.step.status = event.kind === 'done' ? 'DONE' : 'FAILED';
      this.step.finishedAt = new Date().toISOString();
      if (event.error) this.step.error = event.error;
      this.step = null;
    }
    this.value.updatedAt = new Date().toISOString();
    this.persist();
  }
  progressDue() {
    if (Date.now() - (this.lastProgressSave ?? 0) < 500) return false;
    this.lastProgressSave = Date.now();
    return true;
  }
  async execute(input) {
    try {
      const result = await runExecution(this.context, () => this.perform(input));
      this.value.result = ['heads', 'tags'].includes(input.action) ? result : null;
      this.value.status = 'SUCCEEDED';
    } catch (error) {
      const failure = this.context.stopUnconfirmed
        ? {
            code: 'STOP_UNCONFIRMED',
            message: '无法确认进程树停止；保留执行锁，请在本机核对后恢复',
            safeToDisplay: true,
          }
        : error;
      this.value.status =
        failure.code === 'OPERATION_CANCELLED'
          ? 'CANCELLED'
          : failure.code === 'STOP_UNCONFIRMED'
            ? 'STOP_UNCONFIRMED'
            : 'FAILED';
      this.value.error = safeError(failure);
      let step = this.step ?? this.value.steps.findLast((step) => step.status === 'FAILED');
      if (!step) {
        step = { id: 'execution-failed', label: '启动 / 执行任务', status: 'FAILED' };
        this.value.steps.push(step);
      }
      step.status = 'FAILED';
      step.error = this.value.error;
    }
    this.value.finishedAt = new Date().toISOString();
    this.value.updatedAt = this.value.finishedAt;
    this.value.cancellable = false;
    this.persist();
    try {
      await this.writes;
    } catch {
      this.value.error = {
        code: 'TASK_STORE_FAILED',
        message: '执行记录无法保存，请回读真实台账和 Git 结果；不要重复执行',
      };
      this.value.status = 'FAILED';
    }
    this.executing = false;
  }
  async cancel(id) {
    if (this.value?.id !== id || !this.job) fail('OPERATION_NOT_OWNED', '当前执行器不拥有这笔任务，不能在此取消');
    if (!this.busy()) return publicTask(this.value, true);
    if (!this.context.cancellable || this.value.status === 'STOP_UNCONFIRMED')
      fail('CANCEL_NOT_ALLOWED', '当前正在提交结果或执行同步恢复；请等待并回读真实结果');
    this.value.status = 'CANCELLING';
    this.value.cancellable = false;
    this.persist();
    this.controller.abort();
    return publicTask(this.value, true);
  }
  async close() {
    if (this.busy() && this.context?.cancellable) await this.cancel(this.value.id);
    await this.job;
  }
}
