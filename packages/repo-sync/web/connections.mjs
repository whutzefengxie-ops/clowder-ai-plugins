import { fileRuleFields } from './file-rule-fields.mjs';
import { githubAuthForm } from './github-auth.mjs';
import { updateIssueFields } from './issue-auth.mjs';
import { issueFields } from './issue-settings.mjs';
import { prCreationFields, prCreationSummary } from './platform.mjs';
import { repositoryFields } from './repository-fields.mjs';
import { modeSettings } from './version.mjs';

export function firstUse() {
  return `<section class="card task"><span class="badge">真实仓库 · 等待配置</span><h2>开始连接你的两侧仓库</h2><p>先填写外部 GitHub 和内部 Git 地址，再核验已有基线。此入口没有演示仓库和模拟合入操作。</p><ol><li>保存地址、分支和同步方式</li><li>读取两侧版本，核对 Git 认证</li><li>登记上次已同步的外部 U0 与内部当前 I0</li></ol><button type="button" data-view="configuration" class="primary">配置真实仓库 →</button></section>`;
}
function connectionForm(config, connection, esc) {
  const version = !config || config.mode === 'version';
  return `<form data-form="configure-repositories"><input type="hidden" name="expectedRevision" value="${esc(connection.revision ?? '')}">${repositoryFields(config, esc)}${prCreationFields(config)}<label for="repository-mode">同步模式</label><select id="repository-mode" name="mode"><option value="version" ${version ? 'selected' : ''}>按 tag 更新 · 保留内部差异 · 一个同步 PR</option><option value="continuous" ${version ? '' : 'selected'}>同步开发过程 · 搬运 Issue / PR · 核心文件完全一致</option></select><div data-policy>${fileRuleFields(config?.internalPaths)}</div>${issueFields({ ...config, mode: version ? 'version' : 'continuous' }, esc)}${prCreationSummary(config)}<p>默认只执行 <b>Git 基础完整性检查</b>（git fsck）。项目构建、单元测试和插件兼容检查需要在本地私有 JSON 的 checks 中补充。网页不接受执行命令。</p><button class="primary" type="submit">保存仓库配置，继续核验基线 →</button></form>`;
}
function summary(config, esc) {
  return `<div class="split"><div><small>外部来源</small>${esc(config.sourceUrl)}<p>交付分支：${esc(config.sourceBranch)}</p></div><div><small>内部接收</small>${esc(config.internalUrl)}<p>合入分支：${esc(config.targetBranch)}</p></div></div><p>同步方式：${config.mode === 'version' ? '按 tag 更新，只创建一个内部同步 PR' : '按 main 的 PR 落地顺序接收开发过程'}</p>${`<p>内部保留：${esc((config.internalPaths ?? []).join('、') || '无')}</p>`}`;
}
function baseline(config, state, _esc, sha, button) {
  if (state)
    return `<h3>初始对应</h3>${sha(state.initial.upstream)} → ${sha(state.initial.internal)}<h3>当前已接受对应</h3>${sha(state.accepted.upstream)} → ${sha(state.accepted.internal)}<p><button type="button" class="primary" data-view="workbench">进入同步工作台 →</button></p>`;
  return `<p><b>接管已有仓库：外部填历史已同步版本，内部填当前接收分支 HEAD。</b>点击下面按钮只查询两侧版本并自动填入最新 I0，保留你填写的 U0；不会拉取更新到内部 main，也不会覆盖专项改动。</p>${button('heads', '读取两侧当前版本')}<div id="observed-heads" role="status"></div><form data-form="adopt"><label for="upstream">外部已同步版本 U0（完整 SHA）</label><input id="upstream" name="upstream" required><label for="internal">内部当前版本 I0（完整 SHA）</label><input id="internal" name="internal" required><p>例如第一次同步后内部又有专项提交：U0 仍填第一次接收的外部 A，I0 填内部合入分支现在的最新提交，不填第一次同步时的内部旧提交。两者 SHA 可以不同。</p><p>${config.mode === 'version' ? '程序核验文件规则；内部保留路径按已配置规则处理，其余路径须与 U0 一致。' : '请先声明内部专项文件的保留路径；其余核心文件必须与 U0 一致。同一文件若有专项改动，请明确选择完整保留内部（跳过该文件的外部更新），或先通过内部 PR 对齐核心内容。'}此操作只登记对应，不推送或修改合入分支。</p><button class="primary" type="submit">核验并登记已有基线</button></form>`;
}
export function configuration(snapshot, esc, sha, button) {
  const { config, state, connection } = snapshot;
  const activity =
    '<div id="operation" role="region" aria-label="当前步骤执行情况" tabindex="-1"></div><div id="error-slot"></div>';
  const current = baselineStep(snapshot, esc, sha, button, activity);
  if (!connection)
    return `<details class="card" data-setup-repositories><summary>查看或修改已保存的仓库信息</summary>${summary(config, esc)}${modeSettings(config, state, esc)}</details>${current}${githubAuthForm(snapshot)}`;
  const steps = `<ol class="flow setup"><li><b>${config ? '✓' : '●'} 1 · 连接真实仓库</b><small>地址、分支、方式与文件规则</small></li><li><b>${state ? '✓' : config ? '●' : '○'} 2 · 核验已有基线</b><small>读取两侧版本，登记 U0 ↔ I0</small></li><li><b>${state ? '✓' : '○'} 3 · 开始同步</b><small>读取更新，准备候选分支与内部 PR</small></li></ol>`;
  return `${steps}${savedRepositories(snapshot, esc, activity)}${current}${githubAuthForm(snapshot)}${storageDetails(snapshot, esc)}`;
}
function baselineStep({ config, state }, esc, sha, button, activity) {
  if (!config) return '';
  return `<section class="card setup-current" id="baseline-step" data-setup-current tabindex="-1"><span class="badge">当前步骤 · ${state ? '3 / 3' : '2 / 3'}</span><h2>${state ? '3 · 开始同步' : '2 · 核验已有基线'}</h2>${state ? '' : '<p>仓库信息已保存。现在只需填写外部已同步的 U0 与内部当前的 I0，然后核验。</p>'}${baseline(config, state, esc, sha, button)}${activity}</section>`;
}
function savedRepositories({ config, connection }, esc, activity) {
  if (!config)
    return `<section class="card setup-current" data-setup-current><h2>1 · 连接真实仓库</h2>${connectionForm(config, connection, esc)}${activity}</section>`;
  return `<details class="card" data-setup-repositories><summary><b>✓ 1 · 仓库信息已保存</b><span>查看或修改已保存的仓库信息</span></summary>${summary(config, esc)}${connection.editable ? `<details><summary>修改尚未启用的仓库配置</summary>${connectionForm(config, connection, esc)}</details>` : '<p>此绑定已固定。另一组仓库请使用“新增项目”，原配置与台账保留。</p>'}</details>`;
}
function storageDetails({ config, connection }, esc) {
  return `<details class="card setup-storage"><summary>配置保存位置与检查说明</summary><p>配置文件：<code>${esc(connection.configurationFile)}</code>${connection.stateDir ? `<br>台账目录：<code>${esc(connection.stateDir)}</code>` : ''}</p><p>重启时使用同一个配置文件即可续接；配置不会上传到 GitHub。审核合入在内部平台完成。</p>${config ? `<p>当前检查：${config.checkProfile === 'git-integrity' ? 'Git 基础完整性；项目构建与插件兼容检查需在私有配置补充' : '私有配置中的项目检查'}。</p>` : ''}</details>`;
}
export function repositoryInput(fields) {
  const input = {
    action: 'configure-repositories',
    ...fields,
    expectedRevision: fields.expectedRevision || null,
    internalWebUrl: fields.internalWebUrl?.trim() ?? '',
    ...(fields.commitClosureVerified === undefined
      ? {}
      : { commitClosureVerified: fields.commitClosureVerified === 'on' }),
  };
  for (const key of ['internalPaths', 'mergePaths'])
    input[key] =
      key === 'internalPaths' || fields.mergePaths
        ? (fields[key] ?? '')
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
    open: form.closest('details')?.open ?? false,
    openSummary: form.closest('details')?.querySelector(':scope > summary')?.textContent ?? '',
    reference: form.elements.namedItem('previousUrl')?.value ?? '',
    source: form.dataset.source ?? '',
    path: form.elements.namedItem('path')?.value ?? '',
    deliveryId: form.elements.namedItem('deliveryId')?.value ?? '',
    values: [...form.elements]
      .filter(
        (element) =>
          element.name &&
          element.type !== 'password' &&
          element.name !== 'issueToken' &&
          !['expectedRevision', 'previousUrl', 'deliveryId'].includes(element.name),
      )
      .map((element) => ({
        name: element.name,
        value: element.value,
        checked: element.checked,
      })),
  }));
}
export function restoreDraft(drafts) {
  for (const draft of drafts) {
    const form = [...document.querySelectorAll('form[data-form]')].find(
      (item) =>
        item.dataset.form === draft.kind &&
        (item.dataset.source ?? '') === (draft.source ?? '') &&
        (item.elements.namedItem('path')?.value ?? '') === (draft.path ?? '') &&
        (item.elements.namedItem('previousUrl')?.value ?? '') === (draft.reference ?? '') &&
        (item.elements.namedItem('deliveryId')?.value ?? '') === (draft.deliveryId ?? ''),
    );
    if (!form) continue;
    restoreForm(form, draft);
  }
}
function restoreForm(form, draft) {
  for (const saved of draft.values) {
    const element = form.elements.namedItem(saved.name);
    if (element && element.type !== 'password' && saved.name !== 'issueToken') {
      element.value = saved.value;
      if (element.type === 'checkbox') element.checked = saved.checked;
    }
  }
  const version = form.elements.namedItem('mode')?.value === 'version';
  const closure = form.querySelector('[data-closure]');
  if (closure) closure.hidden = version;
  updateIssueFields(form);
  const parent = form.closest('details');
  if (draft.open && parent?.querySelector(':scope > summary')?.textContent === draft.openSummary) parent.open = true;
}
