import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchPrHead } from '../src/development-history.mjs';

const receiver = { git: { directory: 'objects.git', config: { sourceUrl: 'https://github.com/acme/core.git' } } };
const noWait = () => Promise.resolve();

test('a transient github.com connection failure is retried instead of failing the scan', async () => {
  let calls = 0;
  await fetchPrHead(
    receiver,
    1455,
    'refs/sync/pr/1455',
    async () => {
      calls += 1;
      if (calls < 3) throw Object.assign(new Error('fetch failed'), { code: 'NETWORK_FAILED' });
    },
    noWait,
  );
  assert.equal(calls, 3);
});

test('persistent network failure reports the PR number and names the network cause', async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      fetchPrHead(
        receiver,
        1455,
        'refs/sync/pr/1455',
        async () => {
          calls += 1;
          throw Object.assign(new Error('fetch failed'), { code: 'NETWORK_FAILED' });
        },
        noWait,
      ),
    (error) => {
      assert.equal(error.code, 'PR_HISTORY_UNAVAILABLE');
      assert.match(error.message, /PR #1455/);
      assert.match(error.message, /网络/);
      assert.match(error.message, /不是权限或 PR 已删除/);
      return true;
    },
  );
  assert.equal(calls, 3);
});

test('a non-network fetch error is not retried and keeps the permission/ref guidance', async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      fetchPrHead(
        receiver,
        1455,
        'refs/sync/pr/1455',
        async () => {
          calls += 1;
          throw Object.assign(new Error('command failed'), {
            code: 'COMMAND_FAILED',
            details: { exitCode: 128 },
          });
        },
        noWait,
      ),
    (error) => {
      assert.equal(error.code, 'PR_HISTORY_UNAVAILABLE');
      assert.match(error.message, /PR #1455/);
      assert.match(error.message, /128/);
      return true;
    },
  );
  assert.equal(calls, 1);
});

test('a timeout on the PR fetch is also retried', async () => {
  let calls = 0;
  await fetchPrHead(
    receiver,
    1455,
    'refs/sync/pr/1455',
    async () => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error('timeout'), { code: 'COMMAND_TIMEOUT' });
    },
    noWait,
  );
  assert.equal(calls, 2);
});
