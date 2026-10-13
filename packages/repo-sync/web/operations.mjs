import { captureDraft, restoreDraft } from './connections.mjs';
import { renderTask } from './operation-view.mjs';

const longActions = new Set(['heads', 'adopt', 'discover', 'prepare', 'recover', 'tags', 'select-tag']);
const active = new Set(['RUNNING', 'CANCELLING', 'STOP_UNCONFIRMED']);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
export function createOperations({ snapshot, refresh, completed, errorPanel }) {
  const panel = document.getElementById('operation');
  let busy = false;
  let watching;
  let current;
  function lock() {
    for (const element of document.querySelectorAll('button[data-action], form button, input, textarea, select'))
      element.disabled = busy;
  }
  function show(task) {
    current = task;
    panel.innerHTML = renderTask(task);
  }
  async function request(url, input) {
    const response = await fetch(url, {
      method: input ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', 'X-Repo-Sync-Token': snapshot().token },
      ...(input ? { body: JSON.stringify(input) } : {}),
      signal: AbortSignal.timeout(8000),
    });
    const value = await response.json();
    if (!response.ok) {
      const error = new Error(`${value.code}：${value.message ?? '请求未完成'}`);
      error.code = value.code;
      throw error;
    }
    return value;
  }
  async function wait(id) {
    while (true) {
      try {
        const task = (await request(`/api/tasks/${id}`)).operation;
        show(task);
        errorPanel.hidden = true;
        if (!active.has(task.status)) return task;
        if (task.status === 'STOP_UNCONFIRMED') return task;
      } catch (error) {
        await disconnected(error, id);
      }
      await sleep(500);
    }
  }
  async function disconnected(error, id) {
    if (error.code === 'TOKEN_REJECTED') {
      try {
        await refresh();
      } catch {}
    }
    errorPanel.textContent = `暂时无法读取任务状态，正在查询原任务 ${id}；不会重复提交。${error.code ?? 'CONNECTION_LOST'}`;
    errorPanel.hidden = false;
  }
  function observe(task) {
    if (watching) {
      lock();
      return;
    }
    busy = active.has(task?.status);
    show(task);
    lock();
    if (task && ['RUNNING', 'CANCELLING'].includes(task.status)) {
      watching = task.id;
      void wait(task.id)
        .then(async (done) => {
          watching = null;
          busy = active.has(done.status);
          await refresh();
          if (done.status === 'SUCCEEDED') completed(done.action, { result: done.result });
          lock();
        })
        .catch((error) => {
          errorPanel.textContent = error.message;
          errorPanel.hidden = false;
        });
    }
  }
  async function runLong(input) {
    const requestId = crypto.randomUUID().replaceAll('-', '');
    watching = requestId;
    let value;
    try {
      value = await request('/api/tasks', {
        ...input,
        requestId,
        expectedBinding: snapshot().config.bindingId,
        expectedRevision: snapshot().connection?.revision,
      });
    } catch (error) {
      if (error.code) throw error;
      errorPanel.textContent = '请求回执暂未取得，正在查询原任务；请勿重复发起。';
      errorPanel.hidden = false;
    }
    if (value) show(value.operation);
    return wait(requestId);
  }
  function checkOutcome(operation) {
    if (operation.status !== 'SUCCEEDED')
      throw new Error(`${operation.error?.code ?? operation.status}：${operation.error?.message ?? '当前操作未完成'}`);
  }
  async function action(input) {
    if (busy) return;
    busy = true;
    errorPanel.hidden = true;
    const drafts = captureDraft();
    lock();
    let operation;
    try {
      let value;
      if (longActions.has(input.action)) {
        operation = await runLong(input);
        checkOutcome(operation);
        value = { result: operation.result };
      } else value = await request('/api/action', input);
      watching = null;
      busy = false;
      await refresh();
      if (input.action === 'heads') restoreDraft(drafts);
      return value;
    } catch (error) {
      watching = null;
      busy = operation?.status === 'STOP_UNCONFIRMED';
      try {
        await refresh();
      } catch {
        /* Preserve the visible form if the server is unavailable. */
      }
      restoreDraft(drafts);
      errorPanel.textContent = error.message;
      errorPanel.hidden = false;
    } finally {
      lock();
    }
  }
  document.addEventListener('click', async (event) => {
    if (!event.target.closest('[data-cancel-operation]') || !current) return;
    try {
      show((await request(`/api/tasks/${current.id}/cancel`, {})).operation);
    } catch (error) {
      errorPanel.textContent = error.message;
      errorPanel.hidden = false;
    }
  });
  return { action, observe, lock };
}
