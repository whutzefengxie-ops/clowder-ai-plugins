export const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
export const sha = (value) => `<code title="${esc(value)}">${esc(value ?? '未记录')}</code>`;
export const when = (value) =>
  value ? esc(new Date(value).toLocaleString('zh-CN', { hour12: false, timeZoneName: 'short' })) : '未记录';
export const button = (action, label) =>
  `<button type="button" class="primary" data-action="${esc(action)}">${esc(label)}</button>`;
export const labels = {
  COMPLETE: '已完成',
  CANCELLED: '已撤销',
  ISSUES_REQUIRED: '准备代码',
  CODE_PREPARE_REQUIRED: '准备代码',
  PR_REQUIRED: '创建 PR',
  WAITING_APPROVAL: '等待审核合入',
  PUSH_RESULT_UNKNOWN: '推送结果待核对',
  CODE_ACCEPTED_PENDING_METADATA: 'Issue 接收记录待保存',
};
export const title = (delivery) =>
  delivery.source.tag ??
  (delivery.source.kind === 'commit'
    ? `主干提交 ${delivery.source.commit.slice(0, 12)}`
    : delivery.source.number
      ? `PR #${delivery.source.number}`
      : delivery.source.title);
export const stageOf = (delivery) =>
  ({
    ISSUES_REQUIRED: 2,
    CODE_PREPARE_REQUIRED: 2,
    PUSH_RESULT_UNKNOWN: 3,
    PR_REQUIRED: 3,
    WAITING_APPROVAL: 4,
    CODE_ACCEPTED_PENDING_METADATA: 5,
    COMPLETE: 5,
    CANCELLED: 2,
  })[delivery?.status] ?? 1;
