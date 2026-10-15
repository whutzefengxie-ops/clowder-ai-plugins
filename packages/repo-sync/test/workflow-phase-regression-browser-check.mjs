import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test, { before } from 'node:test';
import { chromium } from 'playwright';
import { synchronize } from '../src/automation.mjs';
import { Receiver } from '../src/engine.mjs';
import { phase } from '../src/execution.mjs';
import { git } from '../src/process.mjs';
import { createReceiverServer } from '../src/server.mjs';
import { Tasks } from '../src/tasks.mjs';
import { attempts } from '../web/attempts.mjs';
import { automationBanner } from '../web/automation-view.mjs';
import { repositories } from './fixtures.mjs';
import { issuePlatform } from './issue-fixtures.mjs';
import { launchOwnedBrowser, traceLifecycle } from './owned-browser.mjs';
import { reportWorkflowEvidence } from './workflow-phase-evidence.mjs';

let observed;
before(
  async () => {
    observed = await traceActualReception();
  },
  { timeout: 180000 },
);

test('actual initial preparation keeps its Git checks in stage 2', () => {
  const checks = observed.fetches.filter((item) => item.expectedStage === 2 && item.action === 'synchronize');
  assert.ok(checks.length, 'fixture must execute genuine preparation downloads');
  for (const check of checks)
    assert.ok(
      check.steps.every((step) => step.stage === 2),
      `preparation must not jump to source discovery: ${JSON.stringify(check.steps)}`,
    );
});

test('actual post-merge recovery and Issue settlement stay in stage 5 before starting the next delivery', () => {
  const checks = observed.fetches.filter((item) => item.expectedStage === 5 && item.action === 'resume-sync');
  assert.ok(
    checks.some((item) => item.accepted),
    'fixture must fetch again after the first code acceptance',
  );
  for (const check of checks)
    assert.ok(
      check.steps.every((step) => step.stage === 5),
      `merge observation/Issue settlement must not reopen preparation: ${JSON.stringify(check.steps)}`,
    );
});

test('automatic continuation may enter the next delivery scope and preparation without relabeling them as settlement', () => {
  for (const expectedStage of [1, 2]) {
    const checks = observed.fetches.filter(
      (item) => item.action === 'resume-sync' && item.expectedStage === expectedStage,
    );
    assert.ok(checks.length, `fixture must perform the next delivery stage ${expectedStage}`);
    for (const check of checks)
      assert.ok(
        check.steps.every((step) => step.stage === expectedStage),
        `next delivery must retain stage ${expectedStage}: ${JSON.stringify(check.steps)}`,
      );
  }
});

test('post-acceptance Issue association and ledger persistence keep the verification phase', () => {
  assert.ok(observed.settlementSteps.some((step) => step.key === 'issue-link'));
  const misplaced = observed.settlementSteps.filter((step) => step.stage !== 5);
  assert.deepEqual(
    misplaced,
    [],
    'post-merge Issue association and persistence are verification evidence, not new preparation/publication',
  );
});

test('the user step set is stable from task admission; nested command phases remain evidence rather than growing the plan', () => {
  assert.ok(observed.nested.length, 'fixture must contain actual parentId command evidence');
  const unexpected = [...observed.finalUserSteps].filter((key) => !observed.initialUserSteps.has(key));
  assert.deepEqual(
    unexpected,
    [],
    'execution must update predeclared user steps, not add each new low-level command as a sibling',
  );
});

test('automatic delivery handoff identifies the new PR and does not inherit the preceding delivery expansion', () => {
  assert.equal(observed.oldDelivery.status, 'COMPLETE');
  assert.equal(observed.newDelivery.source.number, 2);
  assert.match(
    observed.banner,
    /PR\s*#2/,
    'round status must identify the active delivery after automatic continuation',
  );
  assert.equal(observed.manualSurvivedReload, true, 'manual expansion must survive refresh within one delivery');
  assert.equal(
    observed.newDeliveryInheritedOldExpansion,
    false,
    'manual expansion from the old delivery must not affect the next one',
  );
});

