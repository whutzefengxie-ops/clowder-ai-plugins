import { nextAction } from './action-policy.mjs';
import { restoreConflict, saveConflict } from './conflict-draft.mjs';
import { captureDraft, configuration, repositoryInput, restoreDraft } from './connections.mjs';
import { baselineContent, diagnostics, stageRule } from './diagnostics.mjs';
import { hydrateFiles } from './files.mjs';
import { createHistory } from './history.mjs';
import { renderTask } from './operation-view.mjs';
import { createOperations } from './operations.mjs';
import { platformSettings } from './platform.mjs';
import { button, esc, sha, stageOf } from './ui.mjs';
import { conflictEditor } from './version.mjs';
import { workbench } from './workbench.mjs';
import { actionBar, attempts } from './workflow.mjs';

const content = document.getElementById('content');
const errorPanel = document.getElementById('error');
let snapshot;
let view = new URL(location.href).searchParams.get('view') === 'configuration' ? 'configuration' : 'workbench';
let mobileDetail = !!new URL(location.href).searchParams.get('record');
let availableTags = [];
const records = createHistory(() => snapshot, render);
const operations = createOperations({
  snapshot: () => snapshot,
  refresh,
  completed: showActionResult,
  errorPanel,
  onTask,
});
function draftKey() {
  return `repo-sync-draft:${snapshot?.config?.bindingId ?? 'setup'}:${view}:${records.get().selected}`;
}
function saveDraft() {
  try {
    sessionStorage.setItem(draftKey(), JSON.stringify(captureDraft()));
  } catch {}
}
function savedDraft() {
  try {
    return JSON.parse(sessionStorage.getItem(draftKey())) ?? [];
  } catch {
    return [];
  }
}
function expandedKey() {
  return `${draftKey()}:expanded`;
}
function restoreExpansion() {
  try {
    const expanded = JSON.parse(sessionStorage.getItem(expandedKey()));
    if (expanded)
      for (const element of content.querySelectorAll('[data-stage]'))
        element.open = expanded.includes(element.dataset.stage);
  } catch {}
  const currentStage = content.querySelector(`[data-stage="${nextAction(snapshot, snapshot.state?.active).stage}"]`);
  if (records.get().selected === 'current') currentStage?.setAttribute('open', '');
}
function render() {
  document.getElementById('mode').textContent = snapshot.config
    ? `正式服务 · PR ${snapshot.platform?.transport === 'git' ? 'Git 自动创建' : snapshot.platform?.prMode === 'automatic' ? '平台适配器创建' : '手工创建'}`
    : '正式服务 · 等待仓库配置';
  content.innerHTML =
    view === 'configuration'
      ? `${configuration(snapshot, esc, sha, button)}${platformSettings(snapshot, esc)}<div id="operation"></div><div id="error-slot"></div>`
      : workbench(snapshot, records.get(), availableTags, mobileDetail);
  content.querySelector('#error-slot')?.append(errorPanel);
  restoreConflict(snapshot, content);
  restoreDraft(savedDraft());
  restoreExpansion();
  if (view === 'configuration') {
    const baseline = content.querySelector('form[data-form="adopt"]')?.closest('.card');
    const panel = diagnostics(snapshot.operation?.error, snapshot, esc);
    if (panel) (baseline ?? content).insertAdjacentHTML(baseline ? 'beforeend' : 'afterbegin', panel);
  }
  hydrateFiles(content);
  onTask(snapshot.operation);
  operations.lock();
}
function onTask(task) {
  if (!snapshot) return;
  snapshot.operation = task;
  const record = records.get().detail;
  const historical = records.get().selected !== 'current' && records.get().selected !== snapshot.state?.active?.id;
  showActivity(task);
  if (historical) return;
  const nodes = content.querySelectorAll('[data-attempts-stage]');
  if (nodes.length) {
    updateAttempts(nodes, record, task, historical);
    const footer = content.querySelector('.next-action');
    const policy = nextAction(snapshot, snapshot.state.active);
    if (footer && footer.dataset.policy !== JSON.stringify(policy)) {
      footer.outerHTML = actionBar(policy, false);
      content.querySelector('.next-action').dataset.policy = JSON.stringify(policy);
    }
    if (task?.status === 'RUNNING')
      content
        .querySelector(`[data-stage="${policy.stage || stageOf(snapshot.state.active)}"]`)
        ?.setAttribute('open', '');
  } else {
    const panel = content.querySelector('#operation');
    if (panel) panel.innerHTML = renderTask(task);
  }
}
function updateAttempts(nodes, record, task, historical) {
  const opened = new Set(
    [...content.querySelectorAll('[data-attempt][open]')].map(
      (item) => `${item.closest('[data-stage]').dataset.stage}:${item.dataset.attempt}`,
    ),
  );
  for (const node of nodes) node.innerHTML = attempts(Number(node.dataset.attemptsStage), record, task, historical);
  for (const node of content.querySelectorAll('[data-attempt]'))
    if (opened.has(`${node.closest('[data-stage]').dataset.stage}:${node.dataset.attempt}`)) node.open = true;
}
async function refresh() {
  saveDraft();
  const response = await fetch('/api/status?compact=1', { signal: AbortSignal.timeout(8000) });
  const result = await response.json();
  if (!response.ok) throw new Error(`${result.code ?? 'STATUS_UNREADABLE'}：${result.message ?? '无法读取工作台'}`);
  if (!snapshot && result.state?.active) mobileDetail = true;
  snapshot = result;
  if (!snapshot.state && snapshot.operation) view = 'configuration';
  await records.load(true);
  render();
  operations.observe(snapshot.operation);
}
const action = (input) => operations.action(input);
document.addEventListener('click', async (event) => {
  const element = event.target.closest('button, [data-reveal]');
  if (!element) return;
  await navigate(element);
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
    if (result) {
      saveConflict(snapshot, result.result);
      document.getElementById('conflict-editor').innerHTML = conflictEditor(result.result, esc);
      saveDraft();
    }
  }
  if (element.dataset.view) {
    saveDraft();
    view = element.dataset.view;
    const url = new URL(location.href);
    if (view === 'configuration') url.searchParams.set('view', view);
    else url.searchParams.delete('view');
    history.replaceState(null, '', url);
    render();
  }
  if (element.dataset.action) {
    mobileDetail = true;
    const result = await action({
      action: element.dataset.action,
      deliveryId: snapshot.state?.active?.id,
      ...(element.dataset.action === 'start' ? { expectedTarget: snapshot.state?.queue[0]?.target } : {}),
    });
    showActionResult(element.dataset.action, result);
  }
});
async function navigate(element) {
  if (element.dataset.reveal) {
    const target = document.getElementById(element.dataset.reveal);
    for (let parent = target; parent; parent = parent.parentElement)
      if (parent.tagName === 'DETAILS') parent.open = true;
    target?.querySelector('input, button, select')?.focus({ preventScroll: true });
  }
  if (element.hasAttribute('data-expand-all'))
    for (const stage of content.querySelectorAll('[data-stage]')) stage.open = true;
  if (element.dataset.record) {
    saveDraft();
    mobileDetail = true;
    await records.select(element.dataset.record);
  }
  if (element.hasAttribute('data-record-back')) {
    mobileDetail = false;
    saveDraft();
    render();
  }
  if (element.hasAttribute('data-record-page')) await records.move(Number(element.dataset.recordPage));
  if (element.hasAttribute('data-reload-record')) {
    await records.load(true);
    render();
  }
  if (element.hasAttribute('data-more-tasks')) await records.moreTasks();
}
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
    saveDraft();
  }
}
document.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  const fields = Object.fromEntries(new FormData(form));
  if (form.hasAttribute('data-record-filter')) return records.filter(fields);
  let input =
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
    input = {
      action: 'receipts',
      deliveryId: snapshot.state.active.id,
      observations: snapshot.state.active.issues.map((issue) => ({
        sourceId: issue.sourceId,
        internalId: snapshot.state.issues[issue.sourceId].internalId,
        state: fields[issue.sourceId],
      })),
    };
  const result = await action(input);
  if (['configure', 'configure-repositories', 'configure-pr'].includes(input.action) && result) {
    const confirmation = document.createElement('p');
    confirmation.setAttribute('role', 'status');
    confirmation.textContent = {
      configure: '同步方式与文件规则已保存，请登记已有基线。',
      'configure-pr': 'PR 创建设置已保存，原基线与台账保留。回到工作台继续同步。',
      'configure-repositories': '仓库配置已保存在本机。下一步：读取两侧版本并登记已有基线。',
    }[input.action];
    content.prepend(confirmation);
  }
});
document.addEventListener('input', saveDraft);
document.addEventListener('change', (event) => {
  if (event.target.matches('[name="mode"]')) {
    const form = event.target.closest('form');
    const policy = form.querySelector('[data-policy]');
    const closure = form.querySelector('[data-closure]');
    if (policy) policy.hidden = event.target.value !== 'version';
    if (closure) closure.hidden = event.target.value === 'version';
  }
  saveDraft();
});
document.addEventListener(
  'toggle',
  (event) => {
    if (!event.target.matches('[data-stage]')) return;
    try {
      sessionStorage.setItem(
        expandedKey(),
        JSON.stringify([...content.querySelectorAll('[data-stage][open]')].map((item) => item.dataset.stage)),
      );
    } catch {}
  },
  true,
);
refresh().catch((error) => {
  errorPanel.textContent = error.message;
  errorPanel.hidden = false;
});

function showActivity(task) {
  const activity = document.getElementById('current-activity');
  if (activity)
    activity.textContent =
      task && ['RUNNING', 'CANCELLING', 'STOP_UNCONFIRMED'].includes(task.status)
        ? `当前同步：${task.status} · 可点击“当前同步”返回查看`
        : '';
}
