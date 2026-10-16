export function rememberExpansion(key, states) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key)) ?? {};
    const manual = Array.isArray(saved) ? Object.fromEntries(saved.map((id) => [id, true])) : saved;
    sessionStorage.setItem(key, JSON.stringify({ ...manual, ...states }));
  } catch {}
}
export function setAllExpansion(content, key, open) {
  const stages = [...content.querySelectorAll('[data-stage]')];
  rememberExpansion(key, Object.fromEntries(stages.map((stage) => [stage.dataset.stage, open])));
  for (const stage of stages) stage.open = open;
}
export function restoreExpansion(content, _snapshot, _selected, key) {
  let expanded;
  try {
    expanded = JSON.parse(sessionStorage.getItem(key));
  } catch {}
  for (const element of content.querySelectorAll('[data-stage]')) {
    const id = element.dataset.stage;
    const manual = Array.isArray(expanded) ? expanded.includes(id) : expanded?.[id];
    element.open = Boolean(manual);
  }
  for (const element of content.querySelectorAll('[data-persist-details]'))
    if (expanded?.[`details:${element.dataset.persistDetails}`] !== undefined)
      element.open = expanded[`details:${element.dataset.persistDetails}`] === true;
}
export function initializeExpansion(getKey) {
  document.addEventListener('click', (event) => {
    const summary = event.target.closest('[data-stage] > summary, [data-persist-details] > summary');
    if (!summary) return;
    const detail = summary.parentElement;
    const id = detail.dataset.stage ?? `details:${detail.dataset.persistDetails}`;
    rememberExpansion(getKey(), { [id]: !detail.open });
  });
}