test('a real nested command failure stays visible on its fixed business step without becoming another top-level user step', () => {
  assert.equal(observed.failedTask.status, 'FAILED');
  assert.ok(
    observed.failedTask.steps.some(
      (step) => step.key === 'git-command-evidence' && step.parentId && step.status === 'FAILED',
    ),
  );
  assert.match(observed.failureHtml, /data-step-key="candidate-check"[^>]*data-operation-state="FAILED"/);
  assert.doesNotMatch(observed.failureHtml, /data-step-key="git-command-evidence"/);
  const row = observed.failureHtml.match(
    /<li data-step-key="candidate-check"[\s\S]*?(?=<li data-step-key=|<\/ol>)/,
  )?.[0];
  assert.ok(row, 'the owning business step must remain in the fixed plan');
  assert.match(
    row.split('<details ')[0],
    /×[\s\S]*error-guide/,
    'failure guidance must be visible before folded command evidence',
  );
  assert.match(row, /只读 Git 命令细节/, 'unknown child command evidence must stay under its actual business parent');
  assert.match(
    observed.liveFailureHtml,
    /data-step-key="candidate-check"[^>]*data-operation-state="FAILED"/,
    'a failed child must not be hidden while its enclosing task is still running',
  );
});

function visibleSteps(operation, record, snapshot) {
  return new Set(
    [1, 2, 3, 4, 5].flatMap((stage) =>
      [...attempts(stage, record, operation, false, snapshot).matchAll(/data-step-key="([^"]+)"/g)].map(
        (match) => `${stage}:${match[1]}`,
      ),
    ),
  );
}

