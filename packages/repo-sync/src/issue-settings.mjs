import { configurationErrors } from './configuration-errors.mjs';
import {
  detectInternalPlatform,
  isGithubHost,
  isPlatformMode,
  platformApiBase,
  platformProjectId,
} from './platform-detect.mjs';
import { fail, objectUrl } from './config.mjs';

export function issueConfiguration(config, input) {
  if (input.issueMode === undefined) return config?.issues;
  if (input.issueMode === 'manual') return undefined;
  if (input.issueMode === 'command' && config?.issues?.mode === 'command') return config.issues;
  const platform = resolvePlatform(config, input, input.issueMode);
  return apiConfiguration(config, input, platform);
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
// 自动识别只依据内部仓库地址与显式 API 版本：github.com 一定是 GitHub，/api/v3 表示 GitHub Enterprise，
// 其余自建地址沿用内部标准 GitLab v4；显式选择的平台不会在这里被改写。
export function resolvePlatform(config, input, requested = 'auto') {
  if (isPlatformMode(requested)) return requested;
  const web = input.internalWebUrl || config?.internalWebUrl;
  if (!web) return 'gitlab';
  if (isGithubHost(web)) return 'github';
  if (/\/api\/v3\/?$/i.test(input.issueApiUrl ?? config?.issues?.apiUrl ?? '')) return 'github';
  return detectInternalPlatform({ webUrl: web, apiUrl: input.issueApiUrl });
}
export function repositoryWebFromIssue(page) {
  if (!page) return undefined;
  const value = objectUrl(page.trim());
  const url = new URL(value);
  const path = url.pathname.replace(/\/(?:-\/)?issues(?:\/\d+)?\/?$/, '');
  if (!path || path === url.pathname) configurationErrors([['issuePageUrl', 'url']]);
  return `${url.origin}${path}`;
}
export function apiConfiguration(config, input, platform) {
  if (input.issueAuthMode !== undefined && !['session', 'environment'].includes(input.issueAuthMode))
    configurationErrors([['issueAuthMode', 'mode']]);
  const web = config?.internalWebUrl;
  const page = input.issuePageUrl || (web ? `${web.replace(/\/$/, '')}/issues` : null);
  const inferred = issueCoordinates(page, web, platform),
    auto = input.issueMode === 'auto' || input.prMode === 'auto',
    previous = auto
      ? null
      : config?.issues?.mode === platform
        ? config.issues
        : config?.pullRequests?.mode === platform
          ? config.pullRequests
          : null;
  return {
    mode: platform,
    // 自动识别以内部仓库推断为准：表单里残留的旧平台地址（例如 github.com 仓库仍带着 /api/v4）
    // 不能覆盖本次识别结果；需要独立 API 域名时显式选择平台再填高级覆盖。
    apiUrl: auto
      ? (inferred?.apiUrl ?? input.issueApiUrl?.trim())
      : setting(input.issueApiUrl, inferred?.apiUrl, previous?.apiUrl),
    projectId: auto
      ? (inferred?.projectId ?? input.issueProjectId?.trim())
      : setting(input.issueProjectId, inferred?.projectId, previous?.projectId),
    ...((input.issueAuthMode ?? previous?.authMode) === 'session'
      ? { authMode: 'session' }
      : { tokenEnv: input.issueTokenEnv?.trim() || previous?.tokenEnv }),
  };
}
function setting(input, inferred, previous) {
  return input === undefined ? (previous ?? inferred) : input?.trim() || inferred;
}
function issueCoordinates(page, web, platform) {
  if (!page) return null;
  let url, repository;
  try {
    repository = new URL(objectUrl(web));
  } catch {
    configurationErrors([['internalWebUrl', 'url']]);
  }
  try {
    url = new URL(objectUrl(page.trim()));
  } catch {
    configurationErrors([['issuePageUrl', 'url']]);
  }
  const project = url.pathname.replace(/\/(?:-\/)?issues(?:\/\d+)?\/?$/, '');
  if (
    project === url.pathname ||
    url.origin !== repository.origin ||
    project !== repository.pathname.replace(/\/$/, '')
  )
    configurationErrors([['issuePageUrl', 'repository']], 'ISSUE_API_UNSUPPORTED');
  return { apiUrl: platformApiBase(`${url.origin}${project}`, platform), projectId: platformProjectId(`${url.origin}${project}`) };
}
export function checkIssueSettings(state, previous, next) {
  if (
    state?.issueAdapterId &&
    (JSON.stringify(previous.issues) !== JSON.stringify(next.issues) || previous.internalWebUrl !== next.internalWebUrl)
  )
    fail('ISSUE_CONFIG_FROZEN', '已有 Issue 创建意图，不能切换适配器或仓库；恢复原配置后继续');
}
