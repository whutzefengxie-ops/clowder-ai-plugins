import { actionBar } from './actionbar.mjs';
import { attempts } from './attempts.mjs';
import { facts } from './stage-facts.mjs';
export { attempts, actionBar };

import { nextAction } from './action-policy.mjs';
import { diagnostics } from './diagnostics.mjs';
import { issueForms } from './issues.mjs';
import { prPanel } from './pr.mjs';
import { receiptFields } from './receipts.mjs';
import { esc, labels, sha, stageOf, title, when } from './ui.mjs';
import { conflictOptions } from './version.mjs';

const names = ['确认同步范围', '准备代码', '发布候选与创建 PR', '内部审核合入', '核验并保存结果'];

export function workflow(snapshot, record, historical) {
  const delivery = record?.delivery ?? snapshot.state.active;
  const policy = nextAction(snapshot, delivery, historical);
  const current = stageOf(delivery);
  const failure = stageFailure(snapshot, delivery, historical);
  const failedStage = failure?.stage ?? 0;
  return `<div class="detail-head"><span class="badge">${historical ? '历史记录 · 只读' : '当前同步'}</span><h2>${esc(title(delivery))} · ${esc(labels[delivery.status] ?? delivery.status)}</h2><p>同步标识 ${esc(delivery.id)}<br>开始 ${when(delivery.startedAt)} · 结束 ${when(delivery.finishedAt)}</p><p>外部 ${sha(delivery.base.upstream)} → ${sha(delivery.target)}<br>内部 ${sha(delivery.base.internal)} → ${sha(delivery.acceptedInternal ?? '待接受')}</p>${historical ? '<button type="button" data-record="current">返回当前同步</button>' : ''}<button type="button" data-expand-all>展开全部阶段</button></div>${record?.legacy ? '<p class="record-gap">此为旧记录：未记录的时间、配置或任务关联保持“未记录”，不会用当前配置补齐。</p>' : ''}${record?.missingTasks.length ? `<p class="record-gap bad">× ${record.missingTasks.length} 份关联执行记录缺失。业务结果保留，不能补造时间线。</p>` : ''}<ol class="journey-flow">${names
    .map((name, index) =>
      stageView(index + 1, name, snapshot, record, delivery, historical, policy, current, failedStage, failure),
    )
    .join('')}</ol>${actionBar(policy, historical)}`;
}
function substeps(stage, d, record, snapshot) {
  const mapped = d.issues.every((issue) =>
    record?.current
      ? snapshot.state.issues[issue.sourceId]
      : record?.issues.find((item) => item.sourceId === issue.sourceId)?.mapping,
  );
  const groups = {
    1: [['冻结目标、范围与 U0 / I0', true]],
    2: [
      [d.mode === 'version' ? '核对文件规则与内部差异' : '登记内部 Issue 映射', d.mode === 'version' || mapped],
      [d.mode === 'version' ? '保留内部文件、三方合并并构造候选' : '获取原始提交并构造候选', Boolean(d.candidate)],
      [
        (d.checks?.profile ??
          record?.configurations.at(-1)?.snapshot.checkProfile ??
          (record?.current ? snapshot.config.checkProfile : null)) === 'git-integrity'
          ? 'Git 基础完整性检查'
          : '配置的项目检查（以当时结果为准）',
        Boolean(d.checks?.passed),
      ],
    ],
    3: [
      [
        '保存原发布意图',
        Boolean(
          d.gitPr ||
            (d.candidate &&
              ['PR_REQUIRED', 'WAITING_APPROVAL', 'CODE_ACCEPTED_PENDING_METADATA', 'COMPLETE'].includes(d.status)),
        ),
      ],
      [
        '推送候选并回读 ref',
        ['PR_REQUIRED', 'WAITING_APPROVAL', 'CODE_ACCEPTED_PENDING_METADATA', 'COMPLETE'].includes(d.status),
      ],
      ['创建 / 登记内部 PR 引用', Boolean(d.prUrl)],
    ],
    4: [['在平台审核并合入（Git 结果核验后确认）', Boolean(d.acceptedInternal)]],
    5: [
      ['核验 main 的 tree 与历史', Boolean(d.acceptedInternal)],
      ['保存内外 commit / tag 对应', Boolean(d.acceptedInternal)],
      ...(d.mode === 'version' ? [] : [['核对 Issue 实际状态并保存接收记录', d.status === 'COMPLETE']]),
      ['保存本笔结果与执行记录', d.status === 'COMPLETE'],
    ],
  };
  let found = false;
  return `<ul class="substeps">${groups[stage]
    .map(([name, done]) => {
      const current = !done && !found && stage === stageOf(d);
      if (!done) found = true;
      const status = majorStatus(current && !!d.error, done, current);
      const mark = { failed: '×', done: '✓', current: '●', pending: '○' }[status];
      const tone = { failed: 'bad', done: 'good' }[status] ?? '';
      return `<li data-step-state="${status}"><span class="${tone}">${mark}</span> ${name}</li>`;
    })
    .join('')}</ul>`;
}
function stageForm(stage, delivery, snapshot) {
  if (stage === 2 && delivery.status === 'CODE_PREPARE_REQUIRED')
    return `${conflictOptions(delivery)}<button type="button" data-action="cancel-version">撤销未发布交付，重新选择版本</button><p>历史保留，已发布候选不能直接撤销。</p>`;
  if (stage === 2 && delivery.status === 'ISSUES_REQUIRED')
    return `<div id="issue-mappings">${issueForms(delivery, snapshot.state, esc)}</div>`;
  if (stage === 3 && ['PR_REQUIRED', 'WAITING_APPROVAL'].includes(delivery.status)) return prPanel(snapshot, esc);
  if (stage === 5 && delivery.status === 'CODE_ACCEPTED_PENDING_METADATA')
    return `<div id="receipt-form"><form data-form="receipts"><h3>确认平台实际状态并保存接收记录</h3>${receiptFields(delivery, snapshot.state, esc, sha)}<button type="submit" class="primary">保存本笔接收记录，完成同步</button><p>此操作记录人工核对结果，不向内部平台发送关单请求。</p></form></div>`;
  return '';
}

