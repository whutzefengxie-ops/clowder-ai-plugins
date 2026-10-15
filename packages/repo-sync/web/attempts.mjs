import { errorGuide } from './error-guide.mjs';
import { plannedSteps, businessStep, projectStep } from './step-plan.mjs';
import { taskProgress } from './task-progress.mjs';
import { esc, stageOf, when } from './ui.mjs';

const marks = { DONE: '✓', RUNNING: '●', FAILED: '×', PENDING: '○', WAITING: '●', UNRECORDED: '—', SKIPPED: '—' };
const states = {
  DONE: 'done',
  RUNNING: 'current',
  FAILED: 'failed',
  PENDING: 'pending',
  WAITING: 'current',
  UNRECORDED: 'unrecorded',
  SKIPPED: 'skipped',
};
const labels = {
  DONE: '已完成',
  RUNNING: '执行中',
  FAILED: '异常待处理',
  PENDING: '计划 · 尚未执行',
  WAITING: '等待人工审核',
  UNRECORDED: '执行证据未记录',
  SKIPPED: '不适用 · 本笔无关联 Issue',
};

export function attempts(stage, record, operation, historical, snapshot = {}) {
  const delivery = record?.delivery ?? snapshot.state?.active;
  const tasks = selectedTasks(record, operation, historical, delivery?.id);
  const version = (delivery?.mode ?? snapshot.config?.mode) === 'version';
  const groups = new Map(
    plannedSteps(stage, version).map(([key, label]) => [
      key,
      {
        key,
        label,
        status: historical || (delivery && stage < stageOf(delivery)) ? 'UNRECORDED' : 'PENDING',
        entries: [],
      },
    ]),
  );
  if (delivery && !delivery.issues?.length)
    for (const group of groups.values()) if (group.key.startsWith('issue-')) group.status = 'SKIPPED';
  for (const task of tasks) {
    const byId = new Map((task.steps ?? []).map((step) => [step.id, step]));
    for (const step of task.steps ?? []) {
      if (step.stage !== stage || (delivery?.id && step.deliveryId && step.deliveryId !== delivery.id)) continue;
      let parent = byId.get(step.parentId);
      const visited = new Set();
      while (parent && !groups.has(parent.key) && !visited.has(parent.id)) {
        visited.add(parent.id);
        parent = byId.get(parent.parentId);
      }
      const key = businessStep(stage, step.key ?? step.id, groups, parent?.key);
      groups.get(key)?.entries.push({ task, step });
    }
  }
  if (stage === 4 && delivery) {
    groups.set('platform-review', {
      key: 'platform-review',
      label: '在内部平台审核并合入',
      status: delivery.acceptedInternal ? 'DONE' : delivery.prUrl ? 'WAITING' : 'PENDING',
      entries: [],
    });
  }
  addUnscopedFailure(groups, tasks, stage, delivery);
  return `<ol class="substeps">${[...groups.values()].map((group) => stepView(group, stage)).join('')}</ol>${operationSlot(stage, operation, delivery, historical)}`;
}

function selectedTasks(record, operation, historical, deliveryId) {
  const tasks = [...(record?.tasks ?? [])];
  const owns = !deliveryId || operation?.deliveryId === deliveryId || operation?.deliveryIds?.includes(deliveryId);
  if (!historical && operation && owns) {
    const index = tasks.findIndex((task) => task.id === operation.id);
    if (index >= 0) tasks[index] = operation;
    else tasks.push(operation);
  }
  return tasks.sort((a, b) => (Date.parse(a.startedAt) || 0) - (Date.parse(b.startedAt) || 0));
}

function stepView(group, stage) {
  const { actual, latest, status } = projectStep(group);
  const label = group.label;
  const tone = status === 'FAILED' ? 'bad' : status === 'DONE' ? 'good' : '';
  const timing = latest
    ? `开始 ${when(latest.step.startedAt)} · 结束 ${when(latest.step.finishedAt)}`
    : group.key === 'platform-review'
      ? '平台审批时间未记录；实际合入结果由第五阶段核验。'
      : labels[status];
  const error = status === 'FAILED' ? errorGuide(latest?.step.error, { stage, action: latest?.task.action }) : '';
  return `<li data-step-key="${esc(group.key)}" data-operation-state="${esc(status)}" data-step-state="${states[status] ?? 'pending'}"><span class="${tone}">${marks[status] ?? '○'}</span> <b>${esc(label)}</b> · ${labels[status] ?? '状态未记录'}<small>${timing}</small>${latest ? taskProgress(latest.step, esc) : ''}${error}${actual.map(evidence).join('')}</li>`;
}

function evidence({ task, step }, index) {
  return `<details data-attempt="${esc(`${task.id}:${step.id}`)}" data-attempt-task="${esc(task.id)}"><summary>执行证据 ${index + 1} · ${labels[step.status] ?? '状态未记录'} · ${when(step.startedAt)}</summary><small>${esc(step.label)}<br>任务 ${esc(task.id)} · 开始 ${when(step.startedAt)} · 结束 ${when(step.finishedAt)}</small>${taskProgress(step, esc)}${step.error ? `<p class="bad">× ${esc(step.error.code)}：${esc(step.error.message)}</p>` : ''}</details>`;
}

function addUnscopedFailure(groups, tasks, stage, delivery) {
  for (const task of tasks) {
    if (task.persistence?.status === 'FAILED' && stage === 5) {
      const group = groups.get('execution-record') ?? { key: 'execution-record', entries: [] };
      group.entries.push({
        task,
        step: {
          id: 'execution-record',
          label: '保存原执行记录',
          status: 'FAILED',
          error: task.persistence.error,
        },
      });
      groups.set('execution-record', group);
    } else if (
      ['FAILED', 'INTERRUPTED', 'STOP_UNCONFIRMED'].includes(task.status) &&
      task.error &&
      !task.steps?.some((step) => step.status === 'FAILED')
    ) {
      const owner = task.steps?.findLast((step) => step.status === 'RUNNING')?.stage ?? stageOf(delivery);
      if (owner === stage)
        groups.get(businessStep(stage, 'task-result', groups))?.entries.push({
          task,
          step: {
            id: 'task-result',
            key: 'task-result',
            label: '核对原任务未完成结果',
            status: 'FAILED',
            error: task.error,
          },
        });
    }
  }
}

function operationSlot(stage, operation, delivery, historical) {
  if (historical || (delivery?.id && operation?.deliveryId && operation.deliveryId !== delivery.id)) return '';
  const current =
    operation?.persistence?.status === 'FAILED'
      ? 5
      : (operation?.steps?.findLast((step) => ['RUNNING', 'FAILED'].includes(step.status))?.stage ?? stageOf(delivery));
  return stage === current ? '<div id="operation" aria-live="polite"></div>' : '';
}
