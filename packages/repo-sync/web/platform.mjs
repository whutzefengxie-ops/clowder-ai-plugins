export function platformSettings(snapshot, esc) {
  if (!snapshot.config || !snapshot.connection) return '';
  const mode = snapshot.platform.transport;
  return `<section class="card" id="platform-settings"><h3>PR 自动创建设置</h3><p>候选检查与推送成功后自动取得 PR 地址并进入审核。已有仓库可以在这里启用，不重新初始化台账。创建意图或 PR 已冻结时禁止更换配置。</p><form data-form="configure-pr"><input type="hidden" name="expectedRevision" value="${esc(snapshot.connection.revision)}"><label>PR 创建方式<select name="prMode" aria-label="PR 创建方式"><option value="git" ${mode === 'git' ? 'selected' : ''}>Git 推送时自动创建 PR</option>${mode === 'command' ? '<option value="command" selected>已有私有命令适配器自动创建</option>' : ''}<option value="manual" ${mode === 'manual' ? 'selected' : ''}>明确使用手工创建</option></select></label><label>用于确认 PR 地址的内部网页仓库<input name="internalWebUrl" type="url" required value="${esc(snapshot.platform.repositoryUrl ?? '')}" placeholder="https://内部平台/团队/仓库"></label><p>Git 路径使用平台 push-options 扩展，默认 merge_request.create / target / title / description。没有返回可确认地址就暂停，不自动改为手工创建。私有配置可指定平台实际选项，凭据继续使用本机 Git 认证。</p><button type="submit">保存 PR 创建设置</button></form></section>`;
}
export function prCreationFields(config) {
  const selected = config?.prTransport ?? 'git';
  const options = [
    ['git', 'Git 推送时自动创建 PR'],
    ['manual', '明确使用手工创建'],
  ];
  if (selected === 'command') options.push(['command', '已有私有平台适配器自动创建']);
  return `<label>PR 创建方式<select name="prMode" aria-label="PR 创建方式">${options.map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join('')}</select></label><p>Git 创建使用平台 push-options 扩展：默认 merge_request.create / target / title / description。平台需支持这组选项，或在私有配置指定其实际选项；不支持时暂停，不转为手工创建。自动创建需要填写内部仓库网页地址。</p>`;
}
export function prCreationSummary(config) {
  const mode = config?.prTransport ?? 'git';
  const names = { git: '候选推送同时触发 Git PR 创建', command: '私有平台适配器自动创建', manual: '明确使用手工创建' };
  return `<p><b>PR 创建方式：${names[mode]}。</b>自动流程会取得平台返回的 PR 地址并进入审核。Git 创建需要平台支持扩展；命令适配器作为额外途径，凭据仍使用本机 Git 认证。</p>`;
}
