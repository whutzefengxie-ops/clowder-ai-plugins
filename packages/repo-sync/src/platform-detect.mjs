const githubHosts = new Set(['github.com', 'www.github.com']);
export const platformModes = ['gitlab', 'github'];
export const isPlatformMode = (mode) => platformModes.includes(mode);
export const isPlatformApi = (value) => Boolean(value) && isPlatformMode(value.mode);
export const platformLabel = (platform) => (platform === 'github' ? 'GitHub' : 'GitLab v4 兼容接口');
export const isGithubHost = (value) => githubHosts.has(hostname(value));

function hostname(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return '';
  }
}

// GitHub 与 GitLab 都能提供 HTTPS 仓库首页；只有已知托管域名或显式 API 版本可以无歧义地判定协议，
// 其余自建地址默认沿用内部标准 GitLab v4，避免把真实内网平台误判成 GitHub。
export function detectInternalPlatform({ webUrl, apiUrl } = {}) {
  const api = typeof apiUrl === 'string' ? apiUrl.trim() : '';
  if (/\/api\/v4\/?$/i.test(api)) return 'gitlab';
  if (/\/api\/v3\/?$/i.test(api)) return 'github';
  return githubHosts.has(hostname(webUrl)) ? 'github' : 'gitlab';
}

export function platformApiBase(webUrl, platform) {
  const url = new URL(webUrl);
  if (platform !== 'github') return `${url.origin}/api/v4`;
  return githubHosts.has(url.hostname.toLowerCase()) ? 'https://api.github.com' : `${url.origin}/api/v3`;
}

export function platformProjectId(webUrl) {
  const path = new URL(webUrl).pathname.replace(/^\/+|\/+$/g, '');
  return decodeURIComponent(path);
}

export function platformApiEndsWith(apiUrl, platform) {
  const path = new URL(apiUrl).pathname.replace(/\/+$/, '');
  return platform === 'github' ? path === '' || path.endsWith('/api/v3') : path.endsWith('/api/v4');
}
