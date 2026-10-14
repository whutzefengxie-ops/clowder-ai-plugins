const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
const labels = {
  added: '新增',
  deleted: '删除',
  modified: '修改',
  conflict: '冲突',
  internal: '内部保留',
  merge: '三方合并',
  upstream: '跟随上游',
};
const state = new WeakMap();
export function fileTree(items, title, { rules = false, conflicts = false } = {}) {
  return `<details class="file-list"><summary>${escapeHtml(title)}（${items.length}）</summary><div data-file-tree data-items="${escapeHtml(JSON.stringify(items))}" data-rules="${rules}" data-conflicts="${conflicts}"><div class="file-tools"><label>搜索文件<input type="search" data-file-search placeholder="输入完整路径或文件名"></label><label>处理范围<select data-file-filter><option value="all">全部</option><option value="blocking">未处理 / 阻塞</option><option value="internal">内部保留</option><option value="merge">共同修改</option><option value="upstream">跟随上游</option></select></label></div><div data-tree-body class="file-tree"></div><div class="file-pages"><button type="button" data-tree-page="-1">上一页</button><span data-tree-count></span><button type="button" data-tree-page="1">下一页</button></div><small>每页最多 50 个文件；展开目录查看，搜索覆盖完整清单。</small></div></details>`;
}
function row(item, rules, name, conflicts) {
  const openConflict = conflicts
    ? `<button type="button" data-conflict-path="${escapeHtml(item.path)}">查看并处理冲突</button>`
    : '';
  const blockage = item.kind === 'conflict' ? '× 冲突待解决' : '× 未声明差异';
  const action =
    rules && item.blocking
      ? `<span class="file-actions"><button type="button" data-rule-path="${escapeHtml(item.path)}" data-rule-kind="internal">完整保留内部</button>${rules === true ? `<button type="button" data-rule-path="${escapeHtml(item.path)}" data-rule-kind="merge">设为共同修改</button>` : ''}</span>`
      : '';
  return `<li class="file-row"><span title="${escapeHtml(item.path)}">${escapeHtml(name)}</span><small>${escapeHtml(labels[item.kind] ?? item.kind)} · ${item.blocking ? blockage : escapeHtml(labels[item.category] ?? '')}${item.sourceMode && item.internalMode && item.sourceMode !== item.internalMode ? ' · 文件类型/权限变化' : ''}</small>${action}${openConflict}</li>`;
}
function nodes(items, rules, searching, depth = 0, conflicts = false) {
  const files = [];
  const dirs = new Map();
  for (const item of items) {
    const parts = item.display.split('/');
    if (parts.length === 1 || depth >= 12) files.push(row(item, rules, item.display, conflicts));
    else {
      const name = parts.shift();
      if (!dirs.has(name)) dirs.set(name, []);
      dirs.get(name).push({ ...item, display: parts.join('/') });
    }
  }
  const folders = [...dirs.entries()].map(
    ([name, list]) =>
      `<li><details ${searching ? 'open' : ''}><summary>📁 ${escapeHtml(name)}/ · 本页 ${list.length}</summary>${nodes(list, rules, searching, depth + 1, conflicts)}</details></li>`,
  );
  return `<ul>${folders.join('')}${files.join('')}</ul>`;
}
function render(root) {
  const current = state.get(root);
  const query = root.querySelector('[data-file-search]').value.toLocaleLowerCase();
  const filter = root.querySelector('[data-file-filter]').value;
  const items = current.items.filter(
    (item) =>
      item.path.toLocaleLowerCase().includes(query) &&
      (filter === 'all' || (filter === 'blocking' ? item.blocking : item.category === filter)),
  );
  const pages = Math.max(1, Math.ceil(items.length / 50));
  current.page = Math.min(pages - 1, Math.max(0, current.page));
  const visible = items
    .slice(current.page * 50, (current.page + 1) * 50)
    .map((item) => ({ ...item, display: item.path }));
  root.querySelector('[data-tree-body]').innerHTML = visible.length
    ? nodes(
        visible,
        root.dataset.rules === 'true' ? true : root.dataset.rules === 'internal' ? 'internal' : false,
        Boolean(query),
        0,
        root.dataset.conflicts === 'true',
      )
    : '<p>没有符合条件的文件。</p>';
  root.querySelector('[data-tree-count]').textContent =
    `${items.length} 个匹配文件 · 第 ${current.page + 1} / ${pages} 页`;
  for (const button of root.querySelectorAll('[data-tree-page]'))
    button.disabled = Number(button.dataset.treePage) < 0 ? current.page === 0 : current.page === pages - 1;
}
export function hydrateFiles(container = document) {
  for (const root of container.querySelectorAll('[data-file-tree]')) {
    if (state.has(root)) continue;
    state.set(root, { items: JSON.parse(root.dataset.items), page: 0 });
    render(root);
  }
}
globalThis.document?.addEventListener('input', (event) => {
  if (!event.target.matches('[data-file-search]')) return;
  const root = event.target.closest('[data-file-tree]');
  state.get(root).page = 0;
  render(root);
});
globalThis.document?.addEventListener('change', (event) => {
  if (!event.target.matches('[data-file-filter]')) return;
  const root = event.target.closest('[data-file-tree]');
  state.get(root).page = 0;
  render(root);
});
globalThis.document?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-tree-page]');
  if (!button) return;
  const root = button.closest('[data-file-tree]');
  state.get(root).page += Number(button.dataset.treePage);
  render(root);
});
