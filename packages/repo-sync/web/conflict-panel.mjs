import { esc } from './ui.mjs';

export function conflictPanel(conflict) {
  const files = Array.isArray(conflict.files) ? conflict.files : [];
  const rows = files.map((path) => `<li><code>${esc(path)}</code></li>`).join('');
  return `<section class="next-action now conflict-action" aria-label="当前操作区">
    <p class="now-kicker">需要你处理</p>
    <h2>PR 合入时包含冲突解决</h2>
    <p class="now-description" role="status">PR #${esc(conflict.number)} 的 squash 在合入时做了冲突解决；逐条重放无法复现 landing ${esc(String(conflict.landing).slice(0, 8))}。</p>
    <div class="conflict-summary"><span class="chip">${files.length} 个差异文件</span><span class="chip">${esc(conflict.head?.slice(0, 8))} → ${esc(conflict.landing?.slice(0, 8))}</span></div>
    <div class="task-actions"><button type="button" class="primary" data-open-conflict>查看差异并继续</button><button type="button" data-action="pause-sync">暂不处理，保留现场</button></div>
    <p class="conflict-footnote">不会修改已合入的 PR；确认后本笔按 landing 单快照交付，Issue / PR / 合入校验保持不变。</p>
    <div class="conflict-modal-layer" data-conflict-dialog hidden>
      <div class="conflict-modal" role="dialog" aria-modal="true" aria-labelledby="conflict-title">
        <div class="conflict-modal-head"><h3 id="conflict-title">使用合并快照继续？</h3><p>PR #${esc(conflict.number)} · landing <code>${esc(String(conflict.landing).slice(0, 8))}</code></p></div>
        <div class="conflict-modal-body">
          <p>以下文件在合入时被冲突解决，landing 与 PR head、base 都不同：</p>
          <ul class="conflict-file-list">${rows}</ul>
          <p><b>继续后：</b></p>
          <ul class="conflict-impact"><li>本笔按 landing 单快照交付，内部 main 树与上游一致；</li><li>开发提交不会逐条重放；</li><li>Issue / PR / 合入校验照常执行，不会修改已合入的 PR。</li></ul>
          <label class="conflict-confirm"><input type="checkbox" data-conflict-confirm> 我已知晓：本笔不会逐条重放开发提交</label>
        </div>
        <div class="conflict-modal-foot"><button type="button" data-close-conflict>取消</button><button type="button" class="primary" data-action="accept-conflict-snapshot" data-conflict-accept disabled>使用合并快照继续</button></div>
      </div>
    </div>
  </section>`;
}

export function initializeConflictDialog() {
  const close = () => {
    document.querySelector('[data-conflict-dialog]')?.setAttribute('hidden', '');
    document.body.classList.remove('conflict-modal-open');
  };
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-open-conflict]')) {
      const dialog = document.querySelector('[data-conflict-dialog]');
      if (!dialog) return;
      dialog.removeAttribute('hidden');
      document.body.classList.add('conflict-modal-open');
      dialog.querySelector('[data-close-conflict]')?.focus({ preventScroll: true });
    }
    if (event.target.closest('[data-close-conflict]')) close();
    if (event.target.closest('[data-conflict-accept]')) close();
  });
  document.addEventListener('change', (event) => {
    if (!event.target.matches('[data-conflict-confirm]')) return;
    const accept = document.querySelector('[data-conflict-accept]');
    if (accept) accept.disabled = !event.target.checked;
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
}
