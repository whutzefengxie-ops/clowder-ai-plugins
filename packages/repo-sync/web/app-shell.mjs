let configurationActionObserver;

export function updateShell(snapshot, view) {
  const name = snapshot.workspace?.projects?.find((project) => project.id === snapshot.workspace?.projectId)?.name ?? '当前项目';
  document.body.dataset.view = view;
  document.querySelector('.heading h1').textContent = view === 'configuration' ? '仓库设置' : '同步工作台';
  document.getElementById('page-context').textContent = name;
  document.getElementById('page-description').textContent = view === 'configuration'
    ? '配置这个项目的仓库、认证和同步起点。各项目的设置与进度独立保存。'
    : '查看本笔提交、Issue 和流程进展；操作区会告诉你下一步需要做什么。';
  for (const button of document.querySelectorAll('.shell-nav [data-view]'))
    button.setAttribute('aria-current', button.dataset.view === view ? 'page' : 'false');
  document.getElementById('configuration-actions')?.remove();
  configurationActionObserver?.disconnect();
  configurationActionObserver = null;
  if (view === 'configuration') {
    const target = [...document.querySelectorAll('#content button.primary')].find((button) => button.getClientRects().length);
    if (target) {
      target.setAttribute('data-config-primary', '');
      target.classList.add('configuration-primary-proxy');
      target.setAttribute('aria-hidden', 'true');
      target.tabIndex = -1;
      const panel = document.createElement('footer');
      panel.id = 'configuration-actions';
      panel.className = 'next-action';
      panel.setAttribute('aria-label', '当前操作区');
      const heading = document.createElement('h2'); heading.textContent = '当前需要你操作';
      const description = document.createElement('p'); description.textContent = '填写当前步骤的必要信息后，在这里继续。原项目的同步进度保留。';
      const button = document.createElement('button'); button.type = 'button'; button.className = 'primary';
      button.textContent = target.textContent; button.dataset.configAction = '';
      syncActionState(button, target);
      panel.append(heading, description, button);
      document.getElementById('content').append(panel);
      configurationActionObserver = new MutationObserver(() => syncActionState(button, target));
      configurationActionObserver.observe(target, { attributes: true, attributeFilter: ['disabled'] });
    }
  }
}

function syncActionState(action, target) {
  if (action.disabled !== target.disabled) action.disabled = target.disabled;
  if (target.disabled) action.setAttribute('aria-disabled', 'true');
  else action.removeAttribute('aria-disabled');
}

document.addEventListener('click', (event) => {
  if (!event.target.closest('[data-config-action]')) return;
  const target = document.querySelector('[data-config-primary]');
  if (!target || target.disabled) return;
  if (target?.form) target.form.requestSubmit(target);
  else target?.click();
});
