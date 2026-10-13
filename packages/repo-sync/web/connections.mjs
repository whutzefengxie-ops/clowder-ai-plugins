import { prCreationFields, prCreationSummary } from './platform.mjs';
import { modeSettings } from './version.mjs';

export function firstUse() {
  return `<section class="card task"><span class="badge">真实仓库 · 等待配置</span><h2>开始连接你的两侧仓库</h2><p>先填写外部 GitHub 和内部 Git 地址，再核验已有基线。此入口没有演示仓库和模拟合入操作。</p><ol><li>保存地址、分支和同步方式</li><li>读取两侧版本，核对 Git 认证</li><li>登记上次已同步的外部 U0 与内部当前 I0</li></ol><button type="button" data-view="configuration" class="primary">配置真实仓库 →</button></section>`;
}
function connectionForm(config, connection, esc) {
  const version = !config || config.mode === 'version';
  return `<form data-form="configure-repositories"><input type="hidden" name="expectedRevision" value="${esc(connection.revision ?? '')}"><div class="split"><label>外部 GitHub 仓库地址<input name="sourceUrl" required value="${esc(config?.sourceUrl ?? '')}" placeholder="https://github.com/组织/仓库.git"></label><label>内部 Git 仓库地址<input name="internalUrl" required value="${esc(config?.internalUrl ?? '')}" placeholder="git@内部域名:团队/仓库.git"></label><label>外部交付分支<input name="sourceBranch" required value="${esc(config?.sourceBranch ?? 'main')}"></label><label>内部仓库网页地址（登记对象前必填）<input name="internalWebUrl" type="url" value="${esc(config?.internalWebUrl ?? '')}" placeholder="https://内部平台/团队/仓库"></label><label>内部合入分支<input name="targetBranch" required value="${esc(config?.targetBranch ?? 'main')}"></label></div><p>支持 HTTPS 或 SSH Git 地址。请使用本机 Git 凭据管理器或 SSH 密钥，地址中不要带 Token、密码或查询参数。</p>${prCreationFields(config)}<label for="repository-mode">同步模式</label><select id="repository-mode" name="mode"><option value="version" ${version ? 'selected' : ''}>按 tag 更新 · 保留内部差异 · 一个同步 PR</option><option value="continuous" ${version ? '' : 'selected'}>同步开发过程 · 搬运 Issue / PR · 核心文件完全一致</option></select><div data-policy ${version ? '' : 'hidden'}><div class="split"><label>内部保留文件 / 目录（每行一项）<textarea name="internalPaths" rows="3" placeholder="internal-docs/&#10;README.internal.md">${esc((config?.internalPaths ?? []).join('\n'))}</textarea></label><label>共同修改的文件（每行一项）<textarea name="mergePaths" rows="3" placeholder="README.md">${esc((config?.mergePaths ?? []).join('\n'))}</textarea></label></div><p>内部保留路径完整保留；共同修改的文件三方合并。目录以 / 结尾，不支持通配符，其余文件必须与基线一致。</p></div><div data-closure ${version ? 'hidden' : ''}><label><input type="checkbox" name="commitClosureVerified" ${config?.commitClosureVerified ? 'checked' : ''}>我已在内部测试仓验证原始提交消息不会误关 Issue</label><p>开发过程模式保留原始 commit 消息。未完成平台实测时可配置和核验基线，程序会阻止候选推送。此项是你的实测声明。</p></div>${prCreationSummary(config)}<p>默认只执行 <b>Git 基础完整性检查</b>（git fsck）。项目构建、单元测试和插件兼容检查需要在本地私有 JSON 的 checks 中补充。网页不接受执行命令。</p><button class="primary" type="submit">保存仓库配置，继续核验基线 →</button></form>`;
}
function summary(config, esc) {
  return `<div class="split"><div><small>外部来源</small>${esc(config.sourceUrl)}<p>交付分支：${esc(config.sourceBranch)}</p></div><div><small>内部接收</small>${esc(config.internalUrl)}<p>合入分支：${esc(config.targetBranch)}</p></div></div><p>同步方式：${config.mode === 'version' ? '按 tag 更新，只创建一个内部同步 PR' : '按 main 的 PR 落地顺序接收开发过程'}</p>${config.mode === 'version' ? `<p>内部保留：${esc((config.internalPaths ?? []).join('、') || '无')}<br>共同修改：${esc((config.mergePaths ?? []).join('、') || '无')}</p>` : ''}`;
}
function baseline(config, state, _esc, sha, button) {
  if (state)
    return `<h3>初始对应</h3>${sha(state.initial.upstream)} → ${sha(state.initial.internal)}<h3>当前已接受对应</h3>${sha(state.accepted.upstream)} → ${sha(state.accepted.internal)}<p><button type="button" class="primary" data-view="workbench">进入同步工作台 →</button></p>`;
  return `${button('heads', '读取两侧当前版本')}<div id="observed-heads" role="status"></div><form data-form="adopt"><label for="upstream">外部已同步版本 U0（完整 SHA）</label><input id="upstream" name="upstream" required><label for="internal">内部当前版本 I0（完整 SHA）</label><input id="internal" name="internal" required><p>例如内仓落后 20 个 commit：U0 填上次已同步的 A，I0 填内部当前 HEAD。两者 SHA 可以不同。读取最新版本不会替你选择 U0。</p><p>${config.mode === 'version' ? '程序核验文件规则，规则内的内部差异保留；其余路径须与 U0 一致。' : '程序核验 U0 与 I0 完整文件树一致。'}此操作只登记对应，不推送或修改 main。</p><button class="primary" type="submit">核验并登记已有基线</button></form>`;
}
export function configuration(snapshot, esc, sha, button) {
  const { config, state, connection } = snapshot;
  if (!connection)
    return `${modeSettings(config, state, esc)}<section class="card"><h2>3 · 仓库连接与基线</h2>${summary(config, esc)}<p>地址与检查命令来自本地私有配置，凭据使用本机 Git / gh 登录。</p>${baseline(config, state, esc, sha, button)}</section>`;
  const steps = `<ol class="flow setup"><li><b>${config ? '✓' : '●'} 1 · 连接真实仓库</b><small>地址、分支、方式与文件规则</small></li><li><b>${state ? '✓' : config ? '●' : '○'} 2 · 核验已有基线</b><small>读取两侧版本，登记 U0 ↔ I0</small></li><li><b>${state ? '✓' : '○'} 3 · 开始同步</b><small>读取更新，准备候选分支与内部 PR</small></li></ol>`;
  return `${steps}<section class="card"><h2>1 · 连接真实仓库</h2>${config ? `${summary(config, esc)}${connection.editable ? `<details><summary>修改尚未启用的仓库配置</summary>${connectionForm(config, connection, esc)}</details>` : '<p>此配置已固定，或由操作者手工管理。另一组仓库请使用新的私有配置文件。</p>'}` : connectionForm(config, connection, esc)}</section>${config ? `<section class="card"><h2>2 · 核验已有基线</h2><p>先确保本机 git 已安装且有两侧仓库读取权限、内部候选分支写权限。按开发过程同步还需要 gh 已登录，以读取 GitHub 的 Issue / PR。</p>${baseline(config, state, esc, sha, button)}</section>` : ''}<section class="card"><h3>配置保存在本机</h3><p>配置文件：<code>${esc(connection.configurationFile)}</code>${connection.stateDir ? `<br>台账目录：<code>${esc(connection.stateDir)}</code>` : ''}</p><p>重启时使用同一个配置文件即可续接；配置不会上传到 GitHub。PR 按选定方式自动创建或人工登记，审核合入在内部平台完成。</p>${config ? `<p>当前检查：${config.checkProfile === 'git-integrity' ? 'Git 基础完整性；尚未配置项目构建与插件兼容检查' : '私有配置中的项目检查'}。</p>` : ''}</section>`;
}
export function repositoryInput(fields) {
  const input = {
    action: 'configure-repositories',
    ...fields,
    expectedRevision: fields.expectedRevision || null,
    internalWebUrl: fields.internalWebUrl?.trim() ?? '',
    commitClosureVerified: fields.commitClosureVerified === 'on',
  };
  for (const key of ['internalPaths', 'mergePaths'])
    input[key] =
      fields.mode === 'version'
        ? fields[key]
            .split(/\r?\n/)
            .map((value) => value.trim())
            .filter(Boolean)
        : [];
  for (const key of ['sourceUrl', 'internalUrl', 'sourceBranch', 'targetBranch']) input[key] = input[key].trim();
  return input;
}
export function captureDraft() {
  return [...document.querySelectorAll('form[data-form]')].map((form) => ({
    kind: form.dataset.form,
    values: [...form.elements]
      .filter((element) => element.name && !['expectedRevision', 'previousUrl', 'deliveryId'].includes(element.name))
      .map((element) => ({ name: element.name, value: element.value, checked: element.checked })),
  }));
}
export function restoreDraft(drafts) {
  for (const draft of drafts) {
    const form = document.querySelector(`form[data-form="${draft.kind}"]`);
    if (!form) continue;
    restoreForm(form, draft);
  }
}
function restoreForm(form, draft) {
  for (const saved of draft.values) {
    const element = form.elements.namedItem(saved.name);
    if (element) {
      element.value = saved.value;
      if (element.type === 'checkbox') element.checked = saved.checked;
    }
  }
  const version = form.elements.namedItem('mode')?.value === 'version';
  const policy = form.querySelector('[data-policy]');
  const closure = form.querySelector('[data-closure]');
  if (policy) policy.hidden = !version;
  if (closure) closure.hidden = version;
  form.closest('details')?.setAttribute('open', '');
}
