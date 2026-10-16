import assert from 'node:assert/strict';
import test from 'node:test';
import { synchronize } from '../src/automation.mjs';
import { Receiver } from '../src/engine.mjs';
import { runExecution } from '../src/execution.mjs';
import { setIssueToken } from '../src/issue-auth.mjs';
import { codehubPlatform } from './codehub-fixture.mjs';
import { repositories } from './fixtures.mjs';

async function fixture(t, lost) {
  const f = await repositories(), p = await codehubPlatform(f, { lost });
  t.after(p.close);
  const adapter = { mode: 'gitlab', apiUrl: p.api, projectId: 'team/core', authMode: 'session' };
  const config = { ...f.config, internalWebUrl: p.web, issues: adapter, pullRequests: { ...adapter }, commitStrategy: 'rewrite' };
  const receiver = new Receiver(config);
  setIssueToken(receiver.config, p.token, 'test');
  await receiver.adopt(f.u0, f.i0);
  await receiver.setQueue(f.plans);
  return { ...f, p, receiver, config };
}
const run = (receiver, autoMerge) => synchronize(receiver, { action: 'synchronize', requestId: 'a'.repeat(32), continuation: 'after-each', ...(autoMerge === undefined ? {} : { autoMerge }) });

test('automatic merge is off by default and opt-in merges one checked PR per explicit boundary', async (t) => {
  const f = await fixture(t);
  await run(f.receiver);
  assert.equal(f.p.state.merges, 0);
  assert.equal((await f.receiver.status()).active.status, 'WAITING_APPROVAL');
  const g = await fixture(t);
  await run(g.receiver, true);
  let state = await g.receiver.status();
  assert.equal(g.p.state.merges, 1);
  assert.equal(state.deliveries[0].status, 'COMPLETE');
  assert.equal(state.automation.status, 'PAUSED');
  assert.equal(g.p.state.creates.prs, 1);
  await synchronize(g.receiver, { action: 'resume-sync', runId: state.automation.id });
  state = await g.receiver.status();
  assert.equal(g.p.state.merges, 2);
  assert.equal(g.p.state.closes, 1);
  assert.equal(state.deliveries[1].status, 'COMPLETE');
});

test('enabling automatic merge for an already waiting PR completes that delivery before its pause boundary', async (t) => {
  const f = await fixture(t);
  await run(f.receiver);
  let state = await f.receiver.status();
  assert.equal(state.automation.status, 'WAITING_REVIEW');
  assert.equal(f.p.state.merges, 0);

  await synchronize(f.receiver, {
    action: 'configure-auto-merge',
    runId: state.automation.id,
    deliveryId: state.active.id,
    autoMerge: true,
  });
  await synchronize(f.receiver, { action: 'resume-sync', runId: state.automation.id });

  state = await f.receiver.status();
  assert.equal(f.p.state.merges, 1);
  assert.equal(state.deliveries[0].status, 'COMPLETE');
  assert.equal(state.automation.status, 'PAUSED');
  assert.equal(state.queue.length, 1, 'the boundary pauses before starting the next delivery');
});

test('automation can save its run state after the bound delivery becomes terminal', async (t) => {
  const f = await fixture(t);
  await run(f.receiver);
  const state = await f.receiver.status();
  const context = {
    signal: new AbortController().signal,
    deliveryId: state.active.id,
    report() {},
    associate(id) {
      this.deliveryId = id;
    },
  };
  await synchronize(f.receiver, {
    action: 'configure-auto-merge',
    runId: state.automation.id,
    deliveryId: state.active.id,
    autoMerge: true,
  });

  await runExecution(context, () => synchronize(f.receiver, { action: 'resume-sync', runId: state.automation.id }));

  const result = await f.receiver.status();
  assert.equal(f.p.state.merges, 1);
  assert.equal(result.deliveries[0].status, 'COMPLETE');
  assert.equal(result.automation.status, 'PAUSED');
});

test('a lost applied merge receipt recovers after restart by reading the same PR and Git result', async (t) => {
  const f = await fixture(t, 'merge');
  await assert.rejects(() => run(f.receiver, true), { code: 'PR_API_UNAVAILABLE' });
  assert.equal(f.p.state.merges, 1);
  const receiver = new Receiver(f.config), state = await receiver.status();
  await synchronize(receiver, { action: 'resume-sync', runId: state.automation.id });
  assert.equal((await receiver.status()).deliveries[0].status, 'COMPLETE');
  assert.equal(f.p.state.merges, 1);
});

test('platform merge restrictions never become direct Git pushes or successful acceptance', async (t) => {
  const f = await fixture(t);
  f.p.state.denyMerge = true;
  await assert.rejects(() => run(f.receiver, true), { code: 'PR_API_REJECTED' });
  const state = await f.receiver.status();
  assert.equal(state.accepted.internal, f.i0);
  assert.equal(state.automation.status, 'FAILED');
  assert.equal(f.p.state.merges, 0);
  assert.equal(f.p.state.creates.prs, 1);
});
