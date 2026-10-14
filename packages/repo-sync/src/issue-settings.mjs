import { fail, objectUrl } from './config.mjs';

export function issueConfiguration(config, input) {
  if (input.issueMode === undefined) return config?.issues;
  if (input.issueMode === 'manual') return undefined;
  if (input.issueMode === 'command' && config?.issues?.mode === 'command') return config.issues;
  if (input.issueMode === 'gitlab') {
    return apiConfiguration(config, input);
  }
  fail('INVALID_ISSUE_CONFIG', '请选择真实 Issue API；命令适配器需在本机私有配置中接入');
}
export const issueInputKeys = [
  'issueMode',
  'issueApiUrl',
  'issueProjectId',
  'issueTokenEnv',
  'issuePageUrl',
  'issueAuthMode',
];
export const apiInputKeys = issueInputKeys.filter((key) => key !== 'issueMode');
export function apiConfiguration(config, input) {
  if (input.issueAuthMode !== undefined && !['session', 'environment'].includes(input.issueAuthMode))
    fail('INVALID_ISSUE_CONFIG', '请选择直接输入 Token 或环境变量方式。');
  const page =
    input.issuePageUrl ||
    (!input.issueProjectId && config?.internalWebUrl ? `${config.internalWebUrl.replace(/\/$/, '')}/issues` : null);
  const inferred = issueCoordinates(page, config?.internalWebUrl),
    previous =
      config?.issues?.mode === 'gitlab'
        ? config.issues
        : config?.pullRequests?.mode === 'gitlab'
          ? config.pullRequests
          : null;
  return {
    mode: 'gitlab',
    apiUrl: input.issueApiUrl?.trim() || inferred?.apiUrl || previous?.apiUrl,
    projectId: input.issueProjectId?.trim() || inferred?.projectId || previous?.projectId,
    ...((input.issueAuthMode ?? previous?.authMode) === 'session'
      ? { authMode: 'session' }
      : { tokenEnv: input.issueTokenEnv?.trim() || previous?.tokenEnv }),
  };
}
function issueCoordinates(page, web) {
  if (!page) return null;
  let url, repository;
  try {
    url = new URL(objectUrl(page.trim()));
    repository = new URL(objectUrl(web));
  } catch {
    fail('INVALID_ISSUE_CONFIG', 'Issue 网页链接需为所配内部仓库的 HTTPS Issue 页面，不能包含凭据或查询参数。');
  }
  const project = url.pathname.replace(/\/(?:-\/)?issues(?:\/\d+)?\/?$/, '');
  if (
    project === url.pathname ||
    url.origin !== repository.origin ||
    project !== repository.pathname.replace(/\/$/, '')
  )
    fail(
      'ISSUE_API_UNSUPPORTED',
      '此链接不是所配仓库的 GitLab 兼容 Issue 路径；CodeHub 的其他接口需要匹配适配器，不能从网页链接猜测。',
    );
  return { apiUrl: `${url.origin}/api/v4`, projectId: project.replace(/^\//, '') };
}
export function checkIssueSettings(state, previous, next) {
  if (
    state?.issueAdapterId &&
    (JSON.stringify(previous.issues) !== JSON.stringify(next.issues) || previous.internalWebUrl !== next.internalWebUrl)
  )
    fail('ISSUE_CONFIG_FROZEN', '已有 Issue 创建意图，不能切换适配器或仓库；恢复原配置后继续');
}
