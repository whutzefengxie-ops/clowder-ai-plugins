import { pageProjectId, projectUrl } from './project-scope.mjs';
import { roundPageSize, roundView } from './round-view.mjs';
import { esc } from './ui.mjs';
export function createRoundView(snapshot) {
  let data = null,
    error = '',
    offset = 0,
    filter = 'all',
    open = false,
    manual = false,
    positionPending = false,
    generation = 0;
  const limit = roundPageSize;
  function paint() {
    const target = document.querySelector('[data-round-slot]');
    if (!target) return;
    const listScroll = target.querySelector('.round-items')?.scrollTop ?? 0;
    const active = document.activeElement;
    const key = ['roundToggle', 'roundFilter', 'roundPage', 'roundReload'].find(
      (key) => active?.dataset?.[key] !== undefined,
    );
    const value = key && active.dataset[key];
    target.innerHTML = roundView(data, error, { open });
    const list = target.querySelector('.round-items');
    if (list) list.scrollTop = listScroll;
    if (key)
      [...target.querySelectorAll('button')]
        .find((e) => e.dataset[key] === value)
        ?.focus({ preventScroll: true });
  }
  function currentPageOffset() {
    if (filter !== 'all' || !data || !Number.isInteger(data.currentIndex) || data.currentIndex < 0) return null;
    return Math.floor(data.currentIndex / limit) * limit;
  }
  async function load() {
    const current = snapshot(),
      runId = current.state?.automation?.id,
      binding = current.config?.bindingId;
    if (!runId) {
      ++generation;
      data = null;
      error = '';
      return;
    }
    if (data?.runId !== runId) {
      offset = 0;
      filter = 'all';
      open = false;
      manual = false;
      positionPending = false;
    }
    const ticket = ++generation;
    let nextOffset = offset;
    if (positionPending && !manual) nextOffset = currentPageOffset() ?? offset;
    try {
      const response = await fetch(
        projectUrl(`/api/round?offset=${nextOffset}&limit=${limit}&status=${filter}`),
        {
          signal: AbortSignal.timeout(8000),
          headers: { 'X-Repo-Sync-Token': current.token },
        },
      );
      const result = await response.json();
      if (!response.ok) throw Error(result.message ?? '本轮清单读取失败');
      if (
        ticket !== generation ||
        snapshot().state?.automation?.id !== runId ||
        snapshot().config?.bindingId !== binding
      )
        return;
      if (result.round?.runId !== runId) throw Error('轮次已变化，请重新读取；未显示另一轮清单');
      data = { ...result.round, filter };
      offset = data.offset;
      error = '';
      if (positionPending && !manual) {
        const targetOffset = currentPageOffset();
        positionPending = false;
        if (targetOffset !== null && targetOffset !== offset) {
          offset = targetOffset;
          return load();
        }
      }
    } catch (e) {
      if (
        ticket !== generation ||
        snapshot().state?.automation?.id !== runId ||
        snapshot().config?.bindingId !== binding
      )
        return;
      error = e.message;
    }
    paint();
  }
  document.addEventListener('click', async (e) => {
    const button = e.target.closest(
      '[data-round-toggle], [data-round-filter], [data-round-page], [data-round-reload]',
    );
    if (!button) return;
    if (button.dataset.roundToggle !== undefined) {
      open = !open;
      if (open && !manual) positionPending = true;
    }
    if (button.dataset.roundFilter) {
      filter = button.dataset.roundFilter;
      offset = 0;
      manual = true;
    }
    if (button.dataset.roundPage) {
      offset = Math.max(0, offset + Number(button.dataset.roundPage) * limit);
      manual = true;
    }
    await load();
  });
  return {
    load,
    render: () =>
      snapshot().state?.automation
        ? `<section data-round-slot data-project="${esc(pageProjectId)}" aria-label="本轮同步进度">${roundView(data?.runId === snapshot().state.automation.id ? data : null, error, { open })}</section>`
        : '',
  };
}
