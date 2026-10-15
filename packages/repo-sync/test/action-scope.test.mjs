import assert from 'node:assert/strict';
import test from 'node:test';
import { guardRenderedScope, snapshotIdentity } from '../web/action-scope.mjs';
import { rememberExpansion, restoreExpansion } from '../web/expansion.mjs';

test('rendered action identity rejects another delivery, run, target or configuration', () => {
  const snapshot = {
    config: { bindingId: 'binding' },
    connection: { revision: 'r1' },
    state: { active: { id: 'delivery1' }, automation: { id: 'run1' }, queue: [{ target: 'a' }] },
  };
  const frozen = snapshotIdentity(snapshot);
  for (const mutate of [
    (s) => {
      s.state.active.id = 'delivery2';
    },
    (s) => {
      s.state.automation.id = 'run2';
    },
    (s) => {
      s.state.queue[0].target = 'b';
    },
    (s) => {
      s.connection.revision = 'r2';
    },
  ]) {
    const next = structuredClone(snapshot);
    mutate(next);
    assert.notEqual(snapshotIdentity(next), frozen);
  }
  snapshot.operation = { status: 'RUNNING' };
  assert.equal(snapshotIdentity(snapshot), frozen);
});
test('stale rendered forms cannot bypass the guard through direct authentication handlers', () => {
  const handlers = new Map();
  globalThis.document = {
    addEventListener: (kind, handler, capture) => {
      assert.equal(capture, true);
      handlers.set(kind, handler);
    },
  };
  try {
    const snapshot = { connection: { revision: 'new' } };
    let blocks = 0;
    guardRenderedScope(
      { dataset: { actionScope: 'old' }, contains: () => true },
      () => snapshot,
      () => blocks++,
    );
    for (const kind of ['click', 'submit']) {
      let prevented = false,
        stopped = false;
      handlers.get(kind)({
        target: { dataset: { secretForm: '' } },
        preventDefault: () => {
          prevented = true;
        },
        stopImmediatePropagation: () => {
          stopped = true;
        },
      });
      assert.ok(prevented && stopped);
    }
    assert.equal(blocks, 2);
  } finally {
    delete globalThis.document;
  }
});
test('expand-all is persisted for this delivery and remains open on a polling update', () => {
  const values = new Map();
  globalThis.sessionStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  try {
    const stages = [1, 2, 3, 4, 5].map((id) => ({
      dataset: { stage: String(id), stageState: id < 4 ? 'done' : 'current' },
      open: true,
    }));
    const content = { querySelectorAll: () => stages };
    rememberExpansion('delivery1', Object.fromEntries(stages.map((stage) => [stage.dataset.stage, true])));
    const snapshot = {
      config: { mode: 'continuous' },
      state: {
        active: { id: 'd1', status: 'WAITING_APPROVAL', prUrl: 'https://example.com/pr/1' },
        automation: { status: 'WAITING_REVIEW' },
      },
    };
    restoreExpansion(content, snapshot, 'current', 'delivery1');
    assert.ok(stages.every((stage) => stage.open));
    restoreExpansion(content, snapshot, 'current', 'delivery2');
    assert.equal(stages[0].open, false);
  } finally {
    delete globalThis.sessionStorage;
  }
});
