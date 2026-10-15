export function sourceTargetForm(state, tags, esc, sha) {
  return `<details ${state.queue.length ? '' : 'open'}><summary>选择本轮同步终点（逐笔接收）</summary>
  <form data-form="discover"><label>目标类型<select name="targetKind"><option value="latest">当前上游分支最新版本</option><option value="tag">指定 tag</option><option value="commit">指定完整 commit SHA</option></select></label>
  <label>目标 tag 名称 / 完整 commit SHA<input name="targetValue" placeholder="v2.0.0 或完整 SHA" list="continuous-tags"></label>
  <datalist id="continuous-tags">${tags.map((tag) => `<option value="${esc(tag.name)}"></option>`).join('')}</datalist>
  <label class="direct-commit-consent"><input type="checkbox" name="includeDirectCommits" ${state.syncTarget?.includeDirectCommits ? 'checked' : ''}>包含无 PR 的主干提交</label>
  <p>未勾选时会列出无关联 PR 的提交并暂停。勾选后，这些提交单独作为一笔来源交付，按顺序各建一个内部同步 PR；不伪造上游 PR，不跳过代码。Issue 仅按实际引用和关闭证据处理。多义关联或读取失败仍然暂停。</p>
  <button type="button" data-action="tags">读取可用 tag</button><button type="submit" class="primary">读取到目标版本的 PR 清单 →</button>
  <p>目标只是终点，不是一次搬运全部更新。一次接收一个完整 PR，或一笔明确包含的主干提交；完成本笔后才开放下一笔。目标必须在配置的来源分支上，且不能截断一个 PR。独立发布分支上的 tag 可能不满足该条件；只接收版本内容请新增“按版本更新”项目。标签移动时会暂停。</p></form></details>
  ${state.syncTarget ? `<p>本轮终点：${esc(state.syncTarget.kind === 'latest' ? '扫描时最新版本' : state.syncTarget.value)} · ${sha(state.syncTarget.commit)}${state.syncTarget.includeDirectCommits ? ' · 已明确包含无 PR 主干提交' : ''}${state.accepted.upstream === state.syncTarget.commit ? ' · 本轮终点已接收' : ''}<br>扫描时上游最新：${sha(state.latest)}${state.latest !== state.syncTarget.commit ? '（仍有本轮以外的后续更新）' : ''}</p>` : ''}`;
}
