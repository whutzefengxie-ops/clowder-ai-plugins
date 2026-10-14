import { authenticationForm, tokenField } from './issue-auth.mjs';
export function issueFields(config, esc) {
  const mode = config?.issueAutomation?.mode ?? 'manual';
  return `<label data-issue-selection ${config?.mode === 'version' ? 'hidden' : ''}>Issue 创建与关单方式<select name="issueMode"><option value="manual" ${mode === 'manual' ? 'selected' : ''}>人工创建与状态登记</option><option value="gitlab" ${mode === 'gitlab' ? 'selected' : ''}>CodeHub / GitLab v4 兼容接口自动处理</option>${mode === 'command' ? '<option value="command" selected>已有私有命令适配器自动处理</option>' : ''}</select></label><p>Git 传代码，平台 API 创建和关联对象。请选择与内部平台匹配的方式，其他协议需要对应适配器。</p>${config?.hideApiFields ? '<p>Issue 使用上方 PR 设置中的同一平台 API、项目路径和 Token，无需重复配置认证。</p>' : apiFields(config, esc)}`;
}
export function apiFields(config, esc) {
  const { value, auth, api } = interfaceSettings(config);
  return `<div data-issue-api ${api ? '' : 'hidden'}><label>内部 Issue 网页链接<input name="issuePageUrl" type="url" placeholder="粘贴当前仓库的一条 Issue 链接"></label><p>兼容路径可据此生成项目路径，不需要寻找数字项目 ID；有独立 API 域名或子路径时在高级选项修正。</p><label>Token 提供方式<select name="issueAuthMode"><option value="session" ${auth === 'session' ? 'selected' : ''}>直接输入 Token（本次服务）</option><option value="environment" ${auth === 'environment' ? 'selected' : ''}>使用环境变量（高级 / 已有配置）</option></select></label>${value?.apiUrl ? '' : `<div data-issue-token ${auth === 'environment' ? 'hidden' : ''}>${tokenField()}</div>`}<label>内部平台 API 地址<input name="issueApiUrl" value="${esc(value?.apiUrl ?? '')}" placeholder="兼容接口示例：https://内部平台/api/v4"></label><p>API 和仓库网页可以使用不同域名。与网页同域的标准部署可以留空，由链接生成；CodeHub 请填写实际 API 域名。</p><details ${value?.projectId ? 'open' : ''}><summary>高级项目设置（通常可从链接生成）</summary><label>API 项目 ID / 路径<input name="issueProjectId" value="${esc(value?.projectId ?? '')}" placeholder="可填项目路径，或从 Issue 链接生成"></label></details><div data-issue-environment ${auth === 'environment' ? '' : 'hidden'}><label>Token 所在环境变量名称<input name="issueTokenEnv" value="${esc(value?.tokenEnv ?? '')}" placeholder="REPO_SYNC_INTERNAL_TOKEN"></label><p>仅在选择环境变量方式时需要。直接输入方式无需设置变量名称。</p></div></div>`;
}
export function issueSettings(snapshot, esc) {
  if (!snapshot.connection || !snapshot.config || snapshot.config.mode !== 'continuous') return '';
  return `<section class="card" id="issue-settings"><h3>Issue 自动化设置</h3><p>${snapshot.config.issueAutomation?.automatic ? '已配置自动化：程序创建或复用来源 Issue、关联本笔 PR，实际合入核验后按接收条件关单。' : '尚未启用 Issue 自动化：当前为人工登记。要完成自动搬运，请配置以下接口。'}Git 传输代码，平台 API 或扩展创建 PR；Git 本身没有通用的 Issue 接口。已有创建意图后设置固定。</p><form data-form="configure-issues"><input type="hidden" name="expectedRevision" value="${esc(snapshot.connection.revision)}">${issueFields({ ...snapshot.config, hideApiFields: snapshot.config.prTransport === 'gitlab' }, esc)}<button type="submit">保存 Issue 自动化设置</button></form>${snapshot.config.prTransport === 'gitlab' ? '' : authenticationForm(snapshot.config)}</section>`;
}
export function autoIssuePanel(delivery, state, esc) {
  return `<h3>自动创建 / 复用内部 Issue</h3><p>先按稳定来源标识查询原对象，再创建并回读。准备代码时也会执行这个步骤。失败后只恢复原意图，避免重复建单。</p>${delivery.issues.map((issue) => `<p><a href="${esc(issue.url)}" target="_blank" rel="noopener">外部 #${issue.number} ↗</a> → ${state.issues[issue.sourceId] ? `<a href="${esc(state.issues[issue.sourceId].url)}" target="_blank" rel="noopener">内部 #${esc(state.issues[issue.sourceId].internalId)} ↗</a>` : '待自动创建'} · ${issue.relation === 'closes' ? '接收条件全部满足后关闭' : '普通关联，保留状态'}</p>`).join('')}<button type="button" data-action="sync-issues">创建 / 回读原内部 Issue</button>`;
}

function interfaceSettings(config) {
  const mode = config?.issueAutomation?.mode ?? 'manual',
    value = config?.issueAutomation?.mode === 'gitlab' ? config.issueAutomation : config?.platformApi,
    auth = value?.authMode ?? (value?.tokenEnv ? 'environment' : 'session'),
    api = mode === 'gitlab' || config?.prTransport === 'gitlab';
  return { value, auth, api };
}
