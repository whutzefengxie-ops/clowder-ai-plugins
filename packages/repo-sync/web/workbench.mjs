import { automationBanner, preDeliveryFlow } from './automation-view.mjs';
import { firstUse } from './connections.mjs';
import { githubAuthForm } from './github-auth.mjs';
import { recordList } from './history.mjs';
import { sourceTargetForm } from './source-target.mjs';
import { button, esc, sha, title, when } from './ui.mjs';
import { tagSelector } from './version.mjs';
import { workflow } from './workflow.mjs';

export function workbench(snapshot, records, tags, mobileDetail) {
  const { config, state } = snapshot;
  if (!config) return firstUse();
  if (!state)
    return `<section class="card task"><h2>先确认两侧已有基线</h2><p>连接已从私有配置载入，登记外部已同步版本与内部当前版本即可开始。</p><button type="button" data-view="configuration" class="primary">配置同步基线 →</button></section>`;
  const historical = records.selected !== 'current' && records.selected !== state.active?.id;
  const delivery = records.detail?.delivery ?? (historical ? null : state.active);
  const summary = repositorySummary(config, state);
  const detail = records.error
    ? `<p class="record-gap bad" role="alert">× ${esc(records.error)}<br>记录读取失败，原选择保留，不用其他记录替代。</p><button type="button" data-reload-record>重新读取记录</button>`
    : delivery
      ? workflow(
          snapshot,
          records.detail ?? {
            delivery,
            tasks: [],
            configurations: [],
            issues: [],
            events: [],
            missingTasks: [],
            taskPage: {},
          },
          historical,
        )
      : historical
        ? '<p role="status">正在读取所选记录…</p>'
        : target(snapshot, tags);
  return `${summary}${automationBanner(snapshot)}<p id="current-activity" role="status"></p><div class="journey-layout ${mobileDetail ? 'mobile-detail' : 'mobile-list'}">${recordList(records, state.active)}<section class="record-detail" aria-label="本笔同步详情"><button type="button" class="mobile-back" data-record-back>返回同步记录</button>${detail}</section></div>`;
}
function target(snapshot, tags) {
  const { state, config } = snapshot;
  const task = snapshot.operation;
  const pending =
    task &&
    (['RUNNING', 'CANCELLING', 'STOP_UNCONFIRMED'].includes(task.status) || task.persistence?.status === 'FAILED');
  if (snapshot.state.automation && snapshot.state.automation.status !== 'COMPLETE') return preDeliveryFlow(snapshot);
  if (pending)
    return '<section class="card"><h2>原操作需要处理</h2><div id="operation"></div><div id="error-slot"></div></section>';
  const accepted =
    state.deliveryCount > 0
      ? `<h3>当前已接收版本</h3><p>${esc(state.accepted.tag ?? '已接收提交')} · 外部 ${sha(state.accepted.upstream)} → 内部 ${sha(state.accepted.internal)}</p>`
      : '';
  if (config.mode === 'version' && !state.queue.length)
    return `${accepted}${tagSelector(tags, esc, sha)}<div id="operation"></div><div id="error-slot"></div>`;
  const next = state.queue[0];
  const heading = targetHeading(state, config, next);
  return `${accepted}${config.mode === 'continuous' ? `${githubAuthForm(snapshot, { open: !snapshot.sourceAuthentication?.available })}${sourceTargetForm(state, tags, esc, sha, config.prTransport !== 'manual')}` : ''}<section class="card task"><span class="badge">1 · 确认同步范围</span><h2>${heading}</h2><p>${next ? '按已核对的范围发起本次同步，内部 main 等待正常平台合入。' : '先读取 GitHub PR、Issue 与实际 main 提交关系。按接受顺序逐笔处理。'}</p>${next ? `<p>外部 ${sha(state.accepted.upstream)} → ${sha(next.target)}<br>内部基线 ${sha(state.accepted.internal)}</p>${startButton(config, next)}` : ''}<div id="operation" tabindex="-1"></div><div id="error-slot"></div></section>`;
}

function repositorySummary(config, state) {
  const summary = `<section class="repository-summary"><div><b>${esc(config.mode === 'version' ? '按 tag 更新 · 保留内部差异' : '按 PR 同步开发过程')}</b><p>已接受：${esc(state.accepted.tag ?? '已登记基线')}<br>外部 ${sha(state.accepted.upstream)} → 内部 ${sha(state.accepted.internal)}</p></div><div><b>${state.scannedAt ? (state.accepted.upstream === state.latest ? '与最近一次扫描一致' : '有未接收的扫描目标') : '尚未检查更新'}</b><p>扫描时间 ${when(state.scannedAt)}<br>扫描目标 ${sha(state.latest)} · ${state.queue.length} 笔待处理</p></div></section>`;
  return summary;
}

function targetHeading(state, config, next) {
  if (next)
    return config.mode === 'version'
      ? `已选择 ${esc(next.source.tag)}`
      : `下一笔${next.source.kind === 'commit' ? '' : '上游 '}${esc(title(next))}`;
  return state.deliveryCount ? '本轮交付已完成' : '读取上游交付清单';
}

function startButton(config, next) {
  const label =
    config.mode === 'version'
      ? `开始更新至 ${next.source.tag} →`
      : next.source.kind === 'commit'
        ? `同步${title(next)} →`
        : `同步上游 PR #${next.source.number} →`;
  return button(config.prTransport === 'manual' ? 'start' : 'synchronize', label);
}
