import { stageOf } from './ui.mjs';

export function boundaryDeliveryId(state) {
  return state?.automation?.status === 'PAUSED' ? state.automation.pauseRequested?.afterDeliveryId : null;
}
export function currentRecord(snapshot, records) {
  const id = snapshot.state?.active?.id ?? boundaryDeliveryId(snapshot.state);
  return records.selected !== 'current' || records.detail?.delivery?.id === id ? records.detail : null;
}
export function stagePresentation(stage, delivery, current, failedStage = 0) {
  const failed = stage === failedStage;
  const done = delivery?.status === 'COMPLETE' || (stage < current && (stage !== 4 || delivery?.acceptedInternal));
  const state = failed ? 'failed' : done ? 'done' : stage === current ? 'current' : 'pending';
  return {
    state,
    mark: { failed: '×', done: '✓', current: '●', pending: '○' }[state],
    tone: { failed: 'bad', done: 'good' }[state] ?? '',
    caption:
      stage === 4 && current === 5 && !delivery?.acceptedInternal
        ? '合入结果核验中'
        : { failed: '异常待处理', done: '已完成', current: '当前步骤', pending: '待执行' }[state],
  };
}
export function currentStage(delivery, policy, historical = false) {
  return historical ? stageOf(delivery) : policy.stage || stageOf(delivery);
}
