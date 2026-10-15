import { initializeSubmissions } from './form-submission.mjs';
import { createSetupFlow } from './setup-flow.mjs';
import { retainView } from './view-state.mjs';
import { previewPanel } from './preview-view.mjs';
import { nextAction } from './action-policy.mjs';
import { captureDraft, configuration, restoreDraft } from './connections.mjs';
import { baselineContent, diagnostics } from './diagnostics.mjs';
import { restoreExpansion } from './expansion.mjs';
import { hydrateFileRules, initializeFileRules } from './file-rules.mjs';
import { initializeFormErrors } from './form-errors.mjs';
import { createGithubAuthentication } from './github-auth.mjs';
import { createHistory } from './history.mjs';
import { createIssueAuthentication, updateIssueFields } from './issue-auth.mjs';
import { issueSettings } from './issue-settings.mjs';
import { renderTask } from './operation-view.mjs';
import { createOperations } from './operations.mjs';
import { platformSettings, serviceLabel } from './platform.mjs';
import { pageProjectId, projectUrl } from './project-scope.mjs';
import { createProjectNavigation } from './projects.mjs';
import { createTaskFocus, focusBaselineInput, revealSetupResult } from './setup-navigation.mjs';
import { button, esc, sha, stageOf } from './ui.mjs';
import { workbench } from './workbench.mjs';
import { actionBar, attempts } from './workflow.mjs';
const content = document.getElementById('content');
const errorPanel = document.getElementById('error');
let snapshot;
let view = new URL(location.href).searchParams.get('view') === 'configuration' ? 'configuration' : 'workbench';
let mobileDetail = !!new URL(location.href).searchParams.get('record');
let availableTags = [];
const projectNavigation = createProjectNavigation(() => snapshot, saveDraft);
const issueAuthentication = createIssueAuthentication(() => snapshot, refresh, errorPanel);
const githubAuthentication = createGithubAuthentication(() => snapshot, refresh);
const records = createHistory(() => snapshot, render);
const focusTask = createTaskFocus();
const setup = createSetupFlow({ snapshot: () => snapshot, render, action: (...args) => action(...args) });
let preview = null;
const operations = createOperations({
  snapshot: () => snapshot,
  refresh,
  completed: showActionResult,
  errorPanel,
  onTask,
});
function draftKey() {
  return `repo-sync-draft:${pageProjectId === 'default' ? '' : `${pageProjectId}:`}${snapshot?.config?.bindingId ?? 'setup'}:${view}:${records.get().selected}`;
}
function saveDraft() {
  if (!snapshot || !content.childElementCount) return true;
  try {
    sessionStorage.setItem(draftKey(), JSON.stringify(captureDraft()));
    return true;
  } catch {
    return false;
  }
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
function render({ keepScroll = false } = {}) {
  const restoreView = retainView(content, snapshot.config?.bindingId, snapshot.connection?.revision);
  if (
    preview &&
    (preview.bindingId !== snapshot.config?.bindingId ||
      preview.base.upstream !== snapshot.state?.accepted.upstream ||
      preview.base.internal !== snapshot.state?.accepted.internal)
  )
    preview = null;
  document.getElementById('mode').textContent = serviceLabel(snapshot);
  content.innerHTML =
    view === 'configuration'
      ? `${configuration(snapshot, esc, sha, button, setup.state())}${snapshot.state && snapshot.config && snapshot.connection ? `<details class="card" data-platform-options><summary>PR / Issue 平台设置（按需修改）</summary>${platformSettings(snapshot, esc)}${issueSettings(snapshot, esc)}</details>` : ''}`
      : workbench(snapshot, records.get(), availableTags, mobileDetail);
  content.dataset.binding = snapshot.config?.bindingId ?? 'setup';
  content.dataset.revision = snapshot.connection?.revision ?? '';
  if (preview && view !== 'configuration' && records.get().selected === 'current' && !snapshot.state?.active)
    content.querySelector('.record-detail')?.insertAdjacentHTML('beforeend', previewPanel(preview));
  content.querySelector('#error-slot')?.append(errorPanel);
  restoreDraft(savedDraft());
  restoreExpansion(content, snapshot, records.get().selected, expandedKey());
  if (view === 'configuration') {
    const baseline = content.querySelector('form[data-form="inspect-baseline"]')?.closest('.card');
    const panel = diagnostics(snapshot.operation?.error, snapshot, esc);
    if (panel) (baseline ?? content).insertAdjacentHTML(baseline ? 'beforeend' : 'afterbegin', panel);
  }
  for (const form of content.querySelectorAll('form[data-form]')) updateIssueFields(form);
  hydrateFileRules();
  onTask(snapshot.operation);
  operations.lock();
  restoreView({ keepScroll });
}
let liveStage;
let lastAutomationStatus;
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
    focusLiveStage(task, policy);
  } else {
    const panel = content.querySelector('#operation');
    if (panel) panel.innerHTML = renderTask(task);
  }
  focusTask(task, snapshot);
}
function updateAttempts(nodes, record, task, historical) {
  const opened = new Set(
    [...content.querySelectorAll('[data-attempt][open]')].map(
      (item) => `${item.closest('[data-stage]').dataset.stage}:${item.dataset.attempt}`,
    ),
  );
  for (const node of nodes)
    node.innerHTML = attempts(Number(node.dataset.attemptsStage), record, task, historical, snapshot);
  for (const node of content.querySelectorAll('[data-attempt]'))
    if (opened.has(`${node.closest('[data-stage]').dataset.stage}:${node.dataset.attempt}`)) node.open = true;
}
let refreshing = 0;
async function refresh({ background = false } = {}) {
  const ticket = ++refreshing;
  saveDraft();
  const response = await fetch(projectUrl('/api/status?compact=1'), {
    signal: AbortSignal.timeout(8000),
  });
  const result = await response.json();
  if (response.ok && result.operation) result.operation.observedAt = new Date().toISOString();
  if (!response.ok) throw new Error(`${result.code ?? 'STATUS_UNREADABLE'}：${result.message ?? '无法读取工作台'}`);
  if (ticket !== refreshing) return;
  if (!snapshot && result.state?.active) mobileDetail = true;
  snapshot = result;
  projectNavigation.update(result.workspace);
  if (!snapshot.state && snapshot.operation) view = 'configuration';
  await records.load(true);
  render({ keepScroll: background });
  operations.observe(snapshot.operation);
}
initializeFormErrors();
const action = (input, form) => operations.action(input, form?.dataset.form);
initializeFileRules({
  snapshot: () => snapshot,
  action: async (...args) => {
    const result = await action(...args);
    if (args[0].action === 'inspect-baseline') setup.acceptReport(result);
    return result;
  },
  saveDraft,
  errorPanel,
});
document.addEventListener('click', async (event) => {
  const element = event.target.closest('button, [data-reveal]');
  if (!snapshot || !element) return;
  await navigate(element);
  if (element.hasAttribute('data-baseline-read')) {
    const result = await action({
      action: 'baseline-file',
      upstream: element.dataset.upstream,
      internal: element.dataset.internal,
      path: document.querySelector('[data-baseline-path]').value,
    });
    if (result) {
      const viewer = document.getElementById('baseline-file-content');
      viewer.innerHTML = baselineContent(result.result, esc);
      viewer.closest('details').open = true;
    }
  }
  if (element.dataset.view) changeView(element.dataset.view);
  if (element.dataset.action) {
    mobileDetail = true;
    const result = await action({
      action: element.dataset.action,
      ...(['synchronize', 'resume-sync', 'pause-sync'].includes(element.dataset.action)
        ? {}
        : { deliveryId: snapshot.state?.active?.id }),
      ...(['resume-sync', 'pause-sync'].includes(element.dataset.action)
        ? { runId: snapshot.state.automation.id }
        : {}),
      ...(['start', 'synchronize'].includes(element.dataset.action)
        ? { expectedTarget: snapshot.state?.queue[0]?.target }
        : {}),
    });
    showActionResult(element.dataset.action, result);
  }
});
function changeView(next) {
  saveDraft();
  view = next;
  const url = new URL(location.href);
  if (view === 'configuration') url.searchParams.set('view', view);
  else url.searchParams.delete('view');
  history.replaceState(null, '', url);
  render();
}
async function navigate(element) {
  if (element.dataset.reveal) {
    const target = document.getElementById(element.dataset.reveal);
    for (let parent = target; parent; parent = parent.parentElement)
      if (parent.tagName === 'DETAILS') parent.open = true;
    target?.querySelector('input, button, select')?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'start' });
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
  if (kind === 'inspect-baseline') return setup.acceptReport(result);
  if (kind === 'preview-sync') {
    preview = result.result;
    render();
    document.getElementById('sync-preview')?.scrollIntoView({ block: 'start' });
  }
  if (kind === 'tags') {
    availableTags = result.result;
    render();
  }
  if (kind === 'heads') {
    setup.heads(result.result);
    const internal = document.getElementById('internal');
    if (!internal) return;
    internal.value = result.result.internal;
    document.getElementById('upstream').placeholder = `最新 ${result.result.upstream}；请填已同步版本`;
    const heads = document.getElementById('observed-heads');
    if (heads)
      heads.innerHTML = `<p>读取成功：外部最新 ${sha(result.result.upstream)}<br>内部当前 ${sha(result.result.internal)}。请核对并填写上次已同步的 U0。</p>`;
    saveDraft();
    focusBaselineInput();
  }
}
initializeSubmissions({
  snapshot: () => snapshot,
  action,
  issueAuthentication,
  githubAuthentication,
  records,
  setup,
  complete: (kind, result) => {
    showActionResult(kind, result);
    showConfigurationConfirmation(kind, result);
  },
  activate: () => changeView('workbench'),
});
function showConfigurationConfirmation(action, result) {
  if (
    !result ||
    !['configure', 'configure-repositories', 'configure-pr', 'configure-issues', 'configure-closure'].includes(action)
  )
    return;
  const confirmation = document.createElement('p');
  confirmation.setAttribute('role', 'status');
  confirmation.textContent = {
    configure: '同步方式与文件规则已保存，请登记已有基线。',
    'configure-pr': 'PR 创建设置已保存，原基线与台账保留。回到工作台继续同步。',
    'configure-issues': 'Issue 自动化设置已保存。回到本笔同步继续创建或回读原对象。',
    'configure-repositories': '仓库配置已保存在本机。下一步：读取两侧版本并登记已有基线。',
    'configure-closure': '关单规则确认已保存。原基线与 Issue 映射保留，可继续本笔同步。',
  }[action];
  const setup = ['configure', 'configure-repositories'].includes(action);
  const form = content.querySelector(`form[data-form="${action}"]`);
  if (!setup && form) {
    form.after(confirmation);
    confirmation.scrollIntoView({ block: 'nearest' });
  } else (content.querySelector('[data-setup-current]') ?? content).prepend(confirmation);
  revealSetupResult(action, snapshot);
  saveDraft();
}
document.addEventListener('input', saveDraft);
document.addEventListener('change', (event) => {
  if (event.target.matches('[name="mode"]')) {
    const form = event.target.closest('form');
    const closure = form.querySelector('[data-closure]');
    if (closure) closure.hidden = event.target.value === 'version';
  }
  saveDraft();
});
document.addEventListener('click', (event) => {
  const summary = event.target.closest('[data-stage] > summary');
  if (!summary) return;
  const stage = summary.parentElement;
  const key = expandedKey();
  const next = !stage.open;
  try {
    const saved = JSON.parse(sessionStorage.getItem(key)) ?? {};
    const manual = Array.isArray(saved) ? Object.fromEntries(saved.map((id) => [id, true])) : saved;
    manual[stage.dataset.stage] = next;
    sessionStorage.setItem(key, JSON.stringify(manual));
  } catch {}
});
projectNavigation
  .load()
  .then(refresh)
  .catch((error) => {
    errorPanel.textContent = error.message;
    errorPanel.hidden = false;
  });
