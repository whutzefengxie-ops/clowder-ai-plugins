import { configuration, firstUse, repositoryInput } from './connections.mjs';
import { baselineContent, diagnostics, stageRule } from './diagnostics.mjs';
import { fileTree, hydrateFiles } from './files.mjs';
import { issueForms } from './issues.mjs';
import { createOperations } from './operations.mjs';
import { prPanel } from './pr.mjs';
import { progressSteps } from './progress.mjs';
import { receiptFields } from './receipts.mjs';
import { conflictEditor, conflictOptions, tagSelector, versionPreview } from './version.mjs';

const content = document.getElementById('content');
const errorPanel = document.getElementById('error');
let snapshot;
let view = 'workbench';
const operations = createOperations({ snapshot: () => snapshot, refresh, completed: showActionResult, errorPanel });
let availableTags = [];
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
const sha = (value) => `<code title="${esc(value)}">${esc(value)}</code>`;
const button = (action, label) => `<button type="button" class="primary" data-action="${action}">${label}</button>`;
async function refresh() {
  const response = await fetch('/api/status', { signal: AbortSignal.timeout(8000) });
  const result = await response.json();
  if (!response.ok) throw new Error(`${result.code ?? 'STATUS_UNREADABLE'}：${result.message ?? '无法读取工作台'}`);
  snapshot = result;
  if (!snapshot.state && snapshot.operation) view = 'configuration';
  render();
  operations.observe(snapshot.operation);
}
const action = (input) => operations.action(input);
const states = {
  ISSUES_REQUIRED: [
    '在内部平台创建或复用 Issue',
    '登记来源与内部对象的对应。已有映射可直接复用；候选分支推送前先完成映射。',
  ],
  PUSH_RESULT_UNKNOWN: ['候选分支推送结果待确认', '先核对同名 ref 的实际 SHA。复用相同候选，冲突时暂停。'],
  PR_REQUIRED: [
    '候选已推送，在内部平台创建 PR',
    '使用下方标题和正文，选择展示的候选分支与目标分支。创建后登记具体 PR 链接。',
  ],
  WAITING_APPROVAL: [
    '在内部 PR 完成审核与合入',
    '打开具体 PR，在平台正常审核合入；回来核验。程序只读取 Git 结果，不替代平台审批。',
  ],
  CODE_ACCEPTED_PENDING_METADATA: [
    '代码已接受，更新 Issue 接收状态',
    '按平台实际状态保存本笔记录。有后续交付时保持打开，本笔仍可完成；接收条件满足后在平台关闭并确认。',
  ],
};
function versionPrimary(active, state) {
  if (snapshot.config.mode !== 'version') return null;
  if (!active) return state.queue.length ? button('start', `开始更新至 ${esc(state.queue[0].source.tag)} →`) : '';
  if (active.status !== 'CODE_PREPARE_REQUIRED') return null;
  if (active.error?.code === 'CONTENT_CONFLICT')
    return '<a class="button primary" href="#conflict-options">解决文件冲突 →</a>';
  return button('prepare', '合并文件、检查并推送候选 →');
}
function primary(active, state) {
  const versionAction = versionPrimary(active, state);
  if (versionAction !== null) return versionAction;
  if (!active)
    return state.queue.length
      ? button('start', `同步上游 PR #${state.queue[0].source.number} →`)
      : button('discover', '检查上游更新');
  if (active.error || active.status === 'PUSH_RESULT_UNKNOWN') return button('recover', '核对原交付并恢复');
  if (active.status === 'ISSUES_REQUIRED' && active.issues.every((issue) => state.issues[issue.sourceId]))
    return button('prepare', '检查并推送候选分支 →');
  if (active.status === 'WAITING_APPROVAL')
    return `<a class="button primary" href="${esc(active.prUrl)}" target="_blank" rel="noopener">打开内部 PR ↗</a>${button('recover', '已在平台合入，核验 Git 结果')}`;
  const destinations = {
    ISSUES_REQUIRED: ['issue-mappings', '登记内部 Issue 对应 →'],
    PR_REQUIRED: [
      'pr-form',
      snapshot.platform?.prMode === 'automatic' ? '查询 / 创建内部 PR →' : '在平台创建并登记 PR →',
    ],
    CODE_ACCEPTED_PENDING_METADATA: ['receipt-form', '确认 Issue 接收记录 →'],
  };
  const [id, label] = destinations[active.status];
  return `<a class="button primary" href="#${id}">${label}</a>`;
}
function workflow(active, state = snapshot.state) {
  const marks = { done: '✓', current: '●', pending: '○', failed: '×' };
  return `<p>最近读取的内部 HEAD：${sha(state.observedInternal ?? state.accepted.internal)}${state.observedInternal && state.observedInternal !== state.accepted.internal ? ' · 尚未登记为接受版本' : ''}</p><ol class="flow">${progressSteps(
    active,
    state,
    snapshot.config.checkProfile,
    snapshot.platform?.prMode,
  )
    .map(
      (group) =>
        `<li><b>${group.label}</b>${group.children.map((step) => `<small data-step-state="${step.status}" class="${step.status === 'failed' ? 'bad' : step.status === 'done' ? 'good' : ''}">${marks[step.status]} ${step.name}</small>`).join('')}</li>`,
    )
    .join('')}</ol>`;
}
function currentForm(active, state) {
  const anchors = {
    ISSUES_REQUIRED: 'issue-mappings',
    PR_REQUIRED: 'pr-form',
    CODE_ACCEPTED_PENDING_METADATA: 'receipt-form',
  };
  return `<div id="${anchors[active.status] ?? 'step-content'}">${currentFormContent(active, state)}</div>`;
}
function currentFormContent(active, state) {
  if (active.status === 'CODE_PREPARE_REQUIRED')
    return `${versionPreview(active, esc, sha)}${conflictOptions(active, esc)}<section class="card"><button type="button" data-action="cancel-version">撤销未发布交付，重新选择版本</button><p>历史记录保留。已发布候选必须先恢复，不能撤销。</p></section>`;
  if (active.status === 'ISSUES_REQUIRED') return issueForms(active, state, esc);
  if (['PR_REQUIRED', 'WAITING_APPROVAL'].includes(active.status)) return prPanel(snapshot, esc);
  if (active.status === 'CODE_ACCEPTED_PENDING_METADATA')
    return `<section class="card"><form data-form="receipts"><h3>确认平台实际状态并保存接收记录</h3>${receiptFields(active, state, esc, sha)}<button type="submit" class="primary">保存本笔接收记录，完成同步</button><p>此操作记录人工核对结果，不向内部平台发送关单请求。</p></form></section>`;
  return '';
}
function idlePresentation(state) {
  if (!state.queue.length) return ['本轮交付已完成', '可检查新更新，也可展开每笔记录回看过程。'];
  if (snapshot.config.mode === 'version')
    return [`已选择 ${esc(state.queue[0].source.tag)}`, '目标与内部基线已核对，点击开始生成本次版本交付。'];
  return ['有上游更新可以接收', '按 main 实际接受顺序逐笔处理，内部 main 在平台合入前保持原版本。'];
}
function workbench() {
  const state = snapshot.state;
  if (!snapshot.config) return firstUse();
  if (!state)
    return `<section class="card task"><h2>先确认两侧已有基线</h2><p>连接已从私有配置载入，登记外部已同步版本与内部当前版本即可开始。</p><button type="button" data-view="configuration" class="primary">配置同步基线 →</button></section>`;
  const active = state.active;
  if (snapshot.config.mode === 'version' && !active && !state.queue.length)
    return `${tagSelector(availableTags, esc, sha)}${versionHistory(state)}`;
  const [title, description] = active ? taskPresentation(active, state) : idlePresentation(state);
  if (!active && !state.queue.length && state.accepted.upstream !== state.latest)
    return `<section class="card task"><h2>读取上游交付清单</h2><p>Git 已读取到更新版本。先关联 PR、Issue 与实际提交并冻结范围，再发起同步。</p>${button('discover', '检查上游更新')}</section>`;
  return `<section class="card task"><div class="task-top"><div><span class="badge">${active ? esc(active.status) : '准备就绪'}</span><h2>${title}</h2><p>${description}</p></div><div>${primary(active, state)}</div></div>${active ? `<p>候选分支：${esc(active.branch)} → ${esc(snapshot.config.targetBranch)}</p>${workflow(active)}` : ''}</section><section class="card versions"><div><small>已接受上游</small>${sha(state.accepted.upstream)}</div><div><small>对应内部 commit</small>${sha(state.accepted.internal)}</div><div><small>冻结扫描目标</small>${sha(state.latest)}<small>${state.queue.length} 笔待完成交付</small></div></section>${
    active?.error
      ? `<div class="card bad">× ${esc(active.error.code)}<p>${esc(active.error.message)}</p>${
          active.error.details?.paths
            ? `${fileTree(
                active.error.details.paths.map((path) => ({ path, kind: '异常', category: 'merge' })),
                '异常文件清单',
              )}`
            : ''
        }</div>`
      : ''
  }${active ? currentForm(active, state) : ''}<section class="card"><h3>本轮同步与审计</h3>${
    state.deliveries
      .map(
        (delivery) =>
          `<details><summary>${esc(delivery.source.title)} · ${esc(delivery.status)}</summary><p>${esc(delivery.id)} · ${esc(delivery.branch)}</p>${delivery.prUrl ? `<p><a href="${esc(delivery.prUrl)}" target="_blank" rel="noopener">打开对应内部 PR ↗</a></p>` : ''}<p>目标 ${sha(delivery.target)} → 内部 ${sha(delivery.acceptedInternal ?? '待接受')}</p><details><summary>${delivery.mode === 'version' ? '上游版本提交范围（不重放提交）' : '本笔原始 commit 对应'}</summary><pre>${esc(delivery.commits.map((commit) => (delivery.mode === 'version' ? commit : `${commit} → ${commit}`)).join('\n'))}</pre><small>${delivery.mode === 'version' ? '来源 SHA 用于版本追溯；内部候选是一次内容更新提交。' : '原始对象 SHA 保留；内部接收节点单独记录。'}</small></details><pre>${esc(
            state.events
              .filter((event) => event.deliveryId === delivery.id)
              .map((event) => `${event.time} ${event.message}`)
              .join('\n'),
          )}</pre>${Object.values(delivery.issueResults)
            .map(
              (result) =>
                `<small>${result.state === 'open' ? 'Issue 保持打开' : 'Issue 已关闭'} · 接收记录已保存${result.pending.length ? '，等待后续交付' : ''}</small>`,
            )
            .join('')}</details>`,
      )
      .join('') || '<p>开始同步后，这里按每笔交付显示执行记录。</p>'
  }</section>`;
}
function taskPresentation(active, state) {
  if (active.status === 'PR_REQUIRED' && snapshot.platform?.prMode === 'automatic' && !active.error)
    return ['候选已发布，查询 / 创建内部 PR', '使用私有平台适配器，先查询再创建并回读；随后在真实平台审核。'];
  if (active.status === 'CODE_PREPARE_REQUIRED' && !active.error)
    return [
      `准备更新至 ${esc(active.source.tag)}`,
      '核对下方文件范围。内部专有文件保留，共同文件三方合并；只生成一个同步 PR。',
    ];
  if (active.error) return ['执行暂停，先核对原交付', active.error.message];
  if (active.status === 'ISSUES_REQUIRED' && active.issues.every((issue) => state.issues[issue.sourceId]))
    return ['内部 Issue 已就绪，准备同步代码', '点击检查并推送候选分支。原始提交保留，内部 main 仍等待平台审批。'];
  return states[active.status] ?? ['核对当前结果', '恢复原交付后继续。'];
}
function render() {
  document.getElementById('mode').textContent = snapshot.config
    ? `正式服务 · PR ${snapshot.platform?.prMode === 'automatic' ? '平台适配器创建' : '手工创建'}`
    : '正式服务 · 等待仓库配置';
  content.innerHTML = view === 'configuration' ? configuration(snapshot, esc, sha, button) : workbench();
  const badge = content.querySelector('.task .badge');
  if (badge && snapshot.state?.active)
    badge.textContent = snapshot.state.active.error
      ? '执行异常'
      : snapshot.state.active.status === 'WAITING_APPROVAL'
        ? '等待内部审核'
        : '完成当前步骤';
  renderFreshness();
  renderDiagnostics();
  hydrateFiles(content);
  operations.lock();
}
function renderDiagnostics() {
  const panel = diagnostics(snapshot.state?.active?.error ?? snapshot.operation?.error, snapshot, esc);
  const baseline = content.querySelector('form[data-form="adopt"]')?.closest('.card');
  if (panel) (baseline ?? content).insertAdjacentHTML(baseline ? 'beforeend' : 'afterbegin', panel);
}
function renderFreshness() {
  if (view === 'workbench' && snapshot.state) {
    const freshness = document.createElement('p');
    freshness.className = 'badge';
    freshness.textContent =
      snapshot.state.accepted.upstream === snapshot.state.latest
        ? snapshot.state.active
          ? '代码已接收至本轮最新 · 本笔记录待完成'
          : '代码与本轮扫描目标一致'
        : '代码尚未接收至本轮扫描的最新版本';
    content.prepend(freshness);
  }
}
document.addEventListener('click', async (event) => {
  const element = event.target.closest('button');
  if (!element) return;
  if (element.dataset.rulePath) stageRule(element);
  if (element.hasAttribute('data-baseline-read')) {
    const result = await action({
      action: 'baseline-file',
      upstream: element.dataset.upstream,
      internal: element.dataset.internal,
      path: document.querySelector('[data-baseline-path]').value,
    });
    if (result) document.getElementById('baseline-file-content').innerHTML = baselineContent(result.result, esc);
  }
  if (element.dataset.conflictPath) {
    const result = await action({ action: 'conflict', path: element.dataset.conflictPath });
    if (result) document.getElementById('conflict-editor').innerHTML = conflictEditor(result.result, esc);
  }
  if (element.dataset.view) {
    view = element.dataset.view;
    render();
  }
  if (element.dataset.action) {
    const result = await action({ action: element.dataset.action, deliveryId: snapshot.state?.active?.id });
    showActionResult(element.dataset.action, result);
  }
});
function showActionResult(kind, result) {
  if (!result) return;
  if (kind === 'tags') {
    availableTags = result.result;
    render();
  }
  if (kind === 'heads') {
    const internal = document.getElementById('internal');
    if (!internal) return;
    internal.value = result.result.internal;
    document.getElementById('upstream').placeholder = `最新 ${result.result.upstream}；请填已同步版本`;
    const heads = document.getElementById('observed-heads');
    if (heads)
      heads.innerHTML = `<p>读取成功：外部最新 ${sha(result.result.upstream)}<br>内部当前 ${sha(result.result.internal)}。请核对并填写上次已同步的 U0。</p>`;
  }
}
document.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  const fields = Object.fromEntries(new FormData(form));
  const input =
    form.dataset.form === 'configure-repositories' ? repositoryInput(fields) : { action: form.dataset.form, ...fields };
  if (input.action === 'configure')
    for (const key of ['internalPaths', 'mergePaths'])
      input[key] =
        fields.mode === 'version'
          ? fields[key]
              .split(/\r?\n/)
              .map((value) => value.trim())
              .filter(Boolean)
          : [];
  if (input.action === 'issue') input.sourceId = form.dataset.source;
  if (input.action === 'receipts')
    input.observations = snapshot.state.active.issues.map((issue) => ({
      sourceId: issue.sourceId,
      internalId: snapshot.state.issues[issue.sourceId].internalId,
      state: fields[issue.sourceId],
    }));
  const result = await action(input);
  if (['configure', 'configure-repositories'].includes(input.action) && result) {
    const confirmation = document.createElement('p');
    confirmation.setAttribute('role', 'status');
    confirmation.textContent =
      input.action === 'configure'
        ? '同步方式与文件规则已保存，请登记已有基线。'
        : '仓库配置已保存在本机。下一步：读取两侧版本并登记已有基线。';
    content.prepend(confirmation);
  }
});

