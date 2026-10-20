import { esc } from './ui.mjs';

const modes = { continuous: '同步开发过程', version: '按 tag 更新' };
const statuses = {
  UNCONFIGURED: '待配置仓库',
  BASELINE_REQUIRED: '待核验同步起点',
  RUNNING: '自动执行中',
  WAITING_REVIEW: '等待审核合入',
  FAILED: '异常待处理',
  OBSERVATION_FAILED: '合入状态读取失败',
  PAUSED: '已停止后续处理',
  ACTION_REQUIRED: '原同步需要处理',
  READY: '可选择下次目标',
  COMPLETE: '本轮已完成',
};
export function projectView(
  { workspace, editor, pendingCreate, sending, error, navigation },
  selected,
) {
  if (!workspace) return `<p class="bad" role="alert">${esc(error)}</p>`;
  const current = workspace.projects.find((project) => project.id === selected);
  const options = workspace.projects.map((project) => projectOption(project, selected)).join('');
  const unknown = current ? '' : '<option value="" selected disabled>项目不存在，请重新选择</option>';
  const sidebar = `<nav class="project-sidebar-list" aria-label="项目侧栏">${workspace.projects.map((project) => `<div class="project-sidebar-row ${project.id === selected ? 'selected' : ''}"><button type="button" data-project-enter="${esc(project.id)}"><b title="${esc(project.name)}">${esc(project.name)}</b><small class="project-sidebar-status">${esc(modes[project.mode] ?? '待配置')}<span class="project-sidebar-state"><span class="project-status-dot ${statusTone(project)}" aria-hidden="true"></span>${esc(statuses[project.syncStatus] ?? '状态未读取')}</span></small>${projectMeta(project)}</button><button type="button" data-project-settings="${esc(project.id)}" aria-label="${esc(project.name)}的仓库设置" title="仓库设置">⚙</button></div>`).join('')}</nav>`;
  return `${sidebar}<div class="project-controls"><label hidden>当前同步项目<select data-project-select>${unknown}${options}</select></label><button type="button" data-project-create>＋ 新增项目</button></div><p>每个项目独立保存仓库、模式、同步历史与任务。普通草稿按项目保存，未提交的 Token 不保存；切换不停止后台同步。</p>${navigation ? `<div class="project-switch-warning" role="alert"><p>${esc(navigation.message)}</p><div class="task-actions"><button type="button" data-project-stay>留在当前项目</button><button type="button" data-project-leave>放弃未保存内容后切换</button></div></div>` : ''}${editor ? editorForm(editor, current, pendingCreate, sending) : ''}${error ? `<p class="bad" role="alert">${esc(error)}</p>${pendingCreate ? '<button type="button" data-project-retry>查询 / 重试原新增请求</button>' : ''}` : ''}`;
}
function statusTone(project) {
  if (project.error || project.observationError || ['FAILED', 'OBSERVATION_FAILED', 'ACTION_REQUIRED'].includes(project.syncStatus)) return 'bad';
  if (project.busy || project.syncStatus === 'RUNNING') return 'run';
  if (project.syncStatus === 'WAITING_REVIEW' || project.syncStatus === 'PAUSED') return 'wait';
  if (project.syncStatus === 'READY' || project.syncStatus === 'COMPLETE') return 'good';
  return 'idle';
}
function projectMeta(project) {
  const accepted = project.accepted?.tag ?? project.accepted?.upstream;
  const rows = [];
  if (accepted) rows.push(`最后接收 ${shortCommit(accepted)}`);
  if (project.lastAcceptedAt) rows.push(`接收于 ${shortDate(project.lastAcceptedAt)}`);
  if (project.lastObservedAt) rows.push(`最后观察 ${shortDate(project.lastObservedAt)}`);
  else if (project.lastScannedAt) rows.push(`最后扫描 ${shortDate(project.lastScannedAt)}`);
  if (!rows.length) return '';
  const full = typeof accepted === 'string' && shortCommit(accepted) !== accepted ? ` title="${esc(accepted)}"` : '';
  return `<small class="project-sidebar-meta"${full}>${rows.map(esc).join('<br>')}</small>`;
}
function shortCommit(value) {
  return typeof value === 'string' && /^[a-f0-9]{40,64}$/i.test(value) ? value.slice(0, 12) : value;
}
function shortDate(value) {
  return new Date(value).toISOString().slice(0, 10);
}
function projectOption(project, selected) {
  const mode = modes[project.mode] ?? '待配置';
  const label = project.error ? '配置异常' : mode;
  return `<option value="${esc(project.id)}" ${project.id === selected ? 'selected' : ''}>${esc(project.name)} · ${label}${project.syncStatus ? ` · ${statuses[project.syncStatus] ?? '状态未知'}` : project.busy ? ' · 任务处理中' : ''}</option>`;
}
function editorForm(editor, current, pendingCreate, sending) {
  const name = editor === 'rename' ? (current?.name ?? '') : (pendingCreate?.name ?? '');
  return `<form data-project-form><label>项目名称<input name="name" required maxlength="80" value="${esc(name)}" placeholder="例如：通用核心 / 定制产品"></label><div class="task-actions"><button type="submit" class="primary" ${sending ? 'disabled' : ''}>${editor === 'create' ? '创建项目，配置仓库 →' : '保存项目名称'}</button><button type="button" data-project-cancel>取消</button></div></form>`;
}
