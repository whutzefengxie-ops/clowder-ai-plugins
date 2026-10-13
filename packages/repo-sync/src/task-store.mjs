import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { readText } from './atomic-file.mjs';
import { fail } from './config.mjs';
import { writePrivate } from './private-config.mjs';

export const taskActions = new Set([
  'heads',
  'adopt',
  'discover',
  'prepare',
  'recover',
  'tags',
  'select-tag',
  'pr',
  'clear-pr',
  'create-pr',
]);
const keys = new Set([
  'action',
  'requestId',
  'upstream',
  'internal',
  'tag',
  'deliveryId',
  'expectedBinding',
  'expectedRevision',
  'url',
  'previousUrl',
]);
export function taskInput(input) {
  if (!taskActions.has(input?.action)) fail('UNKNOWN_ACTION', '此操作不支持后台执行');
  if (!/^[a-f0-9]{32}$/.test(input.requestId ?? '') || Object.keys(input).some((key) => !keys.has(key)))
    fail('INVALID_TASK_INPUT', '任务需要有效请求标识和受限操作参数');
  return createHash('sha256')
    .update(
      JSON.stringify(
        Object.keys(input)
          .sort()
          .map((key) => [key, input[key]]),
      ),
    )
    .digest('hex');
}
export function taskPlan(action) {
  const probes = [
    ['source-probe', '检查外部连接与分支'],
    ['internal-probe', '检查内部连接与分支'],
  ];
  const fetch = [
    ...probes,
    ['object-store', '准备私有对象目录'],
    ['source-fetch', '下载外部对象'],
    ['internal-fetch', '下载内部对象'],
  ];
  const plans = {
    heads: probes,
    adopt: [...fetch, ['baseline-check', '核验 U0 / I0 与历史'], ['baseline-save', '登记已有基线']],
    tags: [['source-tags', '读取上游 tag']],
    pr: [['platform-pr', '核验候选并登记 PR 引用']],
    'clear-pr': [['platform-pr', '核验未合入并撤销错误引用']],
    'create-pr': [['platform-pr', '查询/创建并回读内部 PR']],
  };
  return (plans[action] ?? fetch).map(([key, label]) => ({ id: key, key, label, status: 'PENDING' }));
}
export async function readTask(config, id) {
  if (!config?.stateDir) return null;
  try {
    const folder = join(config.stateDir, 'operations');
    if (!id) id = JSON.parse(await readText(join(folder, 'latest.json'))).id;
    if (!/^[a-f0-9]{32}$/.test(id)) fail('TASK_UNREADABLE', '任务记录格式无效，请在本机核对');
    const value = JSON.parse(await readText(join(folder, `${id}.json`)));
    if (value.bindingId !== config.bindingId) return null;
    if (value.id !== id || !Array.isArray(value.steps)) fail('TASK_UNREADABLE', '任务记录不属于当前绑定或格式无效');
    return value;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    fail('TASK_UNREADABLE', '任务记录无法读取，保留原文件；请在本机核对');
  }
}
export async function saveTask(config, value, first = false) {
  if (!config?.stateDir) return;
  const folder = join(config.stateDir, 'operations');
  await mkdir(folder, { recursive: true });
  await writePrivate(join(folder, `${value.id}.json`), value);
  if (first) await writePrivate(join(folder, 'latest.json'), { id: value.id });
}
export function publicTask(value, owned) {
  if (!value) return null;
  const { id, action, status, startedAt, updatedAt, finishedAt, steps, result, error, cancellable } = value;
  return {
    id,
    action,
    status,
    startedAt,
    updatedAt,
    finishedAt,
    steps: steps.map(({ id, label, status, startedAt, finishedAt, progress, error }) => ({
      id,
      label,
      status,
      startedAt,
      finishedAt,
      progress,
      error,
    })),
    result,
    error,
    cancellable: Boolean(owned && cancellable && status === 'RUNNING'),
  };
}
