import { fail } from './config.mjs';

const sha = (value) => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const pair = (value) => value && sha(value.upstream) && sha(value.internal);
export function assertLedger(state) {
  if (
    !pair(state.accepted) ||
    !pair(state.initial) ||
    !sha(state.latest) ||
    !Array.isArray(state.queue) ||
    !Array.isArray(state.events) ||
    !state.issues ||
    Array.isArray(state.issues) ||
    typeof state.issues !== 'object'
  )
    fail('LEDGER_INVALID', '台账缺少接受版本、队列或映射等必要字段；暂停，不能重建空台账');
  if (state.activeId !== null && typeof state.activeId !== 'string') fail('LEDGER_INVALID', '活动交付身份无效');
  const statuses = [
    'ISSUES_REQUIRED',
    'CODE_PREPARE_REQUIRED',
    'PUSH_RESULT_UNKNOWN',
    'PR_REQUIRED',
    'WAITING_APPROVAL',
    'CODE_ACCEPTED_PENDING_METADATA',
    'COMPLETE',
    'CANCELLED',
  ];
  const identities = new Set();
  for (const delivery of state.deliveries) {
    assertDelivery(delivery, identities, statuses);
    identities.add(delivery.id);
  }
  if (state.activeId !== null && !identities.has(state.activeId))
    fail('LEDGER_INVALID', '活动交付不存在，暂停；不能自动丢弃恢复状态');
  const pending = state.deliveries.filter((delivery) => !['COMPLETE', 'CANCELLED'].includes(delivery.status));
  if (pending.length > 1 || (pending.length === 1 && pending[0].id !== state.activeId))
    fail('LEDGER_INVALID', '未完成交付与活动身份不一致，暂停以防丢失恢复任务');
}
function assertDelivery(delivery, identities, statuses) {
  if (
    !delivery ||
    !/^[a-f0-9]{24}$/.test(delivery.id ?? '') ||
    identities.has(delivery.id) ||
    !statuses.includes(delivery.status) ||
    !pair(delivery.base) ||
    (delivery.candidate !== null && !sha(delivery.candidate))
  )
    fail('LEDGER_INVALID', '交付身份、状态或冻结基线无效，暂停；不可跳过原交付或重建台账');
  if (
    delivery.status === 'WAITING_APPROVAL' &&
    (!sha(delivery.candidate) ||
      !delivery.checks?.passed ||
      delivery.checks.head !== delivery.candidate ||
      typeof delivery.prUrl !== 'string' ||
      !delivery.prUrl.startsWith('https://'))
  )
    fail('LEDGER_INVALID', '等待审核缺少已检查候选或 PR 引用，暂停；不能展示为已就绪');
  if (['COMPLETE', 'CODE_ACCEPTED_PENDING_METADATA'].includes(delivery.status) && !sha(delivery.acceptedInternal))
    fail('LEDGER_INVALID', '接受状态缺少真实内部 commit，暂停核对原台账');
}
