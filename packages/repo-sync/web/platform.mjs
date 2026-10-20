import { authenticationForm } from './issue-auth.mjs';
import { apiFields } from './issue-settings.mjs';
import { isPlatformMode, platformLabel, suggestedMode } from './platform-kind.mjs';
export function serviceLabel(snapshot) {
  if (!snapshot.config) return '正式服务 · 等待仓库配置';
  const names = {
    git: 'Git 自动创建',
    gitlab: '平台 API 自动创建',
    github: 'GitHub API 自动创建',
    command: '平台适配器创建',
    manual: '手工创建',
  };
  return `正式服务 · PR ${names[snapshot.platform?.transport] ?? '方式待确认'}`;
}

export function platformSettings(snapshot, esc) {
  if (!snapshot.config || !snapshot.connection) return '';
  const mode = suggestedMode(snapshot.config, snapshot.platform.transport);
  return `<section class="card" id="platform-settings"><h3>PR 自动创建设置</h3><p>候选检查与推送成功后自动取得 PR 地址并进入审核。已有仓库可以在这里启用，不重新初始化台账。创建意图或 PR 已冻结时禁止更换配置。</p><form data-form="configure-pr"><input type="hidden" name="expectedRevision" value="${esc(snapshot.connection.revision)}"><label>PR 创建方式<select name="prMode" aria-label="PR 创建方式"><option value="auto" ${mode === 'auto' ? 'selected' : ''}>自动识别（推荐 · GitLab v4 / GitHub）</option><option value="gitlab" ${mode === 'gitlab' ? 'selected' : ''}>GitLab v4 兼容 API 自动创建 PR</option><option value="github" ${mode === 'github' ? 'selected' : ''}>GitHub / GitHub Enterprise API 自动创建 PR</option><option value="git" ${mode === 'git' ? 'selected' : ''}>Git 推送时自动创建 PR</option>${mode === 'command' ? '<option value="command" selected>已有私有命令适配器自动创建</option>' : ''}<option value="manual" ${mode === 'manual' ? 'selected' : ''}>明确使用手工创建</option></select></label><label>用于确认 PR 地址的内部网页仓库<input name="internalWebUrl" type="url" required value="${esc(snapshot.platform.repositoryUrl ?? '')}" placeholder="https://内部平台/团队/仓库"></label><details class="tech"><summary>技术详情</summary><div class="tech-copy">Git 路径使用平台 push-options 扩展；平台 API 路径按 GitLab v4 或 GitHub REST 创建并回读。GitHub 企业版请在高级设置填写 https://内网域名/api/v3。没有返回可确认地址就暂停，不自动改为手工创建。</div></details>${apiFields({ ...snapshot.config, issueAutomation: { mode: 'manual' }, prTransport: mode }, esc)}<button type="submit">保存 PR 创建设置</button></form>${isPlatformMode(mode) ? authenticationForm(snapshot.config) : ''}</section>`;
}
export function prCreationFields(config) {
  const selected = suggestedMode(config, config?.prTransport ?? 'auto');
  const options = [
    ['auto', '自动识别 GitLab v4 / GitHub API'],
    ['gitlab', 'GitLab v4 兼容 API 自动创建 PR'],
    ['github', 'GitHub / GitHub Enterprise API 自动创建 PR'],
    ['manual', '明确使用手工创建'],
  ];
  if (selected === 'command') options.push(['command', '已有私有平台适配器自动创建']);
  if (selected === 'git') options.push(['git', '旧配置：Git 推送创建 PR']);
  return `<label>PR 创建方式<select name="prMode" aria-label="PR 创建方式">${options.map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join('')}</select></label><p>自动创建使用内部平台 API；自动识别按内部仓库地址选择 ${platformLabel('gitlab')} 或 ${platformLabel('github')}。Git 仍负责代码传输；内部链接用于核对 PR 归属。</p>`;
}
export function prCreationSummary(config) {
  if (!config) return '<p data-pr-summary>保存后按上方选择的方式创建 PR；审核与合入仍在内部平台完成。</p>';
  const mode = config?.prTransport ?? 'git';
  const names = {
    auto: '按内部仓库地址自动识别 GitLab v4 或 GitHub，并调用平台 API 创建 PR',
    gitlab: 'Git 推送候选后通过平台 API 自动创建 MR',
    github: 'Git 推送候选后通过 GitHub API 自动创建 PR',
    git: '候选推送同时触发 Git PR 创建',
    command: '私有平台适配器自动创建',
    manual: '明确使用手工创建',
  };
  return `<p data-pr-summary><b>当前已保存的 PR 方式：${names[mode]}。</b>保存修改后按上方选择生效；审核合入仍在内部平台完成。</p>`;
}
