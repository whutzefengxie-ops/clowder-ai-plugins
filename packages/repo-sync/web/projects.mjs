import { pageProjectId } from './project-scope.mjs';
import { projectView } from './project-view.mjs';

export function createProjectNavigation(snapshot, saveDraft) {
  const panel = document.getElementById('projects');
  let workspace,
    token,
    editor = null,
    pendingCreate = null,
    sending = false,
    error = '';
  async function load() {
    const response = await fetch('/api/projects', {
      signal: AbortSignal.timeout(8000),
    });
    if (response.status === 404) return;
    const result = await response.json();
    if (!response.ok) {
      error = result.message ?? '项目列表无法读取，请保留原文件';
      panel.hidden = false;
      render();
      return;
    }
    workspace = result.workspace;
    token = result.token;
    render();
  }
  function render() {
    panel.hidden = false;
    panel.innerHTML = projectView({ workspace, editor, pendingCreate, sending, error }, pageProjectId);
  }
  function go(id, newlyCreated = false) {
    saveDraft();
    const url = new URL(location.href);
    url.searchParams.set('project', id);
    url.searchParams.delete('record');
    if (newlyCreated) url.searchParams.set('view', 'configuration');
    location.assign(url.href);
  }
  async function send(input) {
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Repo-Sync-Token': snapshot()?.token ?? token,
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(8000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(`${result.code}：${result.message}`);
    return result;
  }
  async function submit(input) {
    if (sending) return;
    sending = true;
    error = '';
    render();
    try {
      const result = await send(input);
      workspace = result.workspace;
      if (input.action === 'create') {
        pendingCreate = null;
        go(result.project.id, true);
      } else {
        editor = null;
        render();
      }
    } catch (failure) {
      error = `${failure.message}；已有项目和配置保留。新增回执不明时只重试同一请求。`;
    } finally {
      sending = false;
      render();
    }
  }
  panel.addEventListener('change', (event) => {
    if (event.target.matches('[data-project-select]')) go(event.target.value);
  });
  panel.addEventListener('click', (event) => {
    if (event.target.closest('[data-project-create]')) {
      editor = 'create';
      error = '';
      render();
    }
    if (event.target.closest('[data-project-rename]')) {
      editor = 'rename';
      error = '';
      render();
    }
    if (event.target.closest('[data-project-cancel]')) {
      editor = null;
      render();
    }
    if (event.target.closest('[data-project-retry]') && pendingCreate) void submit(pendingCreate);
  });
  panel.addEventListener('submit', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const name = new FormData(event.target).get('name');
    const input =
      editor === 'create'
        ? (pendingCreate ?? {
            action: 'create',
            name,
            expectedRevision: workspace.revision,
            requestId: crypto.randomUUID().replaceAll('-', ''),
          })
        : {
            action: 'rename',
            id: pageProjectId,
            name,
            expectedRevision: workspace.revision,
          };
    if (input.action === 'create') pendingCreate = input;
    void submit(input);
  });
  return {
    load,
    update: (value) => {
      if (value) {
        workspace = value;
        if (!editor) render();
      }
    },
  };
}
