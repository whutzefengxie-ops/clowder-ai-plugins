import { esc } from './ui.mjs';

export function projectView({ workspace, editor, pendingCreate, sending, error }, selected) {
  if (!workspace) return `<p class="bad" role="alert">${esc(error)}</p>`;
  const current = workspace.projects.find((project) => project.id === selected);
  const options = workspace.projects.map((project) => projectOption(project, selected)).join('');
  const unknown = current ? '' : '<option value="" selected disabled>项目不存在，请重新选择</option>';
  return `<div class="project-controls"><label>当前同步项目<select data-project-select>${unknown}${options}</select></label><button type="button" data-project-create>＋ 新增项目</button>${current ? '<button type="button" data-project-rename>修改项目名称</button>' : ''}</div><p>每个项目独立保存仓库、模式、同步历史与任务。切换只改变当前页面，其他项目的后台同步继续执行。</p>${editor ? editorForm(editor, current, pendingCreate, sending) : ''}${error ? `<p class="bad" role="alert">${esc(error)}</p>${pendingCreate ? '<button type="button" data-project-retry>查询 / 重试原新增请求</button>' : ''}` : ''}`;
}
function projectOption(project, selected) {
  const mode = { continuous: '同步开发过程', version: '按 tag 更新' }[project.mode] ?? '待配置';
  const label = project.error ? '配置异常' : mode;
  return `<option value="${esc(project.id)}" ${project.id === selected ? 'selected' : ''}>${esc(project.name)} · ${label}${project.busy ? ' · 任务处理中' : ''}</option>`;
}
function editorForm(editor, current, pendingCreate, sending) {
  const name = editor === 'rename' ? (current?.name ?? '') : (pendingCreate?.name ?? '');
  return `<form data-project-form><label>项目名称<input name="name" required maxlength="80" value="${esc(name)}" placeholder="例如：通用核心 / 定制产品"></label><div class="task-actions"><button type="submit" class="primary" ${sending ? 'disabled' : ''}>${editor === 'create' ? '创建项目，配置仓库 →' : '保存项目名称'}</button><button type="button" data-project-cancel>取消</button></div></form>`;
}
