import { githubPlatformApi } from './github-platform-api.mjs';
import { gitlabApi } from './gitlab-api.mjs';

export function readPlatformProject(config, settings, family = 'ISSUE') {
  return settings.mode === 'github'
    ? githubPlatformApi(config, settings, family).request('')
    : gitlabApi(config, settings, family).request('');
}
// 平台项目身份必须与内部网页仓库一致：GitHub 用 full_name + html_url，GitLab 用 web_url。
export function verifyPlatformProject(settings, config, project) {
  if (!project || typeof project.id !== 'number') return false;
  const expected = config.internalWebUrl.replace(/\/+$/, '');
  if (settings.mode === 'github') {
    return (
      typeof project.full_name === 'string' &&
      project.full_name.toLowerCase() === String(settings.projectId).toLowerCase() &&
      typeof project.html_url === 'string' &&
      project.html_url.replace(/\/+$/, '').toLowerCase() === expected.toLowerCase()
    );
  }
  return project.web_url?.replace(/\/$/, '') === expected;
}
