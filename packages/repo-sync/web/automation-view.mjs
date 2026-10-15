import { esc, when } from './ui.mjs';

export function automationBanner(snapshot) {
  const run = snapshot.state?.automation;
  if (!run) return '';
  const version = snapshot.config.mode === 'version';
  const path = version
    ? '读取 tag → 保留内部文件并检查 → 自动创建 PR → 人工合入 → 自动核验与保存版本'
    : 'Issue 搬运 → 提交与检查 → 自动创建 PR → 人工合入 → 自动核验与关单 → 下一笔';
  const labels = {
    RUNNING: '自动执行中',
    WAITING_REVIEW: '等待你在内部平台审核合入',
    FAILED: '异常暂停 · 原记录可恢复',
    PAUSED: '已暂停自动继续',
    COMPLETE: '本轮自动同步完成',
  };
  const error = run.error ?? snapshot.observation?.error;
  return `<section class="card automation-status" role="status"><h3>${labels[run.status]}</h3><p>同步轮次 ${esc(run.id)} · 开始 ${when(run.startedAt)}<br>${path}</p>${run.status === 'WAITING_REVIEW' ? `<p>后台每 10 秒观察内部合入分支；无需手动核验，关闭页面仍会继续。最近检查 ${when(snapshot.observation?.lastCheckedAt)}</p>` : ''}${error ? `<p class="bad">× ${esc(error.code)}：${esc(error.message)}</p>` : ''}${['FAILED', 'PAUSED'].includes(run.status) ? `${snapshot.state.active ? '' : '<button type="button" class="primary" data-action="resume-sync">修复后恢复原同步</button>'}<button type="button" data-view="configuration">检查仓库与认证配置</button>` : ''}${['RUNNING', 'WAITING_REVIEW'].includes(run.status) ? '<button type="button" data-action="pause-sync">暂停后续自动处理</button>' : ''}</section>`;
}
export function automaticPolicy(snapshot, delivery) {
  const run = snapshot.state?.automation;
  if (!run || run.status === 'COMPLETE') return null;
  const reference = referenceRemedy(delivery);
  if (reference) return reference;
  if (['FAILED', 'PAUSED'].includes(run.status))
    return {
      stage: delivery?.acceptedInternal ? 5 : delivery?.candidate ? 3 : 2,
      text: '修正当前错误后恢复原轮次，保留已创建的 Issue、候选和 PR。',
      action: 'resume-sync',
      label: '恢复原同步 →',
    };
  if (run.status === 'WAITING_REVIEW')
    return {
      stage: 4,
      text:
        snapshot.config.mode === 'version'
          ? '只需在内部平台审核合入，后台自动核验并保存版本结果；此模式不搬运 Issue。'
          : '只需在内部平台审核合入。后台会自动核验、按接收条件关单，再处理下一笔。',
      href: delivery?.prUrl,
      label: '打开内部 PR ↗',
    };
  return {
    stage: delivery?.acceptedInternal ? 5 : delivery?.candidate ? 3 : 2,
    text: '系统正在自动执行，当前子步骤会在流程内显示。',
  };
}

export function preDeliveryFlow(snapshot) {
  const task = snapshot.operation;
  const current = task?.steps.findLast((step) => ['RUNNING', 'FAILED'].includes(step.status))?.stage || 1;
  const version = snapshot.config.mode === 'version';
  const names = [
    '读取目标与真实来源集合',
    version ? '保留内部文件、构造候选与检查' : '创建 Issue、构造候选与检查',
    '发布候选并自动创建 PR',
    '人工审核合入',
    version ? '自动核验与保存版本' : '自动核验、关单与保存映射',
  ];
  return `<ol class="journey-flow">${names.map((name, index) => `<li><details data-stage="${index + 1}" ${index + 1 === current ? 'open' : ''}><summary><span class="stage-mark">${index + 1 === current ? (task?.status === 'FAILED' ? '×' : '●') : '○'}</span><b>${index + 1} · ${name}</b></summary><div class="stage-body">${index + 1 === current ? '<div id="operation"></div><div id="error-slot"></div>' : '<p>此阶段将在前置步骤完成后自动继续，审核合入由你在内部 PR 完成。</p>'}</div></details></li>`).join('')}</ol>`;
}

function referenceRemedy(delivery) {
  if (
    delivery?.prReference?.withdrawn ||
    ['GIT_PR_LINK_UNKNOWN', 'GIT_PR_RESPONSE_AMBIGUOUS', 'PR_CREATE_RESULT_UNKNOWN'].includes(delivery?.error?.code)
  )
    return {
      stage: 3,
      text: '先核对平台中已经创建的 PR，补登记原对象后恢复；不会创建第二个 PR。',
      anchor: 'pr-form',
      label: '补登记原 PR 引用 →',
    };
  return null;
}
