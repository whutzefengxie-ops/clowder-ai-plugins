import { authenticationForm, tokenField } from './issue-auth.mjs';
import { isPlatformMode, suggestedMode } from './platform-kind.mjs';

export function issueFields(config, esc) {
  const mode = suggestedMode(config, config?.issueAutomation?.mode ?? 'manual');
  return `<label data-issue-selection ${config?.mode === 'version' ? 'hidden' : ''}>Issue 创建与关单方式<select name="issueMode"><option value="auto" ${mode === 'auto' ? 'selected' : ''}>自动识别（推荐 · GitLab v4 / GitHub）</option><option value="manual" ${mode === 'manual' ? 'selected' : ''}>人工创建与状态登记</option><option value="gitlab" ${mode === 'gitlab' ? 'selected' : ''}>GitLab v4 兼容接口自动处理</option><option value="github" ${mode === 'github' ? 'selected' : ''}>GitHub / GitHub Enterprise API 自动处理</option>${mode === 'command' ? '<option value="command" selected>已有私有命令适配器自动处理</option>' : ''}</select></label><p>Git 传代码，平台 API 创建和关联对象。自动识别按内部仓库地址选择 GitLab v4 或 GitHub；其他协议需要对应适配器。</p>${config?.hideApiFields ? `<p>Issue 使用 PR 设置中的同一平台 API、项目路径和 Token，无需重复配置认证。</p>` : apiFields(config, esc)}`;
}
export function apiFields(config, esc) {
  const { value, auth, api } = interfaceSettings(config);
  return `<div data-issue-api ${api ? '' : 'hidden'}>
    <p><b>推荐：填写平台接口地址与项目，或留空自动推断。</b>GitHub 的 API 基础地址是 <code>https://api.github.com</code>（企业版以 <code>/api/v3</code> 结尾）；GitLab v4 兼容接口以 <code>/api/v4</code> 结尾。保存配置本身不验证平台权限。</p>
    <label>内部 Issue 网页链接 <small class="field-purpose">自动配置入口 · 可选</small><input name="issuePageUrl" type="url" placeholder="粘贴当前仓库的 Issue 列表或具体 Issue 链接"></label>
    <p>这是浏览器里的 Issue 页面。也可从上面的仓库首页推断；填写高级项目 ID 后可留空。</p>
    <p data-issue-inference class="issue-inference" role="status">填写内部仓库地址或 Issue 链接后会展示识别出的平台、API 基础地址和项目路径；识别不证明协议兼容或写权限。</p>
    <details data-issue-advanced><summary>高级接口设置（可选：覆盖自动推断）</summary>
      <label>内部平台 API 地址（完整 HTTPS URL） <small class="field-purpose">可选 · 留空自动推断</small><input name="issueApiUrl" value="${esc(value?.apiUrl ?? '')}" placeholder="https://api.github.com 或 https://内网/api/v4"></label>
      <p class="note-line">这里填接口服务的基础地址，不是项目路径。GitLab 保留到 /api/v4，GitHub 填 https://api.github.com（企业版 /api/v3），去掉后面的 /projects/… 或 /repos/… 资源路径。</p>
      <label>API 项目 ID / 路径 <small class="field-purpose">可选 · 留空自动推断</small><input name="issueProjectId" value="${esc(value?.projectId ?? '')}" placeholder="GitHub：owner/repo；GitLab：group/repo 或数字 ID"></label>
      <p class="note-line">GitHub 填 owner/repo；GitLab 填数字 ID 或项目路径。程序会组合成 /repos/owner/repo 或 /projects/group%2Frepo。</p>
    </details>
    <label>Token 提供方式<select name="issueAuthMode"><option value="session" ${auth === 'session' ? 'selected' : ''}>直接输入 Token（本次服务）</option><option value="environment" ${auth === 'environment' ? 'selected' : ''}>使用环境变量（高级 / 已有配置）</option></select></label>
    ${config?.hideToken || value?.apiUrl ? '' : `<div data-issue-token ${auth === 'environment' ? 'hidden' : ''}><p>Token 在执行平台接口时必需；请在本次配置中提供，已有可用认证时可留空。</p>${tokenField()}</div>`}
    <div data-issue-environment ${auth === 'environment' ? '' : 'hidden'}><label>Token 所在环境变量名称 <small class="field-purpose">仅环境变量方式必填</small><input name="issueTokenEnv" value="${esc(value?.tokenEnv ?? '')}" placeholder="REPO_SYNC_INTERNAL_TOKEN"></label><p>直接输入方式无需设置变量名称。</p></div>
  </div>`;
}
export function issueSettings(snapshot, esc) {
  if (!snapshot.connection || !snapshot.config || snapshot.config.mode !== 'continuous') return '';
  return `<section class="card" id="issue-settings"><h3>Issue 自动化设置</h3><details class="tech"><summary>说明</summary><div class="tech-copy">${snapshot.config.issueAutomation?.automatic ? '已配置自动化：程序创建或复用来源 Issue、关联本笔 PR，实际合入核验后按接收条件关单。' : '尚未启用 Issue 自动化：当前为人工登记。要完成自动搬运，请配置以下接口。'}Git 传输代码，平台 API 或扩展创建 PR；Git 本身没有通用的 Issue 接口。已有创建意图后设置固定。</div></details><form data-form="configure-issues"><input type="hidden" name="expectedRevision" value="${esc(snapshot.connection.revision)}">${issueFields({ ...snapshot.config, hideApiFields: isPlatformMode(snapshot.config.prTransport) }, esc)}<button type="submit">保存 Issue 自动化设置</button></form>${isPlatformMode(snapshot.config.prTransport) ? '' : authenticationForm(snapshot.config)}</section>`;
}
export function autoIssuePanel(delivery, state, esc) {
  return `<h3>自动创建 / 复用内部 Issue</h3><p>先按稳定来源标识查询原对象，再创建并回读。准备代码时也会执行这个步骤。失败后只恢复原意图，避免重复建单。</p>${delivery.issues.map((issue) => `<p><a href="${esc(issue.url)}" target="_blank" rel="noopener">外部 #${issue.number} ↗</a> → ${state.issues[issue.sourceId] ? `<a href="${esc(state.issues[issue.sourceId].url)}" target="_blank" rel="noopener">内部 #${esc(state.issues[issue.sourceId].internalId)} ↗</a>` : '待自动创建'} · ${issue.relation === 'closes' ? '上游 PR 有关闭事件，内部合入核验后关闭' : '仅引用 / 关联，内部 Issue 保持打开；上游需使用 closes、fixes 或 resolves 才会自动关单'}</p>`).join('')}<button type="button" data-action="sync-issues">创建 / 回读原内部 Issue</button>`;
}

function interfaceSettings(config) {
  const mode = config?.issueAutomation?.mode ?? 'manual',
    value = isPlatformMode(mode) ? config.issueAutomation : config?.platformApi,
    auth = value?.authMode ?? (value?.tokenEnv ? 'environment' : 'session'),
    api = isPlatformMode(mode) || isPlatformMode(config?.prTransport);
  return { value, auth, api };
}
