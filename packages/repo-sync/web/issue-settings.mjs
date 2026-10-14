export function issueFields(config, esc) {
  const value = config?.issueAutomation,
    mode = value?.mode ?? 'manual';
  return `<label>Issue 创建与关单方式<select name="issueMode"><option value="gitlab" ${mode === 'gitlab' ? 'selected' : ''}>GitLab 兼容 API 自动创建、关联、关单</option>${mode === 'command' ? '<option value="command" selected>已有私有命令适配器自动处理</option>' : ''}<option value="manual" ${mode === 'manual' ? 'selected' : ''}>明确使用人工创建与状态登记</option></select></label><div class="split"><label>内部 Issue API 地址<input name="issueApiUrl" value="${esc(value?.apiUrl ?? '')}" placeholder="https://内部平台/api/v4"></label><label>API 项目 ID / 路径<input name="issueProjectId" value="${esc(value?.projectId ?? '')}" placeholder="123 或 team/core"></label><label>Token 所在环境变量名称<input name="issueTokenEnv" value="${esc(value?.tokenEnv ?? '')}" placeholder="REPO_SYNC_INTERNAL_TOKEN"></label></div><p>上述 API 字段仅用于 GitLab 兼容方式。网页只填写环境变量名称；Token 在启动本机服务的环境中设置，不填在网页或仓库地址中。其他 Git 平台使用私有命令适配器。</p>`;
}
export function issueSettings(snapshot, esc) {
  if (!snapshot.connection || !snapshot.config || snapshot.config.mode !== 'continuous') return '';
  return `<section class="card" id="issue-settings"><h3>Issue 自动化设置</h3><p>${snapshot.config.issueAutomation?.automatic ? '已配置自动化：程序创建或复用来源 Issue、关联本笔 PR，实际合入核验后按接收条件关单。' : '尚未启用 Issue 自动化：当前为人工登记。要完成自动搬运，请配置以下接口。'}Git 推送扩展负责 PR；Git 本身没有通用的 Issue 接口。已有创建意图后设置固定。</p><form data-form="configure-issues"><input type="hidden" name="expectedRevision" value="${esc(snapshot.connection.revision)}">${issueFields(snapshot.config, esc)}<button type="submit">保存 Issue 自动化设置</button></form></section>`;
}
export function autoIssuePanel(delivery, state, esc) {
  return `<h3>自动创建 / 复用内部 Issue</h3><p>先按稳定来源标识查询原对象，再创建并回读。准备代码时也会执行这个步骤。失败后只恢复原意图，避免重复建单。</p>${delivery.issues.map((issue) => `<p><a href="${esc(issue.url)}" target="_blank" rel="noopener">外部 #${issue.number} ↗</a> → ${state.issues[issue.sourceId] ? `<a href="${esc(state.issues[issue.sourceId].url)}" target="_blank" rel="noopener">内部 #${esc(state.issues[issue.sourceId].internalId)} ↗</a>` : '待自动创建'} · ${issue.relation === 'closes' ? '接收条件全部满足后关闭' : '普通关联，保留状态'}</p>`).join('')}<button type="button" data-action="sync-issues">创建 / 回读原内部 Issue</button>`;
}
