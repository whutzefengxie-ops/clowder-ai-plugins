import assert from 'node:assert/strict';
import test from 'node:test';
import { candidateRecovery } from '../web/candidate-recovery.mjs';
import { previewPanel } from '../web/preview-view.mjs';
import { sourceTargetForm } from '../web/source-target.mjs';
import { runHero } from '../web/v3-hero.mjs';

const esc = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;');
const sha = (value) => `<code>${String(value ?? '').slice(0, 7)}</code>`;

test('target form keeps the full-SHA contract and a read-only compare action', () => {
  const html = sourceTargetForm({ queue: [], syncTarget: null }, [{ name: 'v2.0.0' }], esc, sha, true);
  assert.match(html, /name="targetKind"/);
  assert.match(html, /name="targetValue"/);
  assert.match(html, /40 位/);
  assert.match(html, /对比目标范围/);
  assert.match(html, /data-preview-sync/);
  assert.match(html, /name="autoMerge"/);
});

test('preview freezes both the PR boundary and its Issue mapping', () => {
  const html = previewPanel({
    targetName: 'v2.0.0',
    base: { upstream: 'aaaa1111', internal: 'bbbb2222' },
    target: 'cccc3333',
    checkedAt: '2026-10-20T00:00:00.000Z',
    plans: [
      {
        source: { kind: 'pull', number: 7, title: 'fix: read base' },
        target: 'dddd4444',
        issues: [{ number: 12, title: '修复合入核验读取 base' }],
      },
    ],
    changes: [],
  });
  assert.match(html, /冻结范围 · PR 与 Issue/);
  assert.match(html, /PR #7/);
  assert.match(html, /#12 修复合入核验读取 base/);
  assert.match(html, /映射待创建/);
  assert.match(html, /只读对比/);
});

test('run hero reports the current round without inventing a total', () => {
  const html = runHero(
    {
      state: {
        automation: { id: 'run-1', status: 'RUNNING' },
        latest: 'eeee5555',
        syncTarget: { commit: 'ffff6666' },
        accepted: { upstream: 'aaaa1111' },
      },
      journeyProgress: null,
    },
    { id: 'd1', status: 'ISSUES_REQUIRED', issues: [], base: {}, target: 'dddd4444', source: { kind: 'pull', number: 1, title: 'fix' } },
  );
  assert.match(html, /正在同步第 1 笔/);
  assert.match(html, /Issue/);
  assert.match(html, /v3-ring/);
});

test('pre-publish cancel is visible before any PR exists', () => {
  const html = candidateRecovery(
    {
      id: 'd1',
      status: 'ISSUES_REQUIRED',
      prUrl: null,
      candidate: null,
      issues: [],
      base: { internal: 'aaaa1111' },
    },
    false,
  );
  assert.match(html, /撤销本笔（尚未发布）/);
  assert.match(html, /data-form="cancel-delivery"/);
  assert.match(html, /放弃本笔并重新同步/);
  assert.doesNotMatch(html, /<details class="delivery-cancel" open>/);
});import { actionBar } from '../web/actionbar.mjs';

test('delivery-scoped actions render in the right action dock only for the current delivery', () => {
  const delivery = {
    id: 'd1',
    status: 'ISSUES_REQUIRED',
    prUrl: null,
    candidate: null,
    issues: [],
    base: { internal: 'aaaa1111' },
    source: { number: 1 },
  };
  const snapshot = {
    state: {
      automation: { id: 'run-1', status: 'RUNNING', autoMerge: false, continuation: 'automatic' },
      active: delivery,
    },
    operation: null,
    config: {},
  };
  const policy = { text: '继续同步', label: '继续同步', action: 'resume-sync', stage: 2 };
  const html = actionBar(policy, false, snapshot);
  assert.match(html, /本笔操作/);
  assert.match(html, /仅当前交付/);
  assert.match(html, /data-action="inspect-exit"/);
  assert.match(html, /撤销本笔（尚未发布）/);
  assert.match(html, /class="run-option delivery-actions"/);
  assert.equal(actionBar(policy, true, snapshot), '');
});
test('pending conflict resolution renders one explicit confirmation entry and dialog', () => {
  const snapshot = {
    state: {
      automation: { id: 'run-1', status: 'FAILED' },
      pendingConflict: {
        number: 1599,
        head: '3c0c6f92dcce6def060681e97a20a60308c0e7ea',
        landing: '466d4549fe2d75c9cc5c96b9497f47e464d13cf2',
        base: '7fca378fa010a288484e909446a2faeee5a7fbe2',
        files: ['a/A.ts', 'a/B.ts', 'a/C.ts'],
      },
    },
    operation: null,
    config: {},
  };
  const html = actionBar({ text: '继续同步', label: '继续同步', action: 'resume-sync', stage: 1 }, false, snapshot);
  assert.match(html, /PR 合入时包含冲突解决/);
  assert.match(html, /data-open-conflict/);
  assert.match(html, /data-action="accept-conflict-snapshot"/);
  assert.match(html, /3 个差异文件/);
  assert.equal(actionBar({ text: 'x', label: 'x', action: 'resume-sync', stage: 1 }, true, snapshot), '');
});
