import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createConnection } from '../src/connections.mjs';
import { phase } from '../src/execution.mjs';
import { command } from '../src/process.mjs';
import { createReceiverServer } from '../src/server.mjs';
import { versionRepositories } from './version-fixtures.mjs';

const f = await versionRepositories(),
  folder = await mkdtemp(join(tmpdir(), 'repo-sync-setup-flow-'));
Object.assign(process.env, {
  GIT_CONFIG_COUNT: '2',
  GIT_CONFIG_KEY_0: `url.${f.source.replaceAll('\\', '/')}.insteadOf`,
  GIT_CONFIG_VALUE_0: 'https://github.com/demo/core.git',
  GIT_CONFIG_KEY_1: `url.${f.internal.replaceAll('\\', '/')}.insteadOf`,
  GIT_CONFIG_VALUE_1: 'git@codehub.example:team/core.git',
});
const connection = await createConnection(join(folder, 'config.json')),
  server = createReceiverServer(null, { connection });
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ headless: true, executablePath: process.env.REPO_SYNC_CHROME });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
  errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const evidence = process.env.REPO_SYNC_EVIDENCE || join(folder, 'evidence');
await mkdir(evidence, { recursive: true });
const visible = (selector) =>
  page.locator(selector).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.top >= 0 && rect.top < innerHeight - 80;
  });
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/?view=configuration`);
  await page.getByLabel('外部 GitHub 仓库地址').fill('https://github.com/demo/core.git');
  await page.getByLabel('内部 Git 仓库地址').fill('git@codehub.example:team/core.git');
  await page.getByLabel('内部仓库网页地址（登记对象前必填）').fill('https://codehub.example/core');
  await page.getByLabel('外部交付分支').fill('releases');
  await page.getByLabel('PR 创建方式', { exact: true }).selectOption('manual');
  await page.getByText('手动填写路径（高级）', { exact: true }).click();
  await page.getByLabel('内部保留文件 / 目录（每行一项）').fill('README.md\nOWNED.md\ninternal-docs/');
  await page.getByRole('button', { name: '保存仓库配置，继续核验基线 →' }).click();
  await page.locator('form[data-form="configure-repositories"]').waitFor({ state: 'hidden' });
  assert.equal(
    await page.evaluate(() => document.activeElement?.name),
    'upstream',
    'Continue must focus the baseline step',
  );
  assert.equal(await page.locator('[data-setup-repositories]').evaluate((element) => element.open), false);
  assert.equal(await page.locator('#platform-settings').isVisible(), false);
  assert.ok(await visible('#upstream'));
  await page.screenshot({ path: join(evidence, 'setup-current-baseline-desktop.png'), fullPage: false });
  const receiver = await connection.current(),
    originalHeads = receiver.git.heads.bind(receiver.git);
  receiver.git.heads = async () => {
    await phase('test-probe-wait', '等待独立测试仓连接', () =>
      command(process.execPath, ['-e', 'setTimeout(()=>{},1200)']),
    );
    return originalHeads();
  };
  await page.getByLabel('外部已同步版本 U0（完整 SHA）').fill(f.u0);
  await page.getByRole('button', { name: '读取两侧当前版本' }).click();
  await page.locator('#operation [data-operation-state="RUNNING"]').waitFor();
  assert.ok(await page.locator('#baseline-step #operation').count());
  assert.ok(await visible('#operation'));
  await page
    .locator('#observed-heads')
    .getByText(/读取成功/)
    .waitFor({ timeout: 20000 });
  assert.equal(await page.getByLabel('外部已同步版本 U0（完整 SHA）').inputValue(), f.u0);
  assert.equal(await page.getByLabel('内部当前版本 I0（完整 SHA）').inputValue(), f.i0);
  assert.equal(
    await page.evaluate(() => document.activeElement?.name),
    'internal',
    'read result must return to the next baseline input',
  );
  assert.ok(await visible('#internal'));
  await page.getByText('查看或修改已保存的仓库信息', { exact: true }).click();
  await page.getByText('修改尚未启用的仓库配置', { exact: true }).click();
  await page.getByRole('button', { name: '保存仓库配置，继续核验基线 →' }).click();
  await page.locator('form[data-form="configure-repositories"]').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('[data-setup-repositories]').evaluate((element) => element.open), false);
  assert.equal(await page.getByLabel('外部已同步版本 U0（完整 SHA）').inputValue(), f.u0);
  await page.reload();
  await page.getByLabel('内部当前版本 I0（完整 SHA）').waitFor();
  assert.equal(await page.locator('[data-setup-repositories]').evaluate((element) => element.open), false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '读取两侧当前版本' }).click();
  await page.locator('#operation [data-operation-state="RUNNING"]').waitFor();
  assert.ok(await visible('#operation'));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: join(evidence, 'setup-progress-mobile.png'), fullPage: false });
  await page
    .locator('#observed-heads')
    .getByText(/读取成功/)
    .waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: '核验并登记已有基线' }).click();
  await page.getByRole('button', { name: '进入同步工作台 →' }).waitFor({ timeout: 20000 });
  assert.ok(await visible('[data-view="workbench"].primary'));
  assert.deepEqual(errors, []);
  console.log(
    'PASS: saved repositories collapse, baseline focus and viewport, inline progress, draft-safe edit/reload, desktop/mobile and real Git adoption.',
  );
} finally {
  await browser.close();
  await server.shutdown();
}
