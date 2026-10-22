import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const read = async (file) => JSON.parse(await readFile(new URL(`../${file}`, import.meta.url), 'utf8'));

test('CodeAgent is a standalone data-only provider with no configuration or config grant', async () => {
  const [pkg, manifest, provider] = await Promise.all([read('package.json'), read('manifest.json'), read('agent-provider.json')]);
  assert.equal(pkg.version, manifest.version);
  assert.equal(manifest.pluginId, 'official.codeagent');
  assert.equal(manifest.runtime, undefined);
  assert.equal(manifest.configuration, undefined);
  assert.deepEqual(manifest.features.flatMap((feature) => feature.capabilities), []);
  assert.equal(pkg.dependencies, undefined);
  assert.deepEqual(provider, { id: 'codeagent', transport: 'acp', acp: { command: 'codeagent', startupArgs: ['--acp'] } });
  for (const file of ['manifest.json', 'agent-provider.json', 'README.md', 'README.en.md']) assert.ok(pkg.files.includes(file));
});
