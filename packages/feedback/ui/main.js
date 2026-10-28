import { bridge, call, copyImage, el, normalizePicture } from './bridge.js';

const app = document.getElementById('app');
const state = { stage: 'edit', report: { title: '', body: '', attachments: [] }, targets: [], targetId: '', clients: [], clientId: '', logs: false,
  consent: false, analysisConsent: false, busy: false, error: '', dirty: true, automatic: false };
const button = (label, action, style = 'secondary', disabled = false) => el('button', { type: 'button', text: label, className: style, disabled: disabled || state.busy, onClick: () => run(action) });
const note = (text, className = 'hint') => el('p', { text, className });
function input(label, field, multiline = false, copy = false) {
  const control = el(multiline ? 'textarea' : 'input', { id: `feedback-${field}`, ...(multiline ? {} : { type: 'text' }), value: state.report[field], maxLength: field === 'title' ? 200 : 100000,
    disabled: state.busy || locked(), onInput: event => { state.report[field] = event.target.value; invalidate(); } });
  return el('div', { className: 'field' }, [el('div', { className: 'label' }, [el('label', { htmlFor: `feedback-${field}`, text: label }),
    ...(copy ? [button(field === 'title' ? '复制标题' : '复制报告正文', async () => { if (state.dirty) await saveReview(); await bridge('clipboard.text', state.report[field]); state.error = '已复制'; }, 'text')] : [])]), control]);
}
function invalidate() {
  state.dirty = true; state.consent = false; state.analysisConsent = false; state.automatic = false;
  document.querySelectorAll('[data-consent]').forEach(node => { node.checked = false; });
  document.querySelectorAll('[data-publish]').forEach(node => { node.disabled = true; node.setAttribute('aria-disabled', 'true'); });
}
function locked() { return ['writing', 'unknown', 'published', 'upload_failed'].includes(state.journal?.state); }
function issueMayExist() { return ['writing', 'unknown'].includes(state.journal?.state); }
function check(label, key) {
  return el('label', { className: 'check' }, [el('input', { type: 'checkbox', checked: state[key], disabled: state.busy, 'data-consent': key,
    onChange: event => { state[key] = event.target.checked; render(); } }), el('span', { text: label })]);
}
function pictureCards() {
  return el('div', { className: 'pictures' }, state.report.attachments.map((picture, index) => el('div', { className: 'picture' }, [
    el('img', { src: `data:${picture.mime};base64,${picture.base64}`, alt: `截图 ${index + 1}` }),
    el('div', {}, [button('复制图片', async () => { await copyImage(picture); state.error = '图片已复制，可粘贴到 Issue 页面'; }, 'text'),
      el('a', { text: '下载发送副本', href: `data:${picture.mime};base64,${picture.base64}`, download: picture.name, title: '已去除元数据的 PNG；这是自动提交的实际图片' }),
      ...(picture.original ? [el('a', { text: '下载原图', href: `data:${picture.original.mime};base64,${picture.original.base64}`, download: picture.original.name, title: '原图可能包含隐私元数据，自动提交不会上传原图' })] : []),
      ...(!locked() ? [button('移除', async () => { state.report.attachments.splice(index, 1); invalidate(); }, 'text')] : [])]),
  ])));
}
async function addFiles(files) {
  for (const file of files) {
    if (state.report.attachments.length >= 4 || file.size > 4000000 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('最多 4 张 PNG/JPEG/WebP，单张不超过 4 MB');
    state.report.attachments.push(await normalizePicture(file, state.report.attachments.length));
  }
  invalidate();
}
async function saveReview() {
  const saved = await call({ op: 'save', targetId: state.targetId, revision: state.revision, report: state.report });
  Object.assign(state, saved, { report: saved.journal.report, dirty: false, consent: false, stage: 'review' });
  state.automatic = false;
  try {
    const preflight = await call({ op: 'preflight', digest: state.journal.digest });
    state.preflight = preflight;
    state.automatic = !state.report.attachments.length || preflight.attachments;
    if (!state.automatic) state.error = '自动附件通路未配置。可复制图片或下载原图，然后手动创建 Issue。';
  } catch (error) { state.error = error.message + '。手动创建仍可使用。'; }
}
async function prepareAnalysis() {
  // Persist the form first so a failed/cancelled client cannot lose the draft.
  await saveReview(); state.error = '';
  const prepared = await call({ op: 'prepare-analysis', report: state.report, logs: state.logs });
  Object.assign(state, prepared, { stage: 'scope', analysisConsent: false });
  if (!state.clients.some(c => c.id === state.clientId)) state.clientId = state.clients[0]?.id ?? '';
}
async function analyze() {
  state.stage = 'analyzing'; render();
  try {
    const result = await call({ op: 'analyze', clientId: state.clientId, hash: state.hash, confirmed: state.analysisConsent });
    state.report.body = result.body; state.dirty = true;
    await saveReview();
  } catch (error) { state.stage = 'scope'; throw error; }
}
async function submit() {
  if (!state.consent || state.dirty) throw new Error('请先更新报告，并检查完整内容和图片');
  state.stage = 'submitting'; render();
  try {
    if (state.journal.state === 'draft') Object.assign(state, await call({ op: 'approve', digest: state.journal.digest, confirmed: true }));
    Object.assign(state, await call({ op: 'submit', digest: state.journal.digest }));
    state.stage = state.journal.state === 'published' ? 'submitted' : 'review';
  } catch (error) { state.stage = 'review'; throw error; }
}
async function run(action) {
  if (state.busy) return;
  state.busy = true; state.error = ''; render();
  try { await action(); } catch (error) { state.error = error.message || '操作未完成，草稿已保留'; }
  finally { state.busy = false; render(); }
}
function render() {
  const stageIndex = state.stage === 'edit' ? 0 : ['scope', 'analyzing'].includes(state.stage) ? 1 : ['review', 'submitting'].includes(state.stage) ? 2 : 3;
  const header = el('header', {}, [el('h1', { text: '感谢你的反馈，一起共建项目' }), note('提供更详细的分析报告，帮助我们更快地定位和解决问题。'),
    el('nav', { 'aria-label': '反馈流程' }, ['填写问题', '分析与脱敏', '检查与提交', '完成'].map((text, index) => el('span', { text: `${index + 1}  ${text}`, className: index <= stageIndex ? 'current' : '', 'aria-current': index === stageIndex ? 'step' : 'false' })))]);
  const content = el('section', { className: 'content' }); const footer = el('footer');
  if (state.stage === 'edit') {
    content.append(input('问题标题', 'title'), input('问题描述', 'body', true), note('请描述发生前的操作、实际现象与预期结果，避免填写令牌、账号、内部地址和业务数据。'));
    const select = el('select', { value: state.targetId, disabled: state.busy, onChange: event => { state.targetId = event.target.value; invalidate(); render(); } },
      state.targets.map(t => el('option', { value: t.id, text: `${t.label} · ${t.visibility === 'public' ? '公开' : t.visibility === 'private' ? '私有' : '可见性未知'}` })));
    select.value = state.targetId;
    content.append(el('label', { className: 'field' }, [el('span', { className: 'label', text: '反馈目标' }), select]),
      el('label', { className: 'secondary', text: '＋ 添加截图' }, [el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', multiple: true, hidden: true, disabled: state.busy, onChange: e => run(() => addFiles(e.target.files)) })]),
      pictureCards(), note('图片不交给模型。自动提交使用已重编码并去除元数据的 PNG 发送副本，仍需自行遮盖敏感像素。原图仅供本地下载，可能含隐私元数据。'), check('增加最近 15 分钟的错误摘要（在本地先脱敏）', 'logs'));
    footer.append(button('直接提交', saveReview), button('分析并上传 · 推荐', prepareAnalysis, 'primary', !state.clients.length), note(state.clients.length ? '先检查分析范围，再检查报告并确认上传' : '安全诊断 Client 暂不可用，仍可直接反馈'));
  } else if (['scope', 'analyzing'].includes(state.stage)) {
    content.append(el('div', { className: 'notice', text: '本地 Agent Client 可能连接云端模型。以下是将交给模型的完整脱敏材料；不包含截图、完整配置或会话数据库。' }));
    const select = el('select', { disabled: state.busy, onChange: e => { state.clientId = e.target.value; state.analysisConsent = false; render(); } },
      state.clients.map(c => el('option', { value: c.id, text: `${c.label} · ${c.provider} · ${c.model} · ${c.destination}` })));
    select.value = state.clientId; content.append(select, note(`排查配方 ${state.recipeVersion} · 默认只读，不执行修复`),
      el('textarea', { className: 'material', value: state.material, readOnly: true, 'aria-label': '脱敏分析材料' }),
      check('同意将上述脱敏材料交给所选 Agent Client 分析', 'analysisConsent'));
    if (state.stage === 'analyzing') content.append(note('正在分析所选证据，随后将再次脱敏并展示完整报告。', 'notice'));
    footer.append(button('跳过分析', saveReview), button('开始分析', analyze, 'primary', !state.analysisConsent || !state.clientId));
    if (state.stage === 'analyzing') footer.append(el('button', { type: 'button', className: 'secondary', text: '取消分析，保留草稿', onClick: () => bridge('close') }));
  } else if (['review', 'handoff', 'submitting'].includes(state.stage)) {
    content.append(input('Issue 标题', 'title', false, true), input('报告正文', 'body', true, true), pictureCards(),
      el('div', { className: 'notice', text: `目标：${state.journal?.target.label ?? ''} · ${state.journal?.target.visibility === 'public' ? '公开可见' : '请核对目标权限'}。文本已经本地过滤，但仍需检查业务内容和截图。` }));
    if (state.stage === 'handoff') content.append(note('已打开手动创建入口。Issue 尚未提交：请粘贴标题、报告和图片，或下载图片后拖入目标网页。', 'notice'));
    if (state.journal?.state === 'upload_failed') content.append(note(state.journal.safeError, 'notice'));
    else if (issueMayExist()) content.append(note('提交结果待核对；不要再次手动创建，以免重复。此处仅核对，不会重发。', 'notice'));
    if (state.journal?.issue && issueMayExist()) content.append(el('a', { className: 'issue', text: `已创建，待核验：${state.journal.issue.url}`, href: state.journal.issue.url, target: '_blank', rel: 'noopener noreferrer' }));
    if (!issueMayExist()) content.append(check('我已检查完整报告和所有图片，并同意向上述目标提交', 'consent'));
    if (!locked()) footer.append(button('返回修改', async () => { state.stage = 'edit'; state.consent = false; }, 'text'), button('更新报告并检查通路', saveReview));
    const manual = el('a', { text: '手动创建', className: 'secondary', href: state.journal?.target.issueCreateUrl, target: '_blank', rel: 'noopener noreferrer',
      title: '跳转到 Issue 页面，然后进行手动粘贴问题并创建', 'data-publish': 'manual', 'aria-disabled': !state.consent || state.dirty || issueMayExist(),
      onClick: event => { if (!state.consent || state.dirty || issueMayExist() || state.busy) { event.preventDefault(); return; } state.stage = 'handoff'; render(); } });
    footer.append(manual);
    if (state.journal?.state === 'upload_failed') footer.append(button('保留回执，返回编辑', async () => { Object.assign(state, await call({ op: 'reset-upload', digest: state.journal.digest, confirmed: true })); state.stage = 'edit'; state.consent = false; state.dirty = false; }, 'primary'));
    else if (locked()) footer.append(button('核对提交结果', async () => { const value = await call({ op: 'reconcile', digest: state.journal.digest }); Object.assign(state, value); state.error = value.message ?? ''; if (value.journal.state === 'published') state.stage = 'submitted'; }, 'primary'));
    else {
      const auto = button('确认上传', submit, 'primary', !state.consent || state.dirty || !state.automatic); auto.dataset.publish = 'auto'; footer.append(auto);
    }
    footer.append(note(state.stage === 'submitting' ? '正在上传，请等待回执；关闭后仍可重新打开核对状态。' : '自动提交优先；手动创建为兜底。复制按钮紧邻对应字段，图片可逐张复制或下载。'));
  } else if (state.stage === 'submitted') {
    content.append(el('div', { className: 'success' }, [el('h2', { text: '✓ 反馈已提交，感谢你的帮助' }), note('已回读远端 Issue，标题与报告正文核对通过。'),
      el('a', { className: 'issue', text: state.journal.issue.url, href: state.journal.issue.url, target: '_blank', rel: 'noopener noreferrer' }),
      el('a', { className: 'primary', text: '打开 Issue', href: state.journal.issue.url, target: '_blank', rel: 'noopener noreferrer' })]));
    footer.append(button('继续反馈', async () => { state.report = { title: '', body: '', attachments: [] }; state.journal = undefined; state.revision = undefined; state.stage = 'edit'; state.dirty = true; state.consent = false; state.automatic = false; }), button('完成', () => bridge('close'), 'primary'));
  }
  if (state.error) content.append(el('p', { role: 'alert', className: 'error', text: state.error }));
  app.replaceChildren(header, content, footer);
}
render();
run(async () => {
  const initial = await call({ op: 'bootstrap' }); state.targets = initial.targets; state.clients = initial.diagnostics?.clients ?? [];
  state.clientId = state.clients[0]?.id ?? ''; state.targetId = state.targets[0]?.id ?? '';
  if (initial.journal) {
    Object.assign(state, { journal: initial.journal, revision: initial.revision, report: initial.journal.report, targetId: initial.journal.target.id, dirty: false });
    state.stage = initial.journal.state === 'published' ? 'submitted' : initial.journal.state === 'draft' ? 'edit' : 'review';
    if (initial.journal.state === 'approved') { state.stage = 'review'; await saveReview(); }
  }
});
