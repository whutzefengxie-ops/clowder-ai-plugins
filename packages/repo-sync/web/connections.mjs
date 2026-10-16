import { updateIssueFields } from './issue-auth.mjs';
export { setupConfiguration as configuration } from './setup-view.mjs';
export function firstUse() {
  return '<section class="card task"><h2>开始同步你的项目</h2><p>连接两侧仓库、核验已有起点，再确认启用。每个项目独立保存模式和历史。</p><button type="button" data-view="configuration" class="primary">配置真实仓库 →</button></section>';
}
export function repositoryInput(fields) {
  const input = {
    action: 'configure-repositories',
    ...fields,
    expectedRevision: fields.expectedRevision || null,
    internalWebUrl: fields.internalWebUrl?.trim() ?? '',
    ...(fields.mode === undefined ? {} : { commitClosureVerified: fields.commitClosureVerified === 'on' }),
  };
  for (const key of ['internalPaths', 'mergePaths'])
    input[key] =
      key === 'internalPaths' || fields.mergePaths
        ? (fields[key] ?? '')
            .split(/\r?\n/)
            .map((value) => value.trim())
            .filter(Boolean)
        : [];
  for (const key of ['sourceUrl', 'internalUrl', 'sourceBranch', 'targetBranch']) input[key] = input[key].trim();
  delete input.githubToken;
  delete input.issueToken;
  if (fields.commitStrategy) input.commitStrategy = fields.commitStrategy;
  if (fields.commitName !== undefined)
    input.receivingIdentity = { name: fields.commitName.trim(), email: fields.commitEmail.trim() };
  delete input.commitName;
  delete input.commitEmail;
  return input;
}
export function captureDraft() {
  return [...document.querySelectorAll('form[data-form]')]
    .filter((form) => form.dataset.form !== 'configure-continuation')
    .map((form) => ({
      kind: form.dataset.form,
      open: form.closest('details')?.open ?? false,
      openSummary: form.closest('details')?.querySelector(':scope > summary')?.textContent ?? '',
      reference: form.elements.namedItem('previousUrl')?.value ?? '',
      source: form.dataset.source ?? '',
      path: form.elements.namedItem('path')?.value ?? '',
      deliveryId: form.elements.namedItem('deliveryId')?.value ?? '',
      runId: form.elements.namedItem('runId')?.value ?? '',
      values: [...form.elements]
        .filter(
          (element) =>
            element.name &&
            element.type !== 'password' &&
            element.name !== 'issueToken' &&
            element.name !== 'confirmed' &&
            !['expectedRevision', 'previousUrl', 'deliveryId', 'runId'].includes(element.name),
        )
        .map((element) => ({
          name: element.name,
          value: element.value,
          checked: element.checked,
        })),
    }));
}
export function restoreDraft(drafts) {
  for (const draft of drafts) {
    const form = [...document.querySelectorAll('form[data-form]')].find(
      (item) =>
        item.dataset.form === draft.kind &&
        (item.dataset.source ?? '') === (draft.source ?? '') &&
        (item.elements.namedItem('path')?.value ?? '') === (draft.path ?? '') &&
        (item.elements.namedItem('previousUrl')?.value ?? '') === (draft.reference ?? '') &&
        (item.elements.namedItem('deliveryId')?.value ?? '') === (draft.deliveryId ?? '') &&
        (item.elements.namedItem('runId')?.value ?? '') === (draft.runId ?? ''),
    );
    if (!form) continue;
    restoreForm(form, draft);
  }
}
function restoreForm(form, draft) {
  for (const saved of draft.values) {
    const element = form.elements.namedItem(saved.name);
    if (element && element.type !== 'password' && saved.name !== 'issueToken') {
      element.value = saved.value;
      if (element.type === 'checkbox') element.checked = saved.checked;
    }
  }
  const version = form.elements.namedItem('mode')?.value === 'version';
  const closure = form.querySelector('[data-closure]');
  if (closure) closure.hidden = version;
  updateIssueFields(form);
  const parent = form.closest('details');
  if (
    draft.kind !== 'configure-repositories' &&
    draft.open &&
    parent?.querySelector(':scope > summary')?.textContent === draft.openSummary
  )
    parent.open = true;
}
