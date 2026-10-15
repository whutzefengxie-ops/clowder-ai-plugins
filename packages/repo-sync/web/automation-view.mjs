import { actionBar } from './actionbar.mjs';
import { attempts } from './attempts.mjs';
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
  const progress = snapshot.journeyProgress;
  const count = progress
    ? `<p>${progress.total === null ? `已完整接收 ${esc(progress.completed)} 笔；总数尚未确定` : `已完整接收 ${esc(progress.completed)} / ${esc(progress.total)} 笔`} · 创建 PR 或代码已接收但元数据待处理不计完成。</p>`
    : '';
  return `<section class="card automation-status" role="status"><h3>${labels[run.status]}</h3><p>同步轮次 ${esc(run.id)} · 开始 ${when(run.startedAt)}<br>${path}</p>${count}${run.status === 'WAITING_REVIEW' ? `<p>后台每 10 秒观察内部合入分支；无需手动核验，关闭页面仍会继续。最近检查 ${when(snapshot.observation?.lastCheckedAt)}</p>` : ''}${error ? `<p class="bad">× ${esc(error.code)}：${esc(error.message)}</p>` : ''}${['RUNNING', 'WAITING_REVIEW'].includes(run.status) ? '<button type="button" data-action="pause-sync">暂停后续自动处理</button>' : ''}</section>`;
}
export function automaticPolicy(snapshot, delivery) {
  const run = snapshot.state?.automation;
  if (!run || run.status === 'COMPLETE') return null;
  const reference = referenceRemedy(delivery);
  if (reference) return reference;

  // 暂停和失败状态：保持在当前完成的阶段，不要跳回第 2 步
  if (['FAILED', 'PAUSED'].includes(run.status)) {
    // 确定实际完成到哪个阶段
    let completedStage = 1;
    if (delivery?.acceptedInternal) {
      completedStage = 5; // PR 已合入，在第 5 步
    } else if (delivery?.prUrl) {
      completedStage = 4; // PR 已创建，等待合入（第 4 步）
    } else if (delivery?.candidate) {
      completedStage = 3; // 候选已创建，在第 3 步
    } else if (delivery) {
      completedStage = 2; // 交付已开始，在第 2 步
    }

    return {
      stage: completedStage,
      text: '修正当前错误后恢复原轮次，保留已创建的 Issue、候选和 PR。',
      action: 'resume-sync',
      label: '恢复原同步 →',
    };
  }

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

  // RUNNING 状态：根据实际进展确定阶段
  return {
    stage: delivery?.acceptedInternal ? 5 : delivery?.prUrl ? 4 : delivery?.candidate ? 3 : 2,
    text: '系统正在自动执行，当前子步骤会在流程内显示。',
  };
}

export function preDeliveryFlow(snapshot, policy = automaticPolicy(snapshot, null)) {
  const task = snapshot.operation;
  const run = snapshot.state?.automation;

  // 确定当前阶段：优先使用 policy.stage，其次是任务中最后的 RUNNING/FAILED 步骤
  const current =
    task?.persistence?.status === 'FAILED'
      ? 5
      : policy?.stage ||
        task?.steps?.findLast((step) => ['RUNNING', 'FAILED'].includes(step.status))?.stage ||
        1;

  const version = snapshot.config.mode === 'version';
  const names = [
    '读取目标与真实来源集合',
    version ? '保留内部文件、构造候选与检查' : '创建 Issue、构造候选与检查',
    '发布候选并自动创建 PR',
    '人工审核合入',
    version ? '自动核验与保存版本' : '自动核验、关单与保存映射',
  ];

  // 计算每个阶段的完成状态
  const stageStatus = names.map((_, index) => {
    const stage = index + 1;
    const steps = task?.steps?.filter((step) => step.stage === stage) ?? [];
    const failed =
      stage === current &&
      (['FAILED', 'INTERRUPTED', 'STOP_UNCONFIRMED'].includes(task?.status) ||
        task?.persistence?.status === 'FAILED');
    const done = steps.length > 0 && steps.every((step) => step.status === 'DONE');

    // 明确的状态判断逻辑
    let status;
    if (failed) {
      status = 'failed';
    } else if (done) {
      status = 'done';
    } else if (stage === current) {
      status = 'current';
    } else if (stage < current) {
      // 前面的阶段应该是完成状态，除非没有步骤记录
      status = steps.length > 0 ? 'done' : 'skipped';
    } else {
      status = 'pending';
    }

    return { stage, name: names[index], status, failed, done, steps };
  });

  return `<ol class="journey-flow">${stageStatus
    .map(({ stage, name, status, failed, done }) => {
      const mark = failed ? '×' : done ? '✓' : stage === current ? '●' : '○';
      const tone = failed ? 'bad' : done ? 'good' : '';
      // 只有当前阶段或失败的阶段默认展开
      const shouldOpen = (stage === current && run?.status === 'RUNNING') || failed;

      return `<li><details data-stage="${stage}" data-stage-state="${status}" ${shouldOpen ? 'open' : ''}><summary><span class="stage-mark ${tone}">${mark}</span><b>${stage} · ${name}</b></summary><div class="stage-body"><div data-attempts-stage="${stage}">${attempts(stage, null, task, false, snapshot)}</div>${stage === current ? '<div id="error-slot"></div>' : ''}</div></details></li>`;
    })
    .join('')}</ol>${policy ? actionBar(policy, false) : ''}`;
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
