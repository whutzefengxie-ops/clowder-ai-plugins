import { fail } from './config.mjs';
export function prConfiguration(config, mode) {
  if (mode === undefined) return config?.pullRequests;
  if (mode === 'manual') return undefined;
  if (mode === 'git') return config?.pullRequests?.mode === 'git' ? { ...config.pullRequests } : { mode: 'git' };
  if (mode === 'command' && config?.pullRequests?.mode === 'command') return config.pullRequests;
  fail('INVALID_PR_ADAPTER', '请选择 Git 自动创建或明确手工创建；命令适配器需先在私有配置接入');
}
export function checkPlatformInput(input, receiver, revision) {
  if (Object.keys(input).some((key) => !['action', 'expectedRevision', 'internalWebUrl', 'prMode'].includes(key)))
    fail('INVALID_CONFIGURATION_INPUT', '平台设置仅接受创建方式与网页仓库地址，不能提交命令');
  if (!receiver || input.expectedRevision !== revision)
    fail('CONFIGURATION_CHANGED', '配置已变化或尚未创建，请刷新核对');
  if (!['git', 'manual', 'command'].includes(input.prMode)) fail('INVALID_PR_ADAPTER', '请选择 PR 创建方式');
}
export function checkFrozenPr(active, previous, next) {
  if (!active?.gitPr && !active?.prCreation && !active?.prUrl) return;
  if (
    next.internalWebUrl !== previous.internalWebUrl ||
    JSON.stringify(next.pullRequests ?? null) !== JSON.stringify(previous.pullRequests ?? null)
  )
    fail('PR_CONFIG_FROZEN', '当前交付已关联或发起 PR，不能更换创建配置；先核对原交付，不覆盖台账');
}
export function publicPlatform(receiver) {
  const config = receiver?.config;
  return {
    prMode: config?.pullRequests ? 'automatic' : 'manual',
    transport: config?.pullRequests?.mode ?? 'manual',
    repositoryUrl: config?.internalWebUrl ?? null,
  };
}
