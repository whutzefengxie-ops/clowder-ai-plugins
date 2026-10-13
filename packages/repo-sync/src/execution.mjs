import { AsyncLocalStorage } from 'node:async_hooks';
import { fail } from './config.mjs';

const scope = new AsyncLocalStorage();
export const execution = () => scope.getStore();
export const runExecution = (context, operation) => scope.run(context, operation);
export function checkpoint() {
  if (execution()?.signal.aborted) fail('OPERATION_CANCELLED', '操作已取消；未继续执行下一步');
}
export async function phase(id, label, operation, cancellable = true) {
  checkpoint();
  const context = execution();
  if (!context) return operation();
  context.cancellable = context.allowCancel && cancellable;
  context.report({ kind: 'start', id, label, cancellable: context.cancellable });
  try {
    const result = await operation();
    context.report({ kind: 'done', id });
    return result;
  } catch (error) {
    context.report({ kind: 'failed', id, error: safeError(error) });
    throw error;
  }
}
export function safeError(error) {
  if (!error.safeToDisplay)
    return {
      code: 'OPERATION_FAILED',
      message: '操作未完成，请在本机核对工具、目录权限和当前步骤；原始输出不会写入执行记录',
    };
  return {
    code: /^[A-Z_]+$/.test(error.code ?? '') ? error.code : 'OPERATION_FAILED',
    message: error.code ? error.message : '操作未完成，请核对当前步骤；原始输出保留在本机环境',
    ...(error.details?.paths ? { details: { paths: error.details.paths } } : {}),
  };
}
export function progress(text) {
  const pattern =
    /(Receiving objects|Resolving deltas|Counting objects|Compressing objects):\s*(\d{1,3})%\s*\((\d+)\/(\d+)\)/g;
  for (const match of text.matchAll(pattern)) {
    const percent = Number(match[2]);
    const completed = Number(match[3]);
    const total = Number(match[4]);
    if (percent > 100 || !Number.isSafeInteger(completed) || !Number.isSafeInteger(total) || completed > total)
      continue;
    execution()?.report({
      kind: 'progress',
      phase: match[1],
      percent,
      completed,
      total,
    });
  }
}