function stageView(stage, name, snapshot, record, delivery, historical, policy, current, failedStage, failure) {
  const failed = stage === failedStage;
  const done = delivery.status === 'COMPLETE' || (stage < current && !failed);
  const status = majorStatus(failed, done, stage === current);
  const mark = { failed: '×', done: '✓', current: '●', pending: '○' }[status];
  const tone = { failed: 'bad', done: 'good' }[status] ?? '';
  const caption = { failed: '异常待处理', done: '已完成', current: '当前步骤', pending: '待执行' }[status];
  const open = stage === (historical ? 1 : policy.stage || current) ? 'open' : '';

  return `<li><details data-stage="${stage}" data-stage-state="${status}" ${open}><summary><span class="stage-mark ${tone}">${mark}</span><b>${stage} · ${name}</b><span>${caption}</span></summary><div class="stage-body">${substeps(stage, delivery, record, snapshot)}${stageError(stage, failedStage, failure, historical, snapshot)}${facts(stage, delivery, record, historical, snapshot)}<div data-attempts-stage="${stage}">${attempts(stage, record, snapshot.operation, historical)}</div>${editableStage(stage, delivery, snapshot, historical)}${errorSlot(stage, historical, policy)}${moreTasks(stage, record)}</div></details></li>`;
}
function majorStatus(failed, done, current) {
  if (failed) return 'failed';
  if (done) return 'done';
  if (current) return 'current';
  return 'pending';
}
function stageError(stage, failedStage, failure, historical, snapshot) {
  if (stage !== failedStage || !failure) return '';
  return `<p class="bad" role="alert">× ${esc(failure.error.code)}：${esc(failure.error.message)}</p>${historical ? '' : diagnostics(failure.error, snapshot, esc)}`;
}
function editableStage(stage, delivery, snapshot, historical) {
  return historical ? '' : stageForm(stage, delivery, snapshot);
}
function errorSlot(stage, historical, policy) {
  return !historical && stage === policy.stage ? '<div id="error-slot"></div>' : '';
}
function moreTasks(stage, record) {
  return stage === 5 && record?.taskPage.hasMore
    ? '<button type="button" data-more-tasks>加载更早的执行记录</button>'
    : '';
}

function stageFailure(snapshot, delivery, historical) {
  const task = snapshot.operation;
  if (!historical && task?.deliveryId === delivery.id) {
    if (task.persistence?.status === 'FAILED') return { stage: 5, error: task.persistence.error };
    if (task.status === 'FAILED' && task.error)
      return {
        stage: task.steps.findLast((step) => step.status === 'FAILED')?.stage || nextAction(snapshot, delivery).stage,
        error: task.error,
      };
  }
  return delivery.error ? { stage: nextAction(snapshot, delivery).stage, error: delivery.error } : null;
}
