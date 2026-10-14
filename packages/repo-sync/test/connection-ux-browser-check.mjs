import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createProjectWorkspace } from '../src/projects.mjs';
import { createReceiverServer } from '../src/server.mjs';
import { codehubPlatform } from './codehub-fixture.mjs';
import { repositories } from './fixtures.mjs';

const f = await repositories(),
  platform = await codehubPlatform(f),
  folder = await mkdtemp(join(tmpdir(), 'repo-sync-ux-')),
  file = join(folder, 'config.json');
Object.assign(process.env, {
  GIT_CONFIG_COUNT: '2',
  GIT_CONFIG_KEY_0: `url.${f.source.replaceAll('\\', '/')}.insteadOf`,
  GIT_CONFIG_VALUE_0: 'https://github.com/demo/core.git',
  GIT_CONFIG_KEY_1: `url.${f.internal.replaceAll('\\', '/')}.insteadOf`,
  GIT_CONFIG_VALUE_1: 'git@codehub.example:innersource/team_G/core.git',
});
await writeFile(
  file,
  JSON.stringify({
    ...f.config,
    sourceUrl: 'https://github.com/demo/core.git',
    internalUrl: 'git@codehub.example:innersource/team_G/core.git',
    internalWebUrl: platform.web,
    configurationSource: 'workbench',
    commitClosureVerified: false,
  }),
);
const projects = await createProjectWorkspace(file),
  server = createReceiverServer(null, { projects });
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`,
  browser = await chromium.launch({ headless: true, executablePath: process.env.REPO_SYNC_CHROME }),
  page = await browser.newPage({ viewport: { width: 1440, height: 1050 } }),
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const evidence = process.env.REPO_SYNC_EVIDENCE || join(folder, 'evidence');
await mkdir(evidence, { recursive: true });
try {
  await page.goto(`${base}/?view=configuration`);
  await page.getByText('修改尚未启用的仓库配置', { exact: true }).click();
  const form = page.locator('form[data-form="configure-repositories"]');
  assert.equal(await form.locator('[data-issue-api]').isVisible(), false);
  await form.getByLabel('PR 创建方式', { exact: true }).selectOption('gitlab');
  await form.getByLabel('Issue 创建与关单方式').selectOption('gitlab');
  await form.getByLabel('内部 Issue 网页链接').fill(`${platform.web}/issues`);
  await form.getByLabel('内部平台 API 地址').fill(platform.api);
  await form.getByLabel('内部平台 Token', { exact: true }).fill(platform.token);
  assert.equal(await form.locator('[name="issueTokenEnv"]').isVisible(), false);
  assert.equal(await form.locator('[name="commitClosureVerified"]').count(), 0);
  const source = await form.locator('[data-repository="source"]').boundingBox(),
    internal = await form.locator('[data-repository="internal"]').boundingBox();
  assert.ok(internal.x > source.x);
  assert.equal(await form.locator('[data-repository="source"] [name="targetBranch"]').count(), 0);
  await page.screenshot({ path: join(evidence, 'connection-groups-desktop.png'), fullPage: true });
  await form.getByRole('button', { name: '保存仓库配置，继续核验基线 →' }).click();
  await page.getByRole('button', { name: '验证平台接口（只读）', exact: true }).click();
  await page.getByText(/项目 API 只读核验通过/).waitFor();
  const connection = await projects.connection(),
    receiver = await connection.current();
  assert.equal(receiver.config.issues.projectId, 'innersource/team_G/core');
  assert.equal(receiver.config.pullRequests.mode, 'gitlab');
  assert.equal((await readFile(file, 'utf8')).includes(platform.token), false);
  assert.equal(await page.evaluate((secret) => JSON.stringify(sessionStorage).includes(secret), platform.token), false);
  await page.reload();
  assert.equal(await page.locator('input[type="password"]').inputValue(), '');
  await page.getByRole('button', { name: '读取两侧当前版本', exact: true }).click();
  await page.locator('#upstream').fill(f.u0);
  await page.locator('#internal').fill(f.i0);
  await page.getByRole('button', { name: '核验并登记已有基线', exact: true }).click();
  await page.getByRole('button', { name: '进入同步工作台 →', exact: true }).click();
  await receiver.setQueue(f.plans);
  await page.reload();
  await page.getByRole('button', { name: '同步上游 PR #1 →', exact: true }).click();
  await page.getByRole('link', { name: '确认提交消息关单规则 →', exact: true }).waitFor();
  await page.getByText('如何确认？查看一次性的测试步骤', { exact: true }).click();
  assert.equal(platform.state.creates.prs, 0);
  await page.getByLabel('已确认：内部平台不会根据搬入的提交消息自动关闭 Issue').check();
  await page.getByRole('button', { name: '保存关单规则确认，继续本笔同步', exact: true }).click();
  for (const number of [1, 2]) {
    if (number === 2) await page.getByRole('button', { name: '同步上游 PR #2 →', exact: true }).click();
    await page.getByRole('button', { name: '自动搬运 Issue、检查并推送候选 →', exact: true }).click();
    await page.getByRole('link', { name: '打开内部 PR ↗', exact: true }).waitFor({ timeout: 30000 });
    const delivery = (await receiver.status()).active;
    assert.equal(delivery.prUrl, `${platform.web}/merge_requests/${number}`);
    assert.equal(platform.state.creates.issues, 1);
    assert.equal(platform.state.creates.prs, number);
    await f.merge(delivery);
    platform.state.mrs[number - 1].state = 'merged';
    await page.getByRole('button', { name: '已在平台合入，核验 Git 结果', exact: true }).click();
    await page.getByRole('heading', { name: '当前已接收版本', exact: true }).waitFor({ timeout: 30000 });
    assert.equal(platform.state.issues[0].state, number === 1 ? 'opened' : 'closed');
  }
  await page.getByRole('button', { name: '仓库设置', exact: true }).click();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1050 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: join(evidence, `connection-complete-${width}.png`), fullPage: true });
  }
  assert.deepEqual(errors, []);
  console.log(
    'PASS: grouped repository configuration, direct private Token, parsed project path, API host differs from web, inline closure guidance after adoption, two real Git PRs via API, shared Issue association/closure, refresh and desktop/mobile.',
  );
} catch (error) {
  await page.screenshot({ path: join(evidence, 'connection-failure.png'), fullPage: true });
  console.log(
    JSON.stringify({
      uiError: await page.locator('#error').textContent(),
      nextAction: await page.locator('.next-action').allTextContents(),
      config: {
        mode: (await (await projects.connection()).current()).config.mode,
        closure: (await (await projects.connection()).current()).config.commitClosureVerified,
      },
    }),
  );
  throw error;
} finally {
  await browser.close();
  await server.shutdown();
  await platform.close();
}
