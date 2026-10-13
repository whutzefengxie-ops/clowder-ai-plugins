import { fileTree } from './files.mjs';
export function diagnostics(error, snapshot, esc) {
  if (!error?.details?.differences) return '';
  const editable =
    !snapshot.state && snapshot.config.mode === 'version' && (!snapshot.connection || snapshot.connection.editable);
  return `<section class="card bad" id="baseline-differences"><h3>× 文件差异待处理</h3><p>比较外部已同步版本 U0 <code>${esc(error.details.upstream)}</code> 与内部当前版本 I0 <code>${esc(error.details.internal)}</code>。外部 U0 之后的正常更新不属于这份内部差异。</p><p>${editable ? '先查看文件，再逐项选择归属。选择会填入下方配置草稿，须保存配置并重新核验；不会自动忽略差异。共同修改采用三方合并；完整内部保留将跳过该文件的外部更新。' : snapshot.state ? '此绑定已启用，规则不能直接改写。意外修改应通过内部修复 PR 处理；新增定制规则需要新的私有配置与经过核验的基线，原台账保留。若有未完成交付，先恢复原交付。' : '请确认 U0 是上次已同步版本。连续同步要求完整文件一致：修正基线，或在内部修复 PR 后重核验；需要保留定制时，在尚未启用的配置中选择按 tag 更新。'}</p><button type="button" data-view="configuration">核对基线与文件规则</button>${fileTree(error.details.differences, '完整文件差异', { rules: editable })}<p>点击下列具体文件只在本机查看内容：</p><label>文件路径<select data-baseline-path>${error.details.differences.map((item) => `<option value="${esc(item.path)}">${esc(item.path)}</option>`).join('')}</select></label><button type="button" data-baseline-read data-upstream="${esc(error.details.upstream)}" data-internal="${esc(error.details.internal)}">查看两侧文件内容</button><div id="baseline-file-content"></div><p>保存规则后回到“核验并登记已有基线”重试；核验失败不会登记基线或修改 main。</p></section>`;
}
export function baselineContent(result, esc) {
  return `<h4>${esc(result.path)}</h4><div class="split"><details open><summary>外部已同步版本 U0</summary><pre class="bounded-text">${esc(result.upstream.content)}</pre></details><details open><summary>内部当前版本 I0</summary><pre class="bounded-text">${esc(result.internal.content)}</pre></details></div>`;
}
export function stageRule(button) {
  const form = document.querySelector('form[data-form="configure-repositories"], form[data-form="configure"]');
  if (!form || form.elements.namedItem('mode').value !== 'version') return;
  const path = button.dataset.rulePath;
  const kind = button.dataset.ruleKind === 'internal' ? 'internalPaths' : 'mergePaths';
  for (const name of ['internalPaths', 'mergePaths']) {
    const field = form.elements.namedItem(name);
    const values = field.value
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter((value) => value && value !== path);
    if (name === kind) values.push(path);
    field.value = values.join('\n');
  }
  form.closest('details')?.setAttribute('open', '');
  const field = form.elements.namedItem(kind);
  field.scrollIntoView({ block: 'center' });
  field.focus();
}
