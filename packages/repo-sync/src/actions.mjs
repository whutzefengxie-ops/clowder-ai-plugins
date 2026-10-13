import { baselineFile } from './baseline.mjs';
import { fail } from './config.mjs';
import { discover } from './github.mjs';

export async function dispatch(receiver, input) {
  if (
    input.deliveryId &&
    ['issue', 'prepare', 'pr', 'clear-pr', 'create-pr', 'resolve', 'recover', 'receipts'].includes(input.action) &&
    (await receiver.status())?.active?.id !== input.deliveryId
  )
    fail('DELIVERY_CHANGED', '活动交付已变化，请刷新后核对，不操作另一笔交付');
  const actions = {
    heads: () => receiver.store.locked(() => receiver.git.heads()),
    adopt: () => receiver.adopt(input.upstream, input.internal),
    discover: () => discover(receiver),
    start: () => receiver.start(),
    issue: () => receiver.linkIssue(input.sourceId, input.internalId, input.url, input),
    prepare: () => receiver.prepare(),
    pr: () => receiver.linkPr(input.url, input),
    'clear-pr': () => receiver.linkPr(null, input),
    'create-pr': () => receiver.createPr(),
    recover: () => receiver.recover(),
    receipts: () => receiver.receipts(input.observations),
    tags: () => receiver.tags(),
    'select-tag': () => receiver.selectTag(input.tag),
    'cancel-version': () => receiver.cancelVersion(),
    conflict: () => receiver.conflict(input.path),
    resolve: () => receiver.resolve(input.path, input.choice, input.content),
    'baseline-file': () => receiver.store.locked(() => baselineFile(receiver, input)),
  };
  if (!Object.hasOwn(actions, input.action)) fail('UNKNOWN_ACTION', '未知操作');
  return actions[input.action]();
}
