export function updateIssueInference(form) {
  const output = form?.querySelector('[data-issue-inference]');
  if (!output) return;
  const value = (name) => form.elements.namedItem(name)?.value.trim() ?? '';
  try {
    const web = new URL(value('internalWebUrl')),
      page = new URL(value('issuePageUrl') || `${web.href.replace(/\/$/, '')}/issues`),
      project = page.pathname.replace(/\/(?:-\/)?issues(?:\/\d+)?\/?$/, '');
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
    const api = value('issueApiUrl') || `${page.origin}/api/v4`,
      path = value('issueProjectId') || decodeURIComponent(project.replace(/^\//, '')),
      url = new URL(api);
    if (url.username || url.password || url.search || url.hash || !/^[\w./%-]+$/.test(path)) throw Error();
    output.textContent = `${value('issueApiUrl') || value('issueProjectId') ? '将使用高级设置与链接推断结果' : '已从链接自动推断'}：API 基础地址 ${api}；项目 ID / 路径 ${path}。保存后可点击“验证平台接口（只读）”核对。`;
  } catch {
    output.textContent =
      '填写同一内部仓库的 Issue 链接后，可自动推断 API 地址和项目路径；已有数字项目 ID 或独立 API 域名时，展开高级设置填写。推断结果需在保存后进行只读核验。';
  }
}
