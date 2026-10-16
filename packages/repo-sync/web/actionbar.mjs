import { continuationControls } from './continuation-view.mjs';
import { esc } from './ui.mjs';

function control(p, primary) {
  const tone = primary ? 'primary' : '';
  const label = esc(p.label);
  if (p.href)
    return `<a class="button ${tone}" href="${esc(p.href)}" target="_blank" rel="noopener">${label}</a>`;
  if (p.anchor)
    return `<a class="button ${tone}" href="#${esc(p.anchor)}" data-reveal="${esc(p.anchor)}">${label}</a>`;
  if (!p.action && !p.special) return '';
  const attribute = p.action ? `data-action="${esc(p.action)}"` : `data-${p.special}`;
  return `<button type="button" class="${tone}" ${attribute}>${label}</button>`;
}
export function actionBar(policy, historical, snapshot = {}) {
  if (historical) return '';
  const run = snapshot.state?.automation;
  const pause = run && ['RUNNING', 'WAITING_REVIEW'].includes(run.status) && !run.pauseRequested;
  const pauseStatus = run?.pauseRequested
    ? '<p role="status">已设置：本笔完成后暂停，下一笔不会自动开始。</p>'
    : '';
  return `<footer class="next-action" aria-label="当前操作区"><h2>当前操作与等待</h2><p role="status">${esc(policy.text)}</p>${pauseStatus}<div class="task-actions">${control(policy, true)}${policy.secondary ? control(policy.secondary, false) : ''}${pause ? '<button type="button" data-action="pause-sync">本笔完成后暂停</button>' : ''}</div>${autoMergeControls(snapshot)}<details><summary>本轮接收节奏</summary>${continuationControls(snapshot)}</details></footer>`;
}
function autoMergeControls(snapshot) {
  const run = snapshot.state?.automation;
  if (!run || run.status === 'COMPLETE') return '';
  const enabled = snapshot.config?.prTransport === 'gitlab' || snapshot.platform?.transport === 'gitlab';
  const delivery = snapshot.state?.active;
  const waiting = run.status === 'WAITING_REVIEW' && delivery?.status === 'WAITING_APPROVAL';
  return `<form class="auto-merge-choice" data-form="configure-auto-merge"><input type="hidden" name="runId" value="${esc(run.id)}"><input type="hidden" name="deliveryId" value="${esc(delivery?.id ?? '')}"><label><input type="checkbox" name="autoMerge" ${run.autoMerge === true ? 'checked' : ''} ${enabled ? '' : 'disabled data-preserve-disabled'}>本轮允许平台自动合入</label><p>默认关闭。仅在检查通过且平台审批 / 分支规则允许时请求合入；保留提交，不使用 squash。${waiting ? '保存后自动等待 CI 和平台条件，通过后才请求合入。' : ''}</p><button type="submit" ${enabled ? '' : 'disabled data-preserve-disabled'}>保存自动合入选择</button>${enabled ? '' : '<p>当前创建方式没有合入 API，请在本项目设置中配置兼容平台接口。</p>'}</form>`;
}