function showActivity(task) {
  const activity = document.getElementById('current-activity');
  if (activity)
    activity.textContent =
      task && ['RUNNING', 'CANCELLING', 'STOP_UNCONFIRMED'].includes(task.status)
        ? `当前同步：${task.status} · 状态最近成功读取 ${task.observedAt ?? '未记录'} · 可点击“当前同步”返回查看`
        : '';
}
setInterval(() => {
  if (
    ['RUNNING', 'WAITING_REVIEW'].includes(snapshot?.state?.automation?.status) ||
    (['synchronize', 'resume-sync'].includes(snapshot?.operation?.action) && snapshot.operation.status === 'RUNNING')
  )
    refresh({ background: true }).catch(() => {});
}, 5000);
function focusLiveStage(task, policy) {
  const run = snapshot.state?.automation;
  const currentStatus = run?.status;

  // 当自动化状态从 RUNNING 变为 PAUSED/FAILED/COMPLETE 时，重置 liveStage
  if (lastAutomationStatus === 'RUNNING' && currentStatus !== 'RUNNING' && currentStatus !== 'WAITING_REVIEW') {
    liveStage = null;
  }
  lastAutomationStatus = currentStatus;

  // 只在任务实际运行时才自动展开阶段
  if (task?.status !== 'RUNNING') return;

  // 只在阶段真正变化时才更新展开状态
  const targetStage = policy?.stage || stageOf(snapshot.state.active);
  if (liveStage !== targetStage) {
    liveStage = targetStage;
    // 先关闭所有阶段
    content.querySelectorAll('[data-stage][open]').forEach(el => {
      if (Number(el.dataset.stage) !== targetStage) {
        el.removeAttribute('open');
      }
    });
    // 只打开当前活跃的阶段
    content.querySelector(`[data-stage="${targetStage}"]`)?.setAttribute('open', '');
  }
}
