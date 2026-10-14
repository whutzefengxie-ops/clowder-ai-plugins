import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { readText } from './atomic-file.mjs';
import { fail } from './config.mjs';
import { writePrivate } from './private-config.mjs';
import { validateSnapshot } from './recording.mjs';

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
  'start',
  'issue',
  'sync-issues',
  'receipts',
  'resolve',
  'cancel-version',
]);
const keys = new Set([
  'action',
  'requestId',
  'upstream',
  'internal',
  'tag',
  'targetKind',
  'targetValue',
  'deliveryId',
  'expectedBinding',
  'expectedRevision',
  'url',
  'previousUrl',
  'expectedTarget',
  'sourceId',
  'internalId',
  'previousId',
  'observations',
  'path',
  'choice',
  'content',
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
    issue: [['issue-mapping', '登记 / 纠正 Issue 来源映射']],
    resolve: [['conflict-resolution', '保存当前交付的冲突处理']],
    'cancel-version': [['version-cancel', '撤销当前未发布版本交付']],
  };
  return (plans[action] ?? fetch).map(([key, label]) => ({ id: key, key, label, status: 'PENDING' }));
}
export async function readTask(config, id) {
  if (!config?.stateDir) return null;
  const explicit = Boolean(id);
  let indexed = false;
  try {
    const folder = join(config.stateDir, 'operations');
    if (!id) {
      id = JSON.parse(await readText(join(folder, 'latest.json'))).id;
      indexed = true;
    }
    if (!/^[a-f0-9]{32}$/.test(id)) fail('TASK_UNREADABLE', '任务记录格式无效，请在本机核对');
    const value = JSON.parse(await readText(join(folder, `${id}.json`)));
    validateTaskVersion(value);
    if (value.bindingId !== config.bindingId) {
      if (explicit) fail('TASK_BINDING_CHANGED', '原请求属于其他仓库绑定，暂停；不可当成未使用的请求标识覆盖');
      return null;
    }
    if (
      value.id !== id ||
      !taskActions.has(value.action) ||
      !['RUNNING', 'CANCELLING', 'STOP_UNCONFIRMED', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'INTERRUPTED'].includes(
        value.status,
      ) ||
      !Number.isInteger(value.ownerPid) ||
      value.ownerPid < 1 ||
      !/^[a-f0-9]{64}$/.test(value.inputHash ?? '') ||
      !Number.isFinite(Date.parse(value.startedAt)) ||
      !Array.isArray(value.steps) ||
      value.steps.some(
        (step) =>
          !step ||
          typeof step.id !== 'string' ||
          typeof step.label !== 'string' ||
          !['PENDING', 'RUNNING', 'DONE', 'FAILED'].includes(step.status),
      )
    )
      fail('TASK_UNREADABLE', '任务记录缺少有效状态、执行器或步骤，暂停；不可当成已完成或自动重建');
    return value;
  } catch (error) {
    if (error.safeToDisplay) throw error;
    if (error.code === 'ENOENT' && !indexed) return null;
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
export function publicTask(value, owned, canRetryPersistence = false) {
  if (!value) return null;
  const { id, action, status, startedAt, updatedAt, finishedAt, steps, result, error, cancellable } = value;
  return {
    id,
    schema: value.schema,
    deliveryId: value.deliveryId,
    configSnapshot: value.configSnapshot,
    action,
    status,
    startedAt,
    updatedAt,
    finishedAt,
    steps: steps.map(({ id, key, stage, group, parentId, label, status, startedAt, finishedAt, progress, error }) => ({
      id,
      key,
      stage,
      group,
      parentId,
      label,
      status,
      startedAt,
      finishedAt,
      progress,
      error,
    })),
    result,
    error,
    ...(value.persistence
      ? { persistence: { ...value.persistence, canRetry: Boolean(owned && canRetryPersistence) } }
      : {}),
    cancellable: Boolean(owned && cancellable && status === 'RUNNING'),
  };
}

function validateTaskVersion(value) {
  if (value.schema !== undefined && value.schema !== 2) fail('TASK_UNREADABLE', '任务记录版本不支持，不能当旧格式重建');
  if (value.schema === 2) {
    if (value.deliveryId !== null && !/^[a-f0-9]{24}$/.test(value.deliveryId ?? ''))
      fail('TASK_UNREADABLE', '任务同步身份无效');
    try {
      validateSnapshot(value.configSnapshot);
    } catch {
      fail('TASK_UNREADABLE', '任务配置摘要损坏，保留原记录');
    }
    if (
      value.steps?.some(
        (step) => !Number.isInteger(step.stage) || step.stage < 0 || step.stage > 5 || typeof step.group !== 'string',
      )
    )
      fail('TASK_UNREADABLE', '任务步骤归属无效');
  }
}
