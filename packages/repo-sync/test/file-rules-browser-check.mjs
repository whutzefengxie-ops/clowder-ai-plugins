import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { git } from '../src/process.mjs';
import { createProjectWorkspace } from '../src/projects.mjs';
import { createReceiverServer } from '../src/server.mjs';
import { versionRepositories } from './version-fixtures.mjs';

const f = await versionRepositories(),
  folder = await mkdtemp(join(tmpdir(), 'repo-sync-tree-'));
for (let i = 0; i < 65; i++)
  await writeFile(join(f.review, 'internal-docs', `file-${String(i).padStart(3, '0')}.md`), `internal ${i}`);
await git(f.review, ['add', '.']);
await git(f.review, ['commit', '-m', 'synthetic internal documentation']);
await git(f.review, ['push', 'origin', 'main']);
const i0 = await git(f.review, ['rev-parse', 'HEAD']),
  file = join(folder, 'config.json');
await writeFile(
  file,
  JSON.stringify({ ...f.config, configurationSource: 'workbench', internalPaths: ['unlisted-private/'] }),
);
const projects = await createProjectWorkspace(file),
  server = createReceiverServer(null, { projects });
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.REPO_SYNC_CHROME });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } }),
  errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const evidence = process.env.REPO_SYNC_EVIDENCE || join(folder, 'evidence');
await mkdir(evidence, { recursive: true });
const checkbox = (path) => page.getByRole('checkbox', { name: `保留内部 ${path}`, exact: true });
try {
  await page.goto(`${base}/?view=configuration`);
  await page.getByLabel('外部已同步版本 U0（完整 SHA）').fill(f.u0);
  await page.getByLabel('内部当前版本 I0（完整 SHA）').fill(i0);
  await page.getByRole('button', { name: '核验并登记已有基线' }).click();
  const panel = page.locator('#baseline-differences'),
    tree = panel.locator('[data-file-tree]');
  await panel.waitFor({ timeout: 30000 });
  assert.equal(await page.locator('[name="internalPaths"]').isVisible(), false);
  await checkbox('README.md').check();
  await tree.getByLabel('搜索文件').fill('internal-docs/file-003');
  await checkbox('internal-docs/file-003.md').check();
  assert.equal(await checkbox('internal-docs/').evaluate((node) => node.indeterminate), true);
  await checkbox('internal-docs/').check();
  assert.equal(await checkbox('internal-docs/file-003.md').isDisabled(), true);
  assert.equal(await checkbox('internal-docs/file-003.md').isChecked(), true);
  await tree.getByLabel('搜索文件').fill('');
  await tree.getByRole('button', { name: '下一页' }).click();
  assert.match(await tree.locator('[data-tree-count]').textContent(), /第 2 \/ 2 页/);
  assert.equal(await checkbox('internal-docs/file-064.md').isChecked(), true);
  await page.reload();
  await panel.waitFor();
  assert.match(await panel.locator('[data-selected-rules]').textContent(), /README.md/);
  assert.match(await panel.locator('[data-selected-rules]').textContent(), /unlisted-private\//);
  await tree.getByLabel('搜索文件').fill('internal-docs/file-003');
  await panel.getByRole('button', { name: '取消保留 internal-docs/', exact: true }).click();
  assert.equal(await checkbox('internal-docs/file-003.md').isChecked(), false);
  await checkbox('internal-docs/').check();
  const unchanged = await readFile(file, 'utf8');
  await page.getByText('查看或修改已保存的仓库信息', { exact: true }).click();
  await page.getByText('修改尚未启用的仓库配置', { exact: true }).click();
  await page.getByLabel('内部合入分支', { exact: true }).fill('other');
  await panel.getByRole('button', { name: '保存所选规则并重新核验' }).click();
  await panel
    .locator('[data-rule-feedback]')
    .getByText(/有未保存修改/)
    .waitFor();
  assert.equal(await readFile(file, 'utf8'), unchanged);
  await page.getByLabel('内部合入分支', { exact: true }).fill('main');
  assert.equal(await panel.locator('[data-rule-feedback]').textContent(), '');
  await tree.getByLabel('搜索文件').fill('');
  await page.screenshot({ path: join(evidence, 'file-rule-selection-desktop.png'), fullPage: true });
  await panel.screenshot({ path: join(evidence, 'file-rule-panel-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: join(evidence, 'file-rule-selection-mobile.png'), fullPage: true });
  await panel.screenshot({ path: join(evidence, 'file-rule-panel-mobile.png') });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await panel.getByRole('button', { name: '保存所选规则并重新核验' }).click();
  await panel
    .locator('[data-rule-feedback]')
    .getByText(/规则已保存，基线未通过/)
    .waitFor({ timeout: 30000 });
  const connection = await projects.connection(),
    receiver = await connection.current();
  assert.equal(await receiver.status(), null);
  assert.deepEqual(receiver.config.internalPaths, ['README.md', 'internal-docs/', 'unlisted-private/']);
  assert.equal(await git(f.internal, ['rev-parse', 'main']), i0);
  assert.equal(await checkbox('OWNED.md').isChecked(), false);
  await checkbox('OWNED.md').check();
  await panel.getByRole('button', { name: '保存所选规则并重新核验' }).click();
  await page
    .getByText('所选内部保留规则已保存，核心文件核验通过，基线已登记。下一步：进入同步工作台。', { exact: true })
    .waitFor({ timeout: 30000 });
  const final = await connection.current();
  assert.equal((await final.status()).accepted.upstream, f.u0);
  assert.equal((await final.status()).accepted.internal, i0);
  assert.equal(await page.locator('[data-rule-choice]').count(), 0);
  const original = await readFile(file, 'utf8');
  await assert.rejects(
    () =>
      connection.run({
        action: 'configure-file-rules',
        expectedRevision: connection.describe().revision,
        expectedBinding: final.config.bindingId,
        internalPaths: ['core.txt'],
      }),
    { code: 'CONFIGURATION_READ_ONLY' },
  );
  assert.equal(await readFile(file, 'utf8'), original);
  await final.selectTag('v2.0.0');
  await final.start();
  await final.prepare();
  const delivery = (await final.status()).active;
  const candidateReadme = await git(final.git.directory, ['show', `${delivery.candidate}:README.md`]);
  assert.match(candidateReadme, /内部联系说明/);
  assert.equal(await git(final.git.directory, ['show', `${delivery.candidate}:core.txt`]), 'release two');
  assert.deepEqual(errors, []);
  console.log(
    'PASS: managed project file/directory choices, inherited and partial states, >50 paths, unseen rules, refresh, draft guard, save/recheck failure and recovery, locked rules, exact Git preservation and core update; desktop/mobile.',
  );
} finally {
  await page.close();
  await browser.close();
  await server.shutdown();
}
