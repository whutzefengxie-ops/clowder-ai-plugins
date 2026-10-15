import { nextAction } from './action-policy.mjs';
export function restoreExpansion(content, snapshot, selected, key) {
  try {
    const cursor = `${snapshot.state?.active?.id}:${nextAction(snapshot, snapshot.state?.active).stage}`;
    const cursorKey = `${key}:cursor`;
    if (
      (selected === 'current' || selected === snapshot.state?.active?.id) &&
      sessionStorage.getItem(cursorKey) !== cursor
    ) {
      sessionStorage.removeItem(key);
      sessionStorage.setItem(cursorKey, cursor);
    }
    const expanded = JSON.parse(sessionStorage.getItem(key));
    if (expanded)
      for (const element of content.querySelectorAll('[data-stage]'))
        element.open = expanded.includes(element.dataset.stage);
  } catch {}
  const currentStage = content.querySelector(`[data-stage="${nextAction(snapshot, snapshot.state?.active).stage}"]`);
  if (selected === 'current' || selected === snapshot.state?.active?.id) currentStage?.setAttribute('open', '');
}
