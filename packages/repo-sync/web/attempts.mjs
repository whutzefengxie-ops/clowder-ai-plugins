import { esc, stageOf, when } from './ui.mjs';

const marks = { DONE: '✓', RUNNING: '●', FAILED: '×', PENDING: '○' };
export function attempts(stage, record, operation, historical) {
  const tasks = [...(record?.tasks ?? [])];
  if (!historical && operation && operation.deliveryId === record?.delivery.id) {
    const index = tasks.findIndex((task) => task.id === operation.id);
    if (index >= 0) tasks[index] = operation;
    else tasks.push(operation);
  }
  const selected = tasks.filter((task) => task.steps.some((step) => step.stage === stage));
  return (
    selected
      .map(
        (task) =>
          `<details data-attempt="${esc(task.id)}" ${['RUNNING', 'FAILED', 'INTERRUPTED'].includes(task.status) ? 'open' : ''}><summary>${esc(task.action)} · ${esc(task.status)} · ${when(task.startedAt)}</summary><small>任务 ${esc(task.id)} · 结束 ${when(task.finishedAt)}</small><ol class="attempt-steps">${task.steps
            .filter((step) => step.stage === stage)
            .map(
              (step) =>
                `<li class="${step.status === 'FAILED' ? 'bad' : step.status === 'DONE' ? 'good' : ''}" data-operation-state="${esc(step.status)}">${marks[step.status] ?? '○'} ${esc(step.label)}<small>${when(step.startedAt)} → ${when(step.finishedAt)}${step.progress ? ` · ${step.progress.percent}%（当前 Git 阶段）` : ''}</small>${step.error ? `<p class="bad">× ${esc(step.error.code)}：${esc(step.error.message)}</p>` : ''}</li>`,
            )
            .join('')}</ol></details>`,
      )
      .join('') +
    (!historical &&
    (operation?.deliveryId === record?.delivery.id || !operation?.deliveryId) &&
    stage ===
      (operation?.persistence?.status === 'FAILED'
        ? 5
        : operation?.steps.findLast((step) => step.status === 'RUNNING')?.stage || stageOf(record?.delivery))
      ? `<div id="operation" aria-live="polite">${operation?.persistence?.status === 'FAILED' ? `<h3>只补存执行记录</h3><p class="bad">× ${esc(operation.persistence.error.code)}：${esc(operation.persistence.error.message)}</p>` : ''}</div>`
      : '')
  );
}
