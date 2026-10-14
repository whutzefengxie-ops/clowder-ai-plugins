import { fail } from './config.mjs';

export function issueConfiguration(config, input) {
  if (input.issueMode === undefined) return config?.issues;
  if (input.issueMode === 'manual') return undefined;
  if (input.issueMode === 'command' && config?.issues?.mode === 'command') return config.issues;
  if (input.issueMode === 'gitlab')
    return {
      mode: 'gitlab',
      apiUrl: input.issueApiUrl?.trim(),
      projectId: input.issueProjectId?.trim(),
      tokenEnv: input.issueTokenEnv?.trim(),
    };
  fail('INVALID_ISSUE_CONFIG', '请选择真实 Issue API；命令适配器需在本机私有配置中接入');
}
export const issueInputKeys = ['issueMode', 'issueApiUrl', 'issueProjectId', 'issueTokenEnv'];
export function checkIssueSettings(state, previous, next) {
  if (
    state?.issueAdapterId &&
    (JSON.stringify(previous.issues) !== JSON.stringify(next.issues) || previous.internalWebUrl !== next.internalWebUrl)
  )
    fail('ISSUE_CONFIG_FROZEN', '已有 Issue 创建意图，不能切换适配器或仓库；恢复原配置后继续');
}
