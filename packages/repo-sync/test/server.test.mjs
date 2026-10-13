import assert from 'node:assert/strict';
import { request } from 'node:http';
import test from 'node:test';
import { createReceiverServer } from '../src/server.mjs';

test('localhost API rejects foreign Origin, foreign Host, missing tokens and arbitrary actions', async () => {
  const receiver = { config: { sourceUrl: 'https://github.com/demo/core.git' }, status: async () => null };
  const server = createReceiverServer(receiver);
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const bootstrap = await fetch(`${base}/api/status`).then((response) => response.json());
    const foreignHost = await new Promise((done, reject) => {
      const probe = request(`${base}/api/status`, { headers: { Host: 'attacker.example' } }, (response) => {
        response.resume();
        done(response.statusCode);
      });
      probe.on('error', reject);
      probe.end();
    });
    assert.equal(foreignHost, 403);
    assert.equal((await fetch(`${base}/api/status`, { headers: { Origin: 'https://attacker.example' } })).status, 403);
    assert.equal((await fetch(`${base}/api/action`, { method: 'POST', body: '{}' })).status, 403);
    const headers = { 'X-Repo-Sync-Token': bootstrap.token };
    const unknown = await fetch(`${base}/api/action`, { method: 'POST', headers, body: '{"action":"constructor"}' });
    assert.equal(unknown.status, 409);
    assert.equal((await unknown.json()).code, 'UNKNOWN_ACTION');
    assert.equal((await fetch(`${base}/api/action`, { method: 'POST', headers, body: 'x'.repeat(65537) })).status, 413);
    assert.equal((await fetch(`${base}/demo/pr/${'a'.repeat(24)}`)).status, 404);
    assert.match((await fetch(base)).headers.get('content-security-policy'), /script-src 'self'/);
  } finally {
    await new Promise((done) => server.close(done));
  }
});
test('public settings retain the web repository and automatic capability without exposing executable configuration', async () => {
  const receiver = {
    config: {
      internalWebUrl: 'https://codehub.example/core',
      pullRequests: { mode: 'command', find: { command: 'D:/private/secret-adapter.exe', args: ['private-argument'] } },
    },
    status: async () => null,
  };
  const server = createReceiverServer(receiver);
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  try {
    const value = await fetch(`http://127.0.0.1:${server.address().port}/api/status`).then((response) =>
      response.json(),
    );
    assert.equal(value.config.internalWebUrl, receiver.config.internalWebUrl);
    assert.equal(value.config.prMode, 'automatic');
    assert.equal(value.platform.prMode, 'automatic');
    assert.doesNotMatch(JSON.stringify(value), /secret-adapter|private-argument/);
  } finally {
    await server.shutdown();
  }
});
