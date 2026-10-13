import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createConnection } from '../src/connections.mjs';
import { Receiver } from '../src/engine.mjs';
import { versionRepositories } from './version-fixtures.mjs';

test('enabling Git PR on an adopted binding preserves cursors and cannot set executable commands', async () => {
  const f = await versionRepositories();
  const receiver = new Receiver(f.config);
  await receiver.adopt(f.u0, f.i0);
  const folder = await mkdtemp(join(tmpdir(), 'repo-sync-platform-settings-'));
  const file = join(folder, 'config.json');
  await writeFile(file, JSON.stringify(f.config));
  const connection = await createConnection(file);
  const revision = connection.describe().revision;
  await connection.run({
    action: 'configure-pr',
    expectedRevision: revision,
    internalWebUrl: 'https://codehub.example/core',
    prMode: 'git',
  });
  const next = await connection.current();
  assert.equal(next.config.bindingId, receiver.config.bindingId);
  assert.equal(next.config.pullRequests.mode, 'git');
  assert.deepEqual((await next.status()).accepted, (await receiver.status()).accepted);
  const currentText = await readFile(file, 'utf8');
  await assert.rejects(
    () =>
      connection.run({
        action: 'configure-pr',
        expectedRevision: connection.describe().revision,
        internalWebUrl: 'https://codehub.example/core',
        prMode: 'git',
        command: 'evil',
      }),
    { code: 'INVALID_CONFIGURATION_INPUT' },
  );
  assert.equal(await readFile(file, 'utf8'), currentText);
  await assert.rejects(
    () =>
      connection.run({
        action: 'configure-pr',
        expectedRevision: revision,
        internalWebUrl: 'https://codehub.example/core',
        prMode: 'manual',
      }),
    { code: 'CONFIGURATION_CHANGED' },
  );
});
test('Git creation intent freezes platform options even before PR link registration', async () => {
  const f = await versionRepositories();
  const receiver = new Receiver(f.config);
  await receiver.adopt(f.u0, f.i0);
  await receiver.selectTag('v2.0.0');
  await receiver.start();
  const state = await receiver.read();
  state.deliveries[0].gitPr = { fingerprint: 'frozen-intent' };
  await receiver.store.save(state);
  const folder = await mkdtemp(join(tmpdir(), 'repo-sync-platform-frozen-'));
  const file = join(folder, 'config.json');
  await writeFile(file, JSON.stringify(f.config));
  const connection = await createConnection(file);
  await assert.rejects(
    () =>
      connection.run({
        action: 'configure-pr',
        expectedRevision: connection.describe().revision,
        internalWebUrl: 'https://codehub.example/core',
        prMode: 'git',
      }),
    { code: 'PR_CONFIG_FROZEN' },
  );
  assert.equal((await receiver.status()).active.gitPr.fingerprint, 'frozen-intent');
});
