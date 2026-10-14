import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { Receiver } from '../src/engine.mjs';
import { git } from '../src/process.mjs';
import { createReceiverServer } from '../src/server.mjs';
import { gitPrFixture } from './git-pr-fixtures.mjs';

const f = await gitPrFixture();
const receiver = new Receiver(f.config);
await receiver.adopt(f.u0, f.i0);
const server = createReceiverServer(receiver);
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ headless: true, executablePath: process.env.REPO_SYNC_CHROME });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const evidence = process.env.REPO_SYNC_EVIDENCE || join(tmpdir(), 'repo-sync-journey-evidence');
const errors = [];
let releaseCheck = () => {};
page.on('pageerror', (error) => errors.push(error.message));
await mkdir(evidence, { recursive: true });
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('.record-list').waitFor({ timeout: 3000 });
  await page.getByRole('button', { name: '读取可用 tag', exact: true }).click();
  await page.locator('[name="tag"]').selectOption('v2.0.0');
  await page.getByRole('button', { name: '核对内部差异并选择这个版本 →' }).click();
  await page.getByRole('button', { name: '开始更新至 v2.0.0 →' }).click();
  await page.getByRole('button', { name: '合并文件、检查并推送候选 →' }).click();
  await page.getByRole('link', { name: '打开内部 PR ↗', exact: true }).waitFor({ timeout: 30000 });
  assert.equal(await page.locator('[data-stage]').count(), 5);
  assert.equal(await page.locator('main > #operation').count(), 0, 'execution belongs inside a stage');
  const active = (await receiver.status()).active;
  await f.merge(active);
  await page.getByRole('button', { name: '已在平台合入，核验 Git 结果' }).click();
  await page.getByRole('heading', { name: '当前已接收版本', exact: true }).waitFor({ timeout: 30000 });
  const accepted = (await receiver.status()).accepted;
  const completedTasks = (await receiver.status()).deliveries[0].taskIds.slice();
  assert.equal(accepted.tag, 'v2.0.0');
  await page.locator(`[data-record="${active.id}"]`).click();
  await page.getByText('历史记录 · 只读', { exact: true }).waitFor();
  assert.equal(await page.locator('.record-detail [data-action]').count(), 0);
  assert.ok((await page.locator('.record-detail').innerText()).includes(accepted.internal));
  assert.ok((await page.locator('.record-detail').innerText()).includes(f.u0));
  await page.getByRole('button', { name: '展开全部阶段' }).click();
  assert.ok((await page.locator('[data-attempt]').count()) >= 3);
  await page.getByText('当时配置与来源', { exact: true }).click();
  assert.ok((await page.locator('.record-detail').innerText()).includes('releases'));
  await page.reload();
  await page.getByText('历史记录 · 只读', { exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('record'), active.id);
  for (const width of [1440, 769, 768, 767, 390]) {
    await page.setViewportSize({ width, height: 1050 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (width <= 768) {
      await page.getByRole('button', { name: '返回同步记录' }).click();
      await page.locator(`[data-record="${active.id}"]`).click();
    }
    if ([1440, 390].includes(width))
      await page.screenshot({ path: join(evidence, `history-${width}.png`), fullPage: true });
  }
  await page.getByRole('button', { name: '展开全部阶段' }).click();
  const dimensions = await page.locator('.record-list button').evaluateAll((buttons) =>
    buttons
      .map((item) => ({
        width: item.getBoundingClientRect().width,
        height: item.getBoundingClientRect().height,
      }))
      .filter((item) => item.width),
  );
  assert.ok(dimensions.every((item) => item.width >= 44 && item.height >= 44));
  await writeFile(join(f.source, 'README.md'), '上游第三版介绍\n\n运行说明\n\n联系说明\n');
  await git(f.source, ['add', '.']);
  await git(f.source, ['commit', '-m', 'third synthetic release']);
  await git(f.source, ['tag', 'v3.0.0']);
  await writeFile(join(f.review, 'README.md'), '内部第三版介绍\n\n运行说明\n\n内部联系说明\n');
  await git(f.review, ['add', '.']);
  await git(f.review, ['commit', '-m', 'third internal customization']);
  await git(f.review, ['push', 'origin', 'main']);
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.getByRole('button', { name: '返回当前同步', exact: true }).click();
  await page.getByRole('button', { name: '读取可用 tag', exact: true }).click();
  await page.locator('[name="tag"]').selectOption('v3.0.0');
  await page.getByRole('button', { name: '核对内部差异并选择这个版本 →' }).click();
  await page.getByRole('button', { name: '开始更新至 v3.0.0 →' }).click();
  assert.deepEqual(
    (await receiver.status()).deliveries[0].taskIds,
    completedTasks,
    'new selection cannot rewrite completed history',
  );
  await page.getByRole('button', { name: '合并文件、检查并推送候选 →' }).click();
  await page.getByRole('heading', { name: '解决共同文件冲突' }).waitFor({ timeout: 30000 });
  assert.equal(await page.locator('[data-stage="2"][data-stage-state="failed"]').count(), 1);
  await page.getByText(/冲突文件（/).click();
  await page.getByRole('button', { name: '查看并处理冲突' }).click();
  await page.getByLabel('处理方式').selectOption('manual');
  await page.getByLabel('人工合并后的完整内容').fill('draft preserved across history and reload\n');
  await page.locator(`[data-record="${active.id}"]`).click();
  await page.getByRole('button', { name: '返回当前同步', exact: true }).click();
  await page.reload();
  assert.equal(
    await page.getByLabel('人工合并后的完整内容').inputValue(),
    'draft preserved across history and reload\n',
  );
  await page.getByRole('button', { name: '保存此冲突处理结果' }).click();
  const checks = receiver.git.checks.bind(receiver.git);
  const gate = new Promise((done) => {
    releaseCheck = done;
  });
  let checking = false;
  receiver.git.checks = async (head) => {
    checking = true;
    await gate;
    return checks(head);
  };
  await page.getByRole('button', { name: '合并文件、检查并推送候选 →' }).click();
  await page.waitForFunction(() => document.querySelector('[data-operation-state="RUNNING"]'));
  await page.locator(`[data-record="${active.id}"]`).click();
  await page.getByText('历史记录 · 只读', { exact: true }).waitFor();
  assert.equal(await page.locator('.record-list input[name="q"]').isDisabled(), false);
  for (let retry = 0; retry < 100 && !checking; retry++) await new Promise((done) => setTimeout(done, 100));
  assert.ok(checking);
  releaseCheck();
  await page.waitForFunction(() => document.getElementById('current-activity')?.textContent === '');
  assert.equal(
    new URL(page.url()).searchParams.get('record'),
    active.id,
    'background completion must not steal history',
  );
  await page.getByRole('button', { name: '返回当前同步', exact: true }).click();
  await page.getByRole('link', { name: '打开内部 PR ↗', exact: true }).waitFor({ timeout: 30000 });
  assert.ok((await page.locator('[data-stage="2"] [data-attempt]').count()) >= 3);
  await page.setViewportSize({ width: 390, height: 844 });
  const bar = await page.locator('.next-action').boundingBox();
  assert.ok(bar.y + bar.height <= 844 && bar.y > 0);
  await page.screenshot({ path: join(evidence, 'current-390.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    'PASS: real Git tag/automatic PR/merge, unified nested timeline, lazy read-only history, snapshots/attempt times, reload and responsive same-page navigation.',
  );
} catch (error) {
  console.log('Browser errors:', errors, '\nVisible page:', await page.locator('body').innerText());
  await page.screenshot({ path: join(evidence, 'failure.png'), fullPage: true });
  throw error;
} finally {
  releaseCheck();
  await browser.close();
  await server.shutdown();
}
