export function commitFields(config, esc) {
  const identity = config?.receivingIdentity ?? { name: 'Repository Sync', email: 'repo-sync@localhost' };
  return `<fieldset><legend>内部提交身份（与 Token 推送账号分别设置）</legend><label>提交处理方式<select name="commitStrategy"><option value="preserve" ${config?.commitStrategy !== 'rewrite' ? 'selected' : ''}>保留上游作者和原始 SHA</option><option value="rewrite" ${config?.commitStrategy === 'rewrite' ? 'selected' : ''}>按统一内部身份重写，记录内外 SHA 映射</option></select></label><div class="split"><label>内部 Git 姓名<input name="commitName" required value="${esc(identity.name)}"></label><label>内部 Git 邮箱<input name="commitEmail" type="email" required value="${esc(identity.email)}"></label></div><p>保留模式仅将此署名用于必要的接收节点；重写模式将上游提交的作者、提交者统一为此身份，消息与日期保留，SHA 随之变化。按 tag 更新仍只创建一个内容提交。Git 凭据决定推送账号，API Token 决定平台接口操作者，均不能代替 Git 署名。策略在每笔同步开始时固定。</p></fieldset>`;
}
export function identitySettings(snapshot, esc) {
  if (!snapshot.config || !snapshot.state || !snapshot.connection) return '';
  const active = snapshot.state.active;
  return `<details class="card"><summary>提交身份策略</summary>${active ? '<p>存在未完成交付，身份策略已冻结。完成原交付后可修改下一轮策略。</p>' : `<form data-form="configure-identity"><input type="hidden" name="expectedRevision" value="${esc(snapshot.connection.revision)}">${commitFields(snapshot.config, esc)}<button type="submit">保存后续同步的提交身份</button></form>`}</details>`;
}
