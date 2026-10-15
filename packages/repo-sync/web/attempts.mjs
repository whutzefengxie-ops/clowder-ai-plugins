import { errorGuide } from './error-guide.mjs';
import { taskProgress } from './task-progress.mjs';
import { esc, stageOf, when } from './ui.mjs';

const marks = { DONE: '✓', RUNNING: '●', FAILED: '×', PENDING: '○', WAITING: '●', UNRECORDED: '—' };
const states = {
  DONE: 'done',
  RUNNING: 'current',
  FAILED: 'failed',
  PENDING: 'pending',
  WAITING: 'current',
  UNRECORDED: 'unrecorded',
};
const labels = {
  DONE: '已完成',
  RUNNING: '执行中',
  FAILED: '异常待处理',
  PENDING: '计划 · 尚未执行',
  WAITING: '等待人工审核',
  UNRECORDED: '执行证据未记录',
};

export function attempts(stage, record, operation, historical, snapshot = {}) {
  const delivery = record?.delivery ?? snapshot.state?.active;
  const tasks = selectedTasks(record, operation, historical, delivery?.id);
  const groups = new Map();
  for (const task of tasks)
    for (const step of task.steps ?? []) {
      if (step.stage !== stage || (delivery?.id && step.deliveryId && step.deliveryId !== delivery.id)) continue;
      const key = step.key ?? step.id;
      const identity = `${key}${key.startsWith('issue-') ? `:${step.label.match(/#\d+/)?.[0] ?? ''}` : ''}`;
      if (!groups.has(identity)) groups.set(identity, { key, entries: [] });
      groups.get(identity).entries.push({ task, step });
    }
  for (const [key, label] of planned(stage, delivery, snapshot))
    if (![...groups.values()].some((group) => group.key === key))
      groups.set(key, {
        key,
        label,
        status: historical || (delivery && stage < stageOf(delivery)) ? 'UNRECORDED' : 'PENDING',
        entries: [],
      });
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
  const actual = group.entries.filter(({ step }) => step.startedAt || step.status !== 'PENDING');
  const latest = actual.at(-1) ?? group.entries.at(-1);
  const status = latest?.step.status ?? group.status;
  const label = latest?.step.label ?? group.label;
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
  return `<details data-attempt="${esc(`${task.id}:${step.id}`)}" data-attempt-task="${esc(task.id)}"><summary>执行证据 ${index + 1} · ${labels[step.status] ?? '状态未记录'} · ${when(step.startedAt)}</summary><small>任务 ${esc(task.id)} · 开始 ${when(step.startedAt)} · 结束 ${when(step.finishedAt)}</small>${taskProgress(step, esc)}${step.error ? `<p class="bad">× ${esc(step.error.code)}：${esc(step.error.message)}</p>` : ''}</details>`;
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
        groups.set('task-result', {
          key: 'task-result',
          entries: [
            {
              task,
              step: {
                id: 'task-result',
                label: '核对原任务未完成结果',
                status: 'FAILED',
                error: task.error,
              },
            },
          ],
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

function planned(stage, delivery, snapshot) {
  const version = (delivery?.mode ?? snapshot.config?.mode) === 'version';
  const issues = !version && (!delivery || delivery.issues?.length);
  return (
    {
      1: [
        ['target-check', '解析目标并核对历史与来源范围'],
        ...(!version ? [['github-deliveries', '读取真实 PR、主干提交与 Issue 来源']] : []),
      ],
      2: [
        ...(issues ? [['issue-create', '创建 / 复用并回读内部 Issue']] : []),
        ['candidate-build', '准备提交映射、保留内部范围并构造候选'],
        ['candidate-check', '执行配置的候选检查'],
      ],
      3: [
        ['publish-intent', '保存原发布意图'],
        ['candidate-publish', '推送原候选分支'],
        ['candidate-ref', '回读候选 ref'],
        ['platform-pr', '创建 / 回读原内部 PR'],
        ...(issues ? [['issue-link', '关联并回读内部 Issue 与 PR']] : []),
      ],
      4: [['platform-review', '在内部平台审核并合入']],
      5: [
        ['merge-verify', '核验实际合入的核心文件与历史'],
        ...(issues ? [['issue-state', '核对接收条件、更新应关闭的 Issue 并回读']] : []),
        ['acceptance-save', '保存本笔接收结果'],
        ['execution-record', '保存原执行记录'],
      ],
    }[stage] ?? []
  );
}
