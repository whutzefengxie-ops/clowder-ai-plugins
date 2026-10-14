import { updateIssueInference } from './issue-inference.mjs';

export function tokenField() {
  return '<label>内部平台 Token<input type="password" name="issueToken" autocomplete="off" placeholder="输入 Token，不回显原值"></label><p>仅供当前项目的平台 API 使用；只保留在本次服务内存，重启后需要重新输入，不保存到浏览器草稿、配置或执行记录。</p>';
}
export function authenticationForm(config) {
  const api = config.platformApi ?? config.issueAutomation;
  if (api?.mode !== 'gitlab') return '';
  const available = api.authentication?.available;
  return `<section id="issue-auth"><h4>平台认证与接口验证</h4><p>${available ? '认证已提供；仍需验证接口。' : '需要提供 Token，或恢复原环境变量。'}输入 Token 不代表平台接口已通过核验。</p><form data-secret-form="issue-token">${tokenField()}<button type="submit">提供 / 更换 Token（本次服务）</button><button type="button" data-issue-check>验证平台接口（只读）</button><button type="button" data-issue-clear>清除本次输入的 Token</button></form><p data-auth-feedback role="status"></p></section>`;
}
export function createIssueAuthentication(snapshot, refresh, errorPanel) {
  async function request(path, value) {
    const { pageProjectId, projectUrl } = await import('./project-scope.mjs');
    const response = await fetch(projectUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Repo-Sync-Token': snapshot().token },
      body: JSON.stringify({
        expectedRevision: snapshot().connection.revision,
        ...(snapshot().workspace ? { projectId: pageProjectId } : {}),
        ...value,
      }),
      signal: AbortSignal.timeout(35000),
    });
    const result = await response.json();
    if (!response.ok) throw Error(`${result.code}：${result.message}`);
    return result;
  }
  function take(form) {
    const field = form.elements.namedItem('issueToken'),
      value = field?.value ?? '';
    if (field) field.value = '';
    return value;
  }
  async function set(value) {
    await request('/api/issue-auth', { token: value });
    await refresh();
  }
  function feedback(message) {
    const target = document.querySelector('[data-auth-feedback]');
    if (target) target.textContent = message;
    else {
      errorPanel.textContent = message;
      errorPanel.hidden = false;
    }
  }
  async function submit(form) {
    const value = take(form);
    try {
      if (!value) throw Error('请先输入 Token；不会保存空值或覆盖原认证。');
      await set(value);
      feedback('Token 已提供，仅在本次服务内存。下一步点击只读验证，尚未创建或修改 Issue。');
    } catch (error) {
      feedback(error.message);
    }
  }
  async function provide(value) {
    try {
      await set(value);
      return true;
    } catch (error) {
      feedback(`配置已经保存，但 Token 提供未确认；请在当前项目重新输入。${error.message}`);
      return false;
    }
  }
  document.addEventListener('click', async (event) => {
    const check = event.target.closest('[data-issue-check]'),
      clear = event.target.closest('[data-issue-clear]');
    if (!check && !clear) return;
    try {
      if (clear) {
        await set('');
        feedback('已清除本次输入；环境变量认证若存在仍保留。');
      } else {
        const result = await request('/api/issue-check', {});
        feedback(
          `项目 API 只读核验通过；没有创建或修改 Issue / PR。${result.defaultBranch ? `平台默认分支 ${result.defaultBranch}；当前合入分支 ${snapshot().config.targetBranch}，请核对选择。` : ''}`,
        );
      }
    } catch (error) {
      feedback(error.message);
    }
  });
  document.addEventListener('change', (event) => {
    if (['issueMode', 'issueAuthMode', 'prMode', 'mode'].includes(event.target.name))
      updateIssueFields(event.target.closest('form'));
  });
  document.addEventListener('input', (event) => {
    if (['internalWebUrl', 'issuePageUrl', 'issueApiUrl', 'issueProjectId'].includes(event.target.name))
      updateIssueInference(event.target.closest('form'));
  });
  return { take, set, submit, provide, complete: (result, token) => (result && token ? provide(token) : true) };
}
export function updateIssueFields(form) {
  if (!form) return;
  const pr = form.elements.namedItem('prMode'),
    summary = form.querySelector('[data-pr-summary]');
  if (pr && summary)
    summary.textContent = `保存后采用：${pr.selectedOptions[0].textContent}；审核合入仍在内部平台完成。`;
  const mode = form.elements.namedItem('issueMode')?.value,
    auth = form.elements.namedItem('issueAuthMode')?.value,
    version = form.elements.namedItem('mode')?.value === 'version';
  const selection = form.querySelector('[data-issue-selection]');
  if (selection) selection.hidden = version;
  const api = form.querySelector('[data-issue-api]');
  if (api) api.hidden = form.elements.namedItem('prMode')?.value !== 'gitlab' && (version || mode !== 'gitlab');
  const direct = form.querySelector('[data-issue-token]'),
    environment = form.querySelector('[data-issue-environment]');
  if (direct) direct.hidden = auth === 'environment';
  if (environment) environment.hidden = auth !== 'environment';
  updateIssueInference(form);
}
