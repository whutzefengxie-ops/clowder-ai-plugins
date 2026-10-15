import { esc } from './ui.mjs';
export function continuationField(value = 'automatic') {
  return `<label>后续 PR 处理方式<select name="continuation"><option value="automatic" ${value === 'automatic' ? 'selected' : ''}>连续同步：本笔接收完成后自动开始下一笔</option><option value="after-each" ${value === 'after-each' ? 'selected' : ''}>每笔完成后暂停：确认继续才开始下一笔</option></select></label>`;
}
export function continuationControls(snapshot) {
  const run = snapshot.state?.automation;
  if (!run || run.status === 'COMPLETE') return '';
  const busy =
    ['RUNNING', 'CANCELLING', 'STOP_UNCONFIRMED'].includes(snapshot.operation?.status) ||
    snapshot.operation?.persistence?.status === 'FAILED';
  const boundary = run.status === 'PAUSED' && !snapshot.state.active;
  const accepted = Boolean(run.pauseRequested?.afterDeliveryId);
  return `<section class="continuation-controls"><h4>本轮接收节奏</h4><form data-form="configure-continuation"><input name="runId" type="hidden" value="${esc(run.id)}">${continuationField(run.continuation)}<button type="submit" ${busy ? 'disabled' : ''}>保存后续处理方式</button></form><p>${boundary ? (accepted ? '本笔核验、Issue 和接收记录已完成；当前等待你明确继续，不会自动启动下一笔。' : '本轮已暂停，尚未开始首笔交付；确认继续后才开始。') : run.pauseRequested ? '已安排本笔完成后暂停：仍等待此 PR 合入，并执行第五步核验、Issue 与结果保存；下一笔不会开始。' : '可以选择每笔完成后暂停；暂停不会撤销已创建的 PR。'}${busy ? '当前操作尚未结束，处理方式暂不能修改；执行结果确认后即可设置。' : ''}</p>${!run.pauseRequested && ['RUNNING', 'WAITING_REVIEW'].includes(run.status) ? `<button type="button" data-action="pause-sync" ${busy ? 'disabled' : ''}>本笔完成后暂停</button>` : ''}</section>`;
}
