const labels = {
  RUNNING: '正在执行',
  CANCELLING: '正在停止进程树',
  STOP_UNCONFIRMED: '停止结果待确认',
  SUCCEEDED: '执行完成',
  FAILED: '执行失败',
  CANCELLED: '已取消',
  INTERRUPTED: '执行中断',
};
const names = {
  'Receiving objects': '接收对象',
  'Resolving deltas': '解析增量',
  'Counting objects': '统计对象',
  'Compressing objects': '压缩对象',
};
const actions = {
  heads: '两侧连接检查',
  adopt: '已有基线核验',
  prepare: '准备同步候选',
  recover: '核验并恢复原交付',
  tags: '读取上游 tag',
  discover: '读取上游交付',
  'select-tag': '核对目标版本',
  pr: '登记 / 纠正内部 PR 引用',
  'clear-pr': '撤销错误 PR 引用',
  'create-pr': '查询 / 自动创建内部 PR',
  start: '冻结并发起本次交付',
  issue: '登记 / 纠正 Issue 来源映射',
  receipts: '核对 Issue 接收记录',
  resolve: '保存冲突处理',
  'cancel-version': '撤销未发布版本',
};
const marks = { DONE: '✓', RUNNING: '●', FAILED: '×', PENDING: '○' };
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
function stepView(step) {
  const progress = step.progress
    ? `<small>${esc(names[step.progress.phase])} ${step.progress.percent}% · ${step.progress.completed}/${step.progress.total}</small>`
    : '';
  const error = step.error ? `<small>× ${esc(step.error.code)}：${esc(step.error.message)}</small>` : '';
  return `<li data-operation-state="${esc(step.status)}" class="${step.status === 'FAILED' ? 'bad' : step.status === 'DONE' ? 'good' : ''}">${marks[step.status] ?? '○'} ${esc(step.label)}${progress}${error}</li>`;
}
export function renderTask(task) {
  if (!task) return '';
  const end = task.finishedAt ? Date.parse(task.finishedAt) : Date.now();
  const elapsed = Math.max(0, Math.floor((end - Date.parse(task.startedAt)) / 1000));
  const badge = `${esc(labels[task.status] ?? task.status)} · ${elapsed} 秒`;
  const steps = `<ol class="operation-steps">${task.steps.map(stepView).join('')}</ol>`;
  const error = errorView(task);
  const cancel = task.cancellable
    ? `<button type="button" data-cancel-operation>${task.action === 'prepare' ? '取消候选准备' : '取消当前读取 / 下载'}</button>`
    : '';
  const waiting =
    task.status === 'CANCELLING'
      ? '<p>确认进程树退出后才释放执行锁，请等待。</p>'
      : task.status === 'RUNNING'
        ? '<p>正在查询原任务。可以切换页面查看信息，修改配置和重复执行暂时锁定。</p>'
        : '';
  const heads = task.result?.upstream
    ? `<p>外部当前：<code>${esc(task.result.upstream)}</code><br>内部当前：<code>${esc(task.result.internal)}</code></p>`
    : '';
  const retry =
    task.action === 'heads' && task.status === 'FAILED'
      ? '<button type="button" data-action="heads">重新检查两侧连接</button>'
      : '';
  const detail = `${steps}${error}${cancel}${waiting}${heads}${retry}<small>任务 ${esc(task.id)}；百分比属于当前 Git 下载阶段。</small>`;
  if (task.persistence?.status === 'FAILED') return recordPending(task, detail);
  if (task.status === 'SUCCEEDED')
    return `<section class="card"><details><summary>✓ ${esc(actions[task.action])}完成 · ${elapsed} 秒 · 查看执行记录</summary>${detail}</details></section>`;
  return `<section class="card task"><span class="badge">${badge}</span><h2>${esc(actions[task.action])}</h2>${detail}</section>`;
}
function recordPending(task, detail) {
  const repair = task.persistence.canRetry
    ? '<button type="button" data-persist-operation>只补存原任务记录</button>'
    : '<p>请回到拥有该任务的执行器核对，不能在这里重跑业务。</p>';
  return `<section class="card task"><span class="badge">记录待保存 · 业务状态：${esc(labels[task.status])}</span><h2 class="bad">只补存执行记录</h2><p class="bad">× ${esc(task.persistence.error.code)}：${esc(task.persistence.error.message)}</p>${repair}${detail}</section>`;
}
function errorView(task) {
  if (
    !task.error ||
    task.steps.some((step) => step.error?.code === task.error.code && step.error.message === task.error.message)
  )
    return '';
  return `<p class="bad">× ${esc(task.error.code)}：${esc(task.error.message)}</p>`;
}
