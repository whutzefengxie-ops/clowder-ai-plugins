import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture } from './service-fixture.js';

function analysisFixture() {
  const f = fixture();
  const effects: string[] = [];
  const thread = { id: 'diagnostic-thread', title: '反馈分析', projectRef: f.host.dataPath, deepLinkUrl: 'https://local.test/thread/diagnostic-thread' };
  Object.assign(f.host, {
    runtimeInfo: { get: async () => ({ version: 'test', platform: 'win32', architecture: 'x64', nodeVersion: '22', projectRoot: f.host.dataPath, logDirectory: f.host.dataPath }) },
    members: { list: async () => [{ catId: 'configured-cat', displayName: '本地伙伴', available: true, defaultModel: 'configured-model' }], get: async () => ({ catId: 'configured-cat', available: true }) },
    threads: { list: async () => [], get: async () => thread, create: async (input: { projectRef?: string }) => { effects.push(`create:${input.projectRef}`); return thread; } },
    messaging: { subscribe: async () => { effects.push('subscribe'); }, unsubscribe: async () => { effects.push('unsubscribe'); }, send: async (input: { wake: { catId: string }; payload: unknown }) => { effects.push(`wake:${input.wake.catId}`); return { messageId: 'request-message', threadId: thread.id }; } },
  });
  const call = (input: unknown) => f.service.dispatch(input, f.ctx) as Promise<Record<string, unknown>>;
  return { ...f, effects, call, thread };
}

test('analysis uses the configured ordinary member, returns promptly and survives reopening', async () => {
  const f = analysisFixture();
  const prepared = await f.call({ op: 'prepare-analysis', report: { title: '启动失败', body: 'api_key=private-value', attachments: [] }, projectRef: f.host.dataPath });
  assert.ok(!String(prepared.material).includes('private-value'));
  assert.deepEqual(f.effects, [`create:${f.host.dataPath}`]);
  const started = await f.call({ op: 'analyze', clientId: 'configured-cat', hash: prepared.hash, confirmed: true });
  assert.equal((started.analysis as { state: string }).state, 'running');
  assert.deepEqual(f.effects, [`create:${f.host.dataPath}`, 'subscribe', 'wake:configured-cat']);
  const reopened = await f.call({ op: 'bootstrap' });
  assert.equal((reopened.analysis as { state: string }).state, 'running');
  assert.deepEqual(await f.service.receiveDelivery({ kind: 'execution_status', deliveryId: 'start', threadId: f.thread.id, state: 'started', replyTo: 'request-message', executionId: 'execution-1' }), { deliveryId: 'start' });
  await f.service.receiveDelivery({ kind: 'message', deliveryId: 'answer', threadId: f.thread.id, executionId: 'execution-1', envelope: { actor: { kind: 'cat', id: 'configured-cat' }, payload: { elements: [{ kind: 'text', payload: { text: JSON.stringify({ title: '启动失败', body: '## 初步分析\n尚未定位。token=private-output' }) } }] } } });
  const waiting = await f.call({ op: 'analysis-status' });
  assert.equal((waiting.analysis as { state: string }).state, 'running');
  await f.service.receiveDelivery({ kind: 'execution_status', deliveryId: 'end', threadId: f.thread.id, state: 'settled', chainDone: true, outcome: 'completed', executionId: 'execution-1' });
  const result = (await f.call({ op: 'analysis-status' })).analysis as { state: string; body: string };
  assert.equal(result.state, 'ready');
  assert.ok(!result.body.includes('private-output'));
});

test('missing reports and late results are explicit; direct feedback remains independent', async () => {
  const f = analysisFixture();
  const prepared = await f.call({ op: 'prepare-analysis', report: { title: '失败', body: '无法运行', attachments: [] } });
  await f.call({ op: 'analyze', clientId: 'configured-cat', hash: prepared.hash, confirmed: true });
  await f.service.receiveDelivery({ kind: 'execution_status', deliveryId: 'start', threadId: f.thread.id, state: 'started', replyTo: 'request-message', executionId: 'execution-2' });
  await f.service.receiveDelivery({ kind: 'execution_status', deliveryId: 'end', threadId: f.thread.id, state: 'settled', chainDone: true, outcome: 'completed', executionId: 'execution-2' });
  assert.equal(((await f.call({ op: 'analysis-status' })).analysis as { state: string }).state, 'failed');
  await f.call({ op: 'cancel-analysis' });
  await f.service.receiveDelivery({ kind: 'execution_status', deliveryId: 'late', threadId: f.thread.id, state: 'started', replyTo: 'request-message', executionId: 'old' });
  assert.equal(((await f.call({ op: 'analysis-status' })).analysis as { state: string }).state, 'cancelled');
  await f.call({ op: 'save', targetId: 'clowder', report: { title: '直接反馈', body: '不依赖分析', attachments: [] } });
});

test('plugin collects bounded log evidence and redacts it before any member invocation', async () => {
  const f = analysisFixture();
  await mkdir(f.host.dataPath, { recursive: true });
  await writeFile(join(f.host.dataPath, 'api.log'), JSON.stringify({ time: Date.now(), level: 50, msg: 'E_TIMEOUT api_key=private-log', err: { stack: 'stack-canary' } }));
  await writeFile(join(f.host.dataPath, 'auth.json'), 'credential-file-canary');
  const prepared = await f.call({ op: 'prepare-analysis', report: { title: '启动失败', body: '用户现象', attachments: [] }, logs: true });
  assert.match(String(prepared.material), /E_TIMEOUT/);
  assert.ok(!/private-log|stack-canary|credential-file-canary/.test(String(prepared.material)));
  await assert.rejects(f.call({ op: 'analyze', clientId: 'configured-cat', hash: prepared.hash }), /确认/);
  assert.ok(!f.effects.some(effect => effect.startsWith('wake:')));
});

test('a broken Client subscription cannot block reopening direct feedback', async () => {
  const f = analysisFixture();
  const prepared = await f.call({ op: 'prepare-analysis', report: { title: '失败', body: '无法运行', attachments: [] } });
  await f.call({ op: 'analyze', clientId: 'configured-cat', hash: prepared.hash, confirmed: true });
  f.host.messaging!.subscribe = async () => { throw new Error('subscriber unavailable'); };
  const reopened = await f.call({ op: 'bootstrap' });
  assert.ok(Array.isArray(reopened.targets));
  assert.equal((reopened.analysis as { state: string }).state, 'failed');
  await f.call({ op: 'save', targetId: 'clowder', report: { title: '直接反馈', body: '无需可用 Client', attachments: [] } });
});
