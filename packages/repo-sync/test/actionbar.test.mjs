import assert from 'node:assert/strict';
import test from 'node:test';
import { actionBar } from '../web/actionbar.mjs';

const policy = { text: '等待内部 PR 审核', label: '打开 PR', href: 'https://codehub.example/pull/1' };

test('pause-after-current-delivery is a primary visible workbench action while a PR awaits review', () => {
  const html = actionBar(policy, false, {
    state: { automation: { id: 'run-1', status: 'WAITING_REVIEW' }, active: { id: 'delivery-1', status: 'WAITING_APPROVAL' } },
    config: { prTransport: 'manual' },
  });
  const pauseAt = html.indexOf('data-action="pause-sync"');
  assert.notEqual(pauseAt, -1);
  assert.ok(pauseAt < html.indexOf('<details>'), 'pause is outside the collapsed cadence settings');
  assert.match(html, /本笔完成后暂停/);
  assert.equal((html.match(/data-action="pause-sync"/g) ?? []).length, 1);
});

test('historical runs and already paused runs do not show a live pause action', () => {
  const snapshot = { state: { automation: { id: 'run-1', status: 'PAUSED' } } };
  assert.equal(actionBar(policy, true, snapshot), '');
  assert.doesNotMatch(actionBar(policy, false, snapshot), /data-action="pause-sync"/);
});
