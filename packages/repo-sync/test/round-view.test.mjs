import assert from 'node:assert/strict';
import test from 'node:test';
import { roundView } from '../web/round-view.mjs';

const row = (number, status = 'pending') => ({
  target: number.toString(16).padStart(40, '0'),
  status,
  source: { number, title: `PR ${number}`, url: `https://example.test/pull/${number}`, kind: 'pr' },
  issueCount: 1,
  commitCount: 2,
});

function data() {
  return {
    runId: 'r',
    selection: { kind: 'commit', value: 'a'.repeat(40) },
    target: 'a'.repeat(40),
    status: 'RUNNING',
    total: 36,
    counts: { complete: 11, current: 1, pending: 24, cancelled: 0 },
    current: row(1410, 'current'),
    currentIndex: 11,
    items: [11, 12, 13, 14, 15].map((number) => row(number)),
    matched: 36,
    offset: 10,
    limit: 5,
    filter: 'all',
  };
}

test('the round list is collapsed by default and only shows the heading summary', () => {
  const html = roundView(data());
  assert.doesNotMatch(html, /round-items/);
  assert.doesNotMatch(html, /data-round-filter/);
  assert.match(html, /展开清单（36 笔）/);
  assert.match(html, /11 \/ 36 笔已完成/);
});

test('expanding shows five rows, pagination and the current page range', () => {
  const html = roundView(data(), '', { open: true });
  assert.equal((html.match(/<li /g) ?? []).length, 5);
  assert.match(html, /显示 11–15 \/ 36 笔/);
  assert.match(html, /data-round-page="-1"/);
  assert.match(html, /data-round-page="1"/);
  assert.match(html, /收起清单/);
});

test('a single short page does not render paging buttons', () => {
  const short = { ...data(), matched: 4, offset: 0, items: [1, 2, 3, 4].map((number) => row(number)) };
  const html = roundView(short, '', { open: true });
  assert.doesNotMatch(html, /data-round-page/);
  assert.match(html, /显示 1–4 \/ 4 笔/);
});
