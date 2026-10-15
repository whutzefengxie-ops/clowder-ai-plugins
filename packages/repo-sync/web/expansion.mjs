import { nextAction } from './action-policy.mjs';
export function rememberExpansion(key, states) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key)) ?? {};
    const manual = Array.isArray(saved) ? Object.fromEntries(saved.map((id) => [id, true])) : saved;
    sessionStorage.setItem(key, JSON.stringify({ ...manual, ...states }));
  } catch {}
}
export function restoreExpansion(content, snapshot, selected, key, delivery = snapshot.state?.active) {
  const historical = selected !== 'current' && selected !== snapshot.state?.active?.id;
  const current = nextAction(snapshot, delivery, historical).stage;
  let expanded;
  try {
    expanded = JSON.parse(sessionStorage.getItem(key));
  } catch {}
  for (const element of content.querySelectorAll('[data-stage]')) {
    const id = element.dataset.stage;
    const manual = Array.isArray(expanded) ? expanded.includes(id) : expanded?.[id];
    if (manual !== undefined) element.open = Boolean(manual);
    else if (!historical) element.open = Number(id) === current || element.dataset.stageState === 'failed';
    if (!historical && (Number(id) === current || element.dataset.stageState === 'failed')) element.open = true;
  }
}