async function traceActualReception() {
  const f = await traceLifecycle('workflow-fixtures', () => repositories()),
    platform = await issuePlatform(f);
  const adapter = join(f.root, 'phase-pr-adapter.mjs'),
    database = join(f.root, 'phase-prs.json');
  await writeFile(
    adapter,
    `import{readFileSync,writeFileSync,existsSync}from'node:fs';
let input='';for await(const c of process.stdin)input+=c;const r=JSON.parse(input),p=process.argv[2],s=existsSync(p)?JSON.parse(readFileSync(p)):{};
if(r.action==='create'){s[r.head]={...r,url:'https://codehub.example/core/pull/'+(Object.keys(s).length+1),state:'open'};writeFileSync(p,JSON.stringify(s));}
console.log(JSON.stringify(s[r.head]??null));`,
  );
  const config = {
    ...f.config,
    mode: 'continuous',
    internalWebUrl: 'https://codehub.example/core',
    issues: platform.config,
    pullRequests: {
      mode: 'command',
      find: { command: process.execPath, args: [adapter, database] },
      create: { command: process.execPath, args: [adapter, database] },
    },
  };
  const receiver = new Receiver(config);
  await receiver.adopt(f.u0, f.i0);
  await receiver.setQueue(f.plans);
  const receptionScope = new AsyncLocalStorage();
  for (const [method, stage] of [
    ['start', 1],
    ['prepare', 2],
    ['recover', 5],
    ['receipts', 5],
    ['syncIssues', 5],
  ]) {
    const original = receiver[method];
    receiver[method] = function (...args) {
      return receptionScope.run(stage, () => original.apply(this, args));
    };
  }
  let release;
  const gate = new Promise((done) => {
    release = done;
  });
  const executor = new Tasks(
    () => receiver,
    async (input) => {
      if (input.action === 'synchronize') await gate;
      return synchronize(receiver, input);
    },
  );
  const fetches = [],
    starts = [],
    nativeReport = executor.report.bind(executor),
    nativeFetch = receiver.git.fetch.bind(receiver.git);
  executor.report = (event) => {
    nativeReport(event);
    if (event.kind === 'start')
      starts.push(
        structuredClone(executor.value.steps.findLast((step) => step.key === event.id && step.status === 'RUNNING')),
      );
  };
  receiver.git.fetch = async (...args) => {
    const raw = await receiver.store.read(),
      active = raw?.deliveries.find(
        (item) => item.id === raw.activeId && !['COMPLETE', 'CANCELLED'].includes(item.status),
      );
    const offset = starts.length,
      result = await nativeFetch(...args);
    fetches.push({
      action: executor.value?.action,
      deliveryId: active?.id,
      accepted: Boolean(active?.acceptedInternal),
      expectedStage: receptionScope.getStore() ?? 1,
      steps: starts.slice(offset).map(({ key, stage, parentId }) => ({ key, stage, parentId })),
    });
    return result;
  };
  let browser, owner, server;
  try {
    const admission = await executor.start({
      action: 'synchronize',
      requestId: 'a'.repeat(32),
      expectedBinding: receiver.config.bindingId,
    });
    const initialUserSteps = visibleSteps(admission, null, { config: receiver.config, state: await receiver.status() });
    release();
    await traceLifecycle('workflow-prepare-first', () => executor.job);
    assert.equal((await executor.latest()).status, 'SUCCEEDED');
    const first = (await receiver.status()).active,
      firstTask = await executor.latest();
    const finalUserSteps = visibleSteps(
      firstTask,
      { delivery: first, current: true, tasks: [firstTask], configurations: [] },
      { config: receiver.config, state: await receiver.status() },
    );
    server = createReceiverServer(receiver, { syncInterval: 60000 });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    owner = await traceLifecycle('workflow-browser-launch', () =>
      launchOwnedBrowser(chromium, { headless: true, executablePath: process.env.REPO_SYNC_CHROME }),
    );
    browser = owner.browser;
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
    page.setDefaultTimeout(15000);
    const base = `http://127.0.0.1:${server.address().port}`;
    await traceLifecycle('workflow-page-goto', () => page.goto(base));
    await page.locator('.next-action a[href="https://codehub.example/core/pull/1"]').waitFor();
    if (!(await page.locator('[data-stage="1"]').evaluate((node) => node.open)))
      await page.locator('[data-stage="1"] > summary').click();
    await traceLifecycle('workflow-page-reload', () => page.reload());
    await page.locator('.next-action a[href="https://codehub.example/core/pull/1"]').waitFor();
    const manualSurvivedReload = await page.locator('[data-stage="1"]').evaluate((node) => node.open);
    await f.merge(first);
    await executor.start({
      action: 'resume-sync',
      runId: 'a'.repeat(32),
      requestId: 'b'.repeat(32),
      expectedBinding: receiver.config.bindingId,
    });
    await traceLifecycle('workflow-prepare-next', () => executor.job);
    assert.equal((await executor.latest()).status, 'SUCCEEDED');
    const state = await receiver.status();
    assert.equal(state.deliveries[0].status, 'COMPLETE');
    assert.equal(state.active.source.number, 2);
    await traceLifecycle('workflow-observe-next', () =>
      page.locator('.next-action a[href="https://codehub.example/core/pull/2"]').waitFor({ timeout: 30000 }),
    );
    const newDeliveryInheritedOldExpansion = await page.locator('[data-stage="1"]').evaluate((node) => node.open);
    const snapshot = await (await fetch(`${base}/api/status`)).json();
    const settlementOffset = starts.findIndex((step) => step.key === 'merge-verify' && step.deliveryId === first.id);
    const settlementSteps = starts
      .slice(settlementOffset)
      .filter((step) => step.deliveryId === first.id)
      .map(({ key, stage, parentId }) => ({ key, stage, parentId }));
    const failing = new Tasks(
      () => receiver,
      () =>
        phase('candidate-check', '检查当前候选', () =>
          phase('git-command-evidence', '只读 Git 命令细节', () =>
            git(receiver.git.directory, ['rev-parse', '--verify', 'refs/heads/fixture-nonexistent']),
          ),
        ),
    );
    let liveFailureHtml;
    const reportFailure = failing.report.bind(failing);
    failing.report = (event) => {
      reportFailure(event);
      if (event.kind === 'failed' && event.id === 'git-command-evidence')
        liveFailureHtml = attempts(
          2,
          { delivery: state.active, current: true, tasks: [], configurations: [] },
          structuredClone(failing.value),
          false,
          { config: receiver.config, state },
        );
    };
    await failing.start({
      action: 'prepare',
      requestId: 'c'.repeat(32),
      deliveryId: state.active.id,
      expectedBinding: receiver.config.bindingId,
    });
    await failing.job;
    const failedTask = await failing.latest();
    const failureHtml = attempts(
      2,
      { delivery: state.active, current: true, tasks: [failedTask], configurations: [] },
      failedTask,
      false,
      { config: receiver.config, state },
    );
    await failing.close();
    const evidence = {
      fetches,
      nested: starts.filter((step) => step.parentId),
      initialUserSteps,
      finalUserSteps,
      oldDelivery: state.deliveries[0],
      newDelivery: state.active,
      banner: automationBanner(snapshot),
      manualSurvivedReload,
      newDeliveryInheritedOldExpansion,
      settlementSteps,
      failedTask,
      failureHtml,
      liveFailureHtml,
    };
    reportWorkflowEvidence(evidence);
    return evidence;
  } finally {
    release();
    await traceLifecycle('workflow-browser-close', () => owner?.close());
    await traceLifecycle('workflow-server-close', () => server?.shutdown());
    await traceLifecycle('workflow-executor-close', () => executor.close());
  }
}
