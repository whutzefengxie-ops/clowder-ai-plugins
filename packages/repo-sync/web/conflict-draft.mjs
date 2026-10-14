import { esc } from './ui.mjs';
import { conflictEditor } from './version.mjs';

const key = (snapshot) => `repo-sync-conflict:${snapshot.config.bindingId}:${snapshot.state.active.id}`;
export function saveConflict(snapshot, result) {
  if (result.deliveryId !== snapshot.state?.active?.id) return;
  try {
    sessionStorage.setItem(key(snapshot), JSON.stringify(result));
  } catch {}
}
export function restoreConflict(snapshot, content) {
  const delivery = snapshot.state?.active;
  const editor = content.querySelector('#conflict-editor');
  if (!editor || delivery?.error?.code !== 'CONTENT_CONFLICT') return;
  try {
    const result = JSON.parse(sessionStorage.getItem(key(snapshot)));
    if (result?.deliveryId === delivery.id && delivery.error.details.paths.includes(result.path))
      editor.innerHTML = conflictEditor(result, esc);
  } catch {}
}
