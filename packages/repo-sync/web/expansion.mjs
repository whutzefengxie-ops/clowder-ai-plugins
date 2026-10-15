import { nextAction } from './action-policy.mjs';
export function restoreExpansion(content, snapshot, selected, key) {
  try {
    const expanded = JSON.parse(sessionStorage.getItem(key));
    if (expanded)
      for (const element of content.querySelectorAll('[data-stage]'))
        if (
          Array.isArray(expanded)
            ? expanded.includes(element.dataset.stage)
            : Object.hasOwn(expanded, element.dataset.stage)
        )
          element.open = Array.isArray(expanded) || expanded[element.dataset.stage];
  } catch {}
  const currentStage = content.querySelector(`[data-stage="${nextAction(snapshot, snapshot.state?.active).stage}"]`);
  if (selected === 'current' || selected === snapshot.state?.active?.id) currentStage?.setAttribute('open', '');
}
