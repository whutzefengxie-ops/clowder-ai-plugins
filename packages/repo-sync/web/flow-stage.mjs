import { stageOf } from './ui.mjs';

export function boundaryDeliveryId(state) {
  return state?.automation?.status === 'PAUSED' ? state.automation.pauseRequested?.afterDeliveryId : null;
}
export function currentRecord(snapshot, records) {
  const id = snapshot.state?.active?.id ?? boundaryDeliveryId(snapshot.state);
  return records.selected !== 'current' || records.detail?.delivery?.id === id ? records.detail : null;
}
export function automaticMergeActive(delivery, run) {
  return (
    run?.autoMerge === true ||
    Boolean(
      delivery?.autoMerge?.requestedAt &&
        !delivery.autoMerge.requestRejected &&
        delivery.autoMerge.status !== 'MERGED',
    )
  );
}
export function stagePresentation(stage, delivery, current, failedStage = 0, run) {
  const failed = stage === failedStage;
  const merged = Boolean(delivery?.mergeObservation || delivery?.acceptedInternal);
  const done = delivery?.status === 'COMPLETE' || (stage === 4 && merged) || (stage < current && stage !== 4);
  const waiting = stage === 4 && stage === current && delivery?.prUrl && !failed;
  const state = failed
    ? 'failed'
    : done
      ? 'done'
      : waiting
        ? delivery.autoMerge?.manual || !automaticMergeActive(delivery, run)
          ? 'waiting-human'
          : 'waiting-system'
        : stage === current
          ? 'current'
          : 'pending';
  return {
    state,
    mark: {
      failed: '×',
      done: '✓',
      current: '◌',
      pending: '○',
      'waiting-human': '!',
      'waiting-system': '◷',
    }[state],
    tone: { failed: 'bad', done: 'good' }[state] ?? '',
    caption: {
      failed: '异常待处理',
      done: '已完成',
      current: '正在执行',
      pending: '待执行',
      'waiting-human': '等待人工',
      'waiting-system': '自动等待',
    }[state],
  };
}
export function currentStage(delivery, policy, historical = false) {
  return historical ? stageOf(delivery) : policy.stage || stageOf(delivery);
}
