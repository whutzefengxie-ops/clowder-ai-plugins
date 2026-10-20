import { detectPlatform, platformApiBase, platformLabel, platformProjectId } from './platform-kind.mjs';

export function updateIssueInference(form) {
  const output = form?.querySelector('[data-issue-inference]');
  if (!output) return;
  const value = (name) => form.elements.namedItem(name)?.value.trim() ?? '';
  try {
    const page = new URL(value('issuePageUrl') || `${value('internalWebUrl').replace(/\/$/, '')}/issues`),
      project = page.pathname.replace(/\/(?:-\/)?issues(?:\/\d+)?\/?$/, ''),
      web = new URL(value('internalWebUrl') || `${page.origin}${project}`);
    if (
      page.protocol !== 'https:' ||
      page.username ||
      page.password ||
      page.search ||
      page.hash ||
      project === page.pathname ||
      page.origin !== web.origin ||
      project !== web.pathname.replace(/\/$/, '')
    )
      throw Error();
    const requested = value('issueMode') || 'auto',
      platform = detectPlatform(`${web.origin}${project}`, requested, value('issueApiUrl')),
      repository = `${web.origin}${project}`,
      inferredApi = platformApiBase(repository, platform),
      api = value('issueApiUrl') || inferredApi,
      path = value('issueProjectId') || platformProjectId(repository),
      url = new URL(api);
    if (url.username || url.password || url.search || url.hash || !/^[\w./%-]+$/.test(path)) throw Error();
    const origin = value('issueApiUrl') || value('issueProjectId') ? '高级覆盖' : value('issuePageUrl') ? '由 Issue 页面推导' : '由仓库首页推导';
    const chosen = value('issueMode') === 'auto' || !value('issueMode') ? `${origin} · 自动识别` : origin;
    output.textContent = `${chosen}：${platformLabel(platform)}；仓库 ${repository}；API 基础地址 ${api}；项目路径 ${path}。保存后进行只读检查；推导不证明协议兼容或写权限。`;
    output.dataset.platform = platform;
  } catch {
    output.textContent =
      '填写同一内部仓库的 Issue 链接后，可自动识别 GitLab v4 或 GitHub 并推断 API 地址和项目路径；独立 API 域名或 GitHub Enterprise 可在高级设置覆盖。推断结果需在保存后进行只读核验。';
    output.dataset.platform = '';
  }
}