function versionHistory(state) {
  return `<section class="card"><h3>当前已接收版本</h3><p>${esc(state.accepted.tag ?? '已登记初始基线')} · 外部 ${sha(state.accepted.upstream)} → 内部 ${sha(state.accepted.internal)}</p><h3>每次版本更新与审计</h3>${
    state.deliveries
      .map(
        (delivery) =>
          `<details><summary>${esc(delivery.source.tag)} · ${esc(delivery.status)}</summary><p>外部 ${sha(delivery.target)} → 内部 ${sha(delivery.acceptedInternal ?? '待接受')}</p>${delivery.prUrl ? `<a href="${esc(delivery.prUrl)}" target="_blank" rel="noopener">打开对应内部 PR ↗</a>` : ''}<pre>${esc(
            state.events
              .filter((event) => event.deliveryId === delivery.id)
              .map((event) => `${event.time} ${event.message}`)
              .join('\n'),
          )}</pre></details>`,
      )
      .join('') || '<p>尚无版本更新记录。</p>'
  }</section>`;
}
document.addEventListener('change', (event) => {
  if (event.target.matches('[name="mode"]')) {
    const form = event.target.closest('form');
    const policy = form.querySelector('[data-policy]');
    const closure = form.querySelector('[data-closure]');
    if (policy) policy.hidden = event.target.value !== 'version';
    if (closure) closure.hidden = event.target.value === 'version';
  }
});

refresh().catch((error) => {
  errorPanel.textContent = error.message;
  errorPanel.hidden = false;
});
