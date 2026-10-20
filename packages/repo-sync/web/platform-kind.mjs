export const platformModes = ['gitlab', 'github'];
export const isPlatformMode = (mode) => platformModes.includes(mode);
export const platformLabel = (platform) => (platform === 'github' ? 'GitHub' : 'GitLab v4 兼容接口');
export const isGithubHost = (value) => {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === 'github.com' || host === 'www.github.com';
  } catch {
    return false;
  }
};
// 与服务端相同的自动识别顺序：GitHub 托管域名或显式 API 版本优先，其余沿用内部标准 GitLab v4。
export function detectPlatform(webUrl, requested = 'auto', apiUrl = '') {
  if (isPlatformMode(requested)) return requested;
  if (isGithubHost(webUrl)) return 'github';
  if (/\/api\/v3\/?$/i.test(apiUrl)) return 'github';
  return 'gitlab';
}
export function platformApiBase(webUrl, platform) {
  const url = new URL(webUrl);
  if (platform !== 'github') return `${url.origin}/api/v4`;
  return isGithubHost(webUrl) ? 'https://api.github.com' : `${url.origin}/api/v3`;
}
export function platformProjectId(webUrl) {
  return decodeURIComponent(new URL(webUrl).pathname.replace(/^\/+|\/+$/g, ''));
}
// 已保存的 GitLab 配置指向 github.com 时（旧版按 /api/v4 推断的结果），表单默认显示“自动识别”，
// 保存后由服务端解析为 GitHub；其他组合保留用户已明确选择的平台。
export function suggestedMode(config, mode) {
  return mode === 'gitlab' && isGithubHost(config?.internalWebUrl) ? 'auto' : mode;
}
