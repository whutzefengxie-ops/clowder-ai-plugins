import { attempts } from './attempts.mjs';
import { nextAction } from './action-policy.mjs';
import { actionBar } from './actionbar.mjs';
import { stagePresentation, currentStage } from './flow-stage.mjs';
import { restoreExpansion } from './expansion.mjs';

export function updateLiveWorkflow(content, snapshot, record, task, selected, key) {
  const nodes = content.querySelectorAll('[data-attempts-stage]');
  if (!nodes.length) return false;
  const delivery = record?.delivery ?? snapshot.state?.active;
  const historical = selected !== 'current' && selected !== snapshot.state?.active?.id;
  if (historical) return true;
  const opened = new Set([...content.querySelectorAll('[data-attempt][open]')].map((node) => node.dataset.attempt));
  for (const node of nodes)
    node.innerHTML = attempts(Number(node.dataset.attemptsStage), record, task, false, snapshot);
  for (const node of content.querySelectorAll('[data-attempt]')) if (opened.has(node.dataset.attempt)) node.open = true;
  const policy = nextAction({ ...snapshot, operation: task }, delivery);
  const current = currentStage(delivery, policy);
  const taskOwns = !delivery || task?.deliveryId === delivery.id || task?.deliveryIds?.includes(delivery.id);
  const failed = taskOwns && (task?.status === 'FAILED' || task?.persistence?.status === 'FAILED') ? policy.stage : 0;
  for (const node of content.querySelectorAll('[data-stage]')) {
    const state = stagePresentation(Number(node.dataset.stage), delivery, current, failed);
    node.dataset.stageState = state.state;
    const mark = node.querySelector(':scope > summary .stage-mark');
    if (mark) {
      mark.textContent = state.mark;
      mark.className = `stage-mark ${state.tone}`;
    }
    const caption = node.querySelector(':scope > summary [data-stage-caption]');
    if (caption) caption.textContent = state.caption;
  }
  const footer = content.querySelector('.next-action');
  if (footer && footer.dataset.policy !== JSON.stringify(policy)) {
    footer.outerHTML = actionBar(policy, false, snapshot);
    content.querySelector('.next-action').dataset.policy = JSON.stringify(policy);
  }
  const errorSlot = content.querySelector('#error-slot');
  content.querySelector(`[data-stage="${current}"] .stage-body`)?.append(...(errorSlot ? [errorSlot] : []));
  restoreExpansion(content, snapshot, selected, key, delivery);
  return true;
}
