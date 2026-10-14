import { esc } from './ui.mjs';

function control(p, primary) {
  const tone = primary ? 'primary' : '';
  const label = esc(p.label);
  if (p.href) return `<a class="button ${tone}" href="${esc(p.href)}" target="_blank" rel="noopener">${label}</a>`;
  if (p.anchor) return `<a class="button ${tone}" href="#${esc(p.anchor)}" data-reveal="${esc(p.anchor)}">${label}</a>`;
  if (!p.action && !p.special) return '';
  const attribute = p.action ? `data-action="${esc(p.action)}"` : `data-${p.special}`;
  return `<button type="button" class="${tone}" ${attribute}>${label}</button>`;
}
export function actionBar(policy, historical) {
  if (historical) return '';
  return `<footer class="next-action"><p role="status">${esc(policy.text)}</p><div class="task-actions">${control(policy, true)}${policy.secondary ? control(policy.secondary, false) : ''}</div></footer>`;
}
