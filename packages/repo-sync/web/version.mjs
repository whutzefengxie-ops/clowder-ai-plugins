import { fileRuleFields } from './file-rule-fields.mjs';
import { fileTree } from './files.mjs';
export function modeSettings(config, state, esc) {
  const version = config.mode === 'version';
  const rules = fileRuleFields(config.internalPaths);
  return `<section class="card"><h2>1 · 选择同步方式</h2>${state ? `<span class="badge">${version ? '按版本更新' : '同步开发过程'}</span><p>${version ? '按 tag 接收版本内容，保留内部差异，只创建一个内部同步 PR。' : '按 main 的实际落地 PR 逐笔同步 Issue 与原始对象；保留声明的内部路径，其余核心范围严格一致。'}</p>${lockedRules(config, esc)}<small>已启用绑定的模式与规则已固定。另一种模式请点击上方“新增项目”，独立配置与台账会自动隔离。</small>` : `<form data-form="configure"><label for="sync-mode">同步模式</label><select id="sync-mode" name="mode"><option value="continuous" ${!version ? 'selected' : ''}>同步开发过程 · 搬运 Issue / PR</option><option value="version" ${version ? 'selected' : ''}>按版本更新 · 保留内部差异</option></select><p>两种模式使用相同的文件规则：完整保留内部路径，其余核心文件严格跟随外部。</p><div data-policy><h3>2 · 声明内部差异</h3>${rules}<p>目录以 / 结尾。内部保留规则保留整个文件，包含上游同名文件的变更也会跳过。其余路径必须与基线一致。</p></div><button class="primary" type="submit">保存同步方式与规则</button></form>`}</section>`;
}
export function tagSelector(tags, esc, sha) {
  return `<section class="card task"><span class="badge">按版本更新 · 一个同步 PR</span><h2>选择要接收的上游版本</h2><p>内部定制文件按已声明规则保留。不会搬运上游 Issue 或逐个创建上游 PR。</p><button data-action="tags" type="button">读取可用 tag</button>${tags.length ? `<form data-form="select-tag"><label>目标 tag<select name="tag">${tags.map((tag) => `<option value="${esc(tag.name)}">${esc(tag.name)} · ${esc(tag.commit.slice(0, 12))}</option>`).join('')}</select></label><button class="primary" type="submit">核对内部差异并选择这个版本 →</button></form><details><summary>查看标签与准确 commit 对应</summary>${tags.map((tag) => `<p>${esc(tag.name)} → ${sha(tag.commit)}</p>`).join('')}</details>` : '<p>先读取标签，再选择目标版本。</p>'}</section>`;
}
export function versionPreview(delivery, esc, sha) {
  return `<section class="card"><h3>${delivery.mode === 'version' ? '本次版本接收范围' : '本笔 PR 文件范围'} · ${esc(delivery.source.tag ?? `PR #${delivery.source.number}`)}</h3><p>来源 ${sha(delivery.base.upstream)} → ${sha(delivery.target)}</p><p>冻结内部基线 ${sha(delivery.base.internal)}</p>${fileTree(delivery.preview.changes, '上游文件变化')}${fileTree(delivery.preview.internalChanges, '内部差异')}</section>`;
}
function lockedRules(config, esc) {
  return `<p>内部保留：${esc((config.internalPaths ?? []).join('、') || '无')}</p>`;
}
