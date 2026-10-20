import { configurationErrors } from './configuration-errors.mjs';
import { isPlatformMode, platformApiEndsWith } from './platform-detect.mjs';

export function validatePlatformApi(config, value) {
  const errors = [];
  const mode = value.mode ?? 'gitlab';
  let url, project;
  try {
    if (typeof value.apiUrl !== 'string') throw new Error();
    url = new URL(value.apiUrl.trim());
  } catch {
    errors.push(['issueApiUrl', 'url']);
  }
  if (url) {
    const reason = apiProblem(config, url, mode);
    if (reason) errors.push(['issueApiUrl', reason]);
  }
  try {
    project = projectPath(value.projectId, mode);
  } catch {
    errors.push(['issueProjectId', mode === 'github' ? 'pathGithub' : 'path']);
  }
  if (value.mode !== undefined && !isPlatformMode(value.mode)) errors.push(['issueMode', 'platform']);
  if (value.authMode !== undefined && !['session', 'environment'].includes(value.authMode))
    errors.push(['issueAuthMode', 'mode']);
  else if (value.authMode !== 'session' && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(value.tokenEnv ?? ''))
    errors.push(['issueTokenEnv', 'name']);
  if (errors.length) configurationErrors(errors);
  value.apiUrl = value.apiUrl.trim().replace(/\/+$/, '');
  value.projectId = mode === 'github' || typeof value.projectId !== 'number' ? project : value.projectId;
}
export function projectPath(value, platform = 'gitlab') {
  if (typeof value !== 'string' && typeof value !== 'number') throw new Error();
  const project = decodeURIComponent(String(value).trim());
  if (platform === 'github') {
    if (!/^[\w.-]+\/[\w.-]+$/.test(project) || project.split('/').some((part) => ['.', '..'].includes(part)))
      throw new Error();
    return project;
  }
  if (!/^[\w./-]+$/.test(project) || project.split('/').some((part) => ['', '.', '..'].includes(part)))
    throw new Error();
  return project;
}
function apiProblem(config, url, platform) {
  const local = config.allowLocal && url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname);
  if (!local && url.protocol !== 'https:') return 'https';
  if (url.username || url.password || url.href.includes('?') || url.href.includes('#')) return 'credentials';
  if (platform !== 'github') return platformApiEndsWith(url.href, 'gitlab') ? null : 'root';
  const path = url.pathname.replace(/\/+$/, '');
  if (path === '') return url.hostname.toLowerCase() === 'api.github.com' ? null : 'rootGithub';
  return path.endsWith('/api/v3') ? null : 'rootGithub';
}
