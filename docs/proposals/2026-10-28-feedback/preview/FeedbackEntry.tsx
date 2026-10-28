import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FeedbackCopyActions } from './FeedbackCopyActions';
import { FeedbackProgress, type FeedbackStage } from './FeedbackProgress';
import './feedback.css';

type Picture = { id: string; name: string; url: string; checked: boolean };
const defaultBody = '描述你遇到的现象、发生前的操作，以及你期望看到的结果。';

/** 隔离体验稿：没有日志读取、模型、远端上传、认证或生产插件绑定。 */
export function FeedbackEntry() {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<FeedbackStage>('edit');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [report, setReport] = useState('');
  const [pictures, setPictures] = useState<Picture[]>([]);
  const [consent, setConsent] = useState(false);
  const [analysisConsent, setAnalysisConsent] = useState(false);
  const [target, setTarget] = useState('GitHub · Clowder AI · 公开');
  const [pageUrls, setPageUrls] = useState<Record<string, string>>({ 'GitHub · Clowder AI · 公开': 'https://github.com/zts212653/clowder-ai/issues/new' });
  const [client, setClient] = useState('已配置的本地 Agent Client（示例）');
  const [failure, setFailure] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('direct');
  const [logs, setLogs] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const picturesRef = useRef(pictures);
  picturesRef.current = pictures;
  useEffect(() => () => picturesRef.current.forEach(p => URL.revokeObjectURL(p.url)), []);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  useEffect(() => {
    if (stage !== 'analyzing') return;
    const timer = setTimeout(() => {
      if (failure) { setStage('scope'); setError('模拟：Agent Client 暂时不可用。你的填写内容已保留，可重试或跳过分析。'); return; }
      setReport(makeReport(title, body, logs));
      setStage('review');
      setConsent(false);
    }, 1100);
    return () => clearTimeout(timer);
  }, [stage, title, body, failure, logs]);
  function reviewDirect() {
    if (!title.trim() || !body.trim()) { setError('请填写标题和问题描述。'); return; }
    setMode('direct'); setError(''); setConsent(false);
    setReport(`## 问题描述\n${body}\n\n## 提交方式\n用户直接反馈；未运行 Agent 分析，未读取本地日志。`);
    setStage('review');
  }
  function analyze() {
    if (!title.trim() || !body.trim()) { setError('请填写标题和问题描述。'); return; }
    setMode('analyzed'); setError(''); setStage('scope');
  }
  function selectPictures(files: FileList | null) {
    if (!files) return;
    const valid = Array.from(files).filter(f => ['image/png', 'image/jpeg', 'image/webp'].includes(f.type) && f.size <= 5 * 1024 * 1024);
    setPictures(old => [...old, ...valid.map(f => ({ id: crypto.randomUUID(), name: f.name, url: URL.createObjectURL(f), checked: false }))].slice(0, 3));
    setConsent(false);
    if (valid.length !== files.length) setError('体验稿只接受 PNG／JPEG／WebP，每张不超过 5 MB。');
    if (fileInput.current) fileInput.current.value = '';
  }
  const pageUrl = pageUrls[target] ?? '';
  const safeUrl = safeIssueUrl(pageUrl);
  const canOpen = Boolean(consent && pictures.every(p => p.checked) && title.trim() && report.trim() && safeUrl);
  const close = () => { setOpen(false); if (stage === 'analyzing') setStage('scope'); };
  return <>
    <button className="fb-rail" type="button" aria-label="问题反馈" title="问题反馈" data-testid="feedback-entry" onClick={() => setOpen(true)}>
      <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M20 11.5a7.8 7.8 0 0 1-8 7.5H7l-4 3V11.5A7.8 7.8 0 0 1 11 4h1a7.8 7.8 0 0 1 8 7.5Z"/><path d="M12 8v5m0 2v1"/></svg>
    </button>
    {createPortal(<dialog ref={dialog} className="fb-dialog" onCancel={e => { e.preventDefault(); close(); }} aria-labelledby="feedback-heading" data-testid="feedback-surface">
      <div className="fb-top"><div><p className="fb-eyebrow">CLOWDER · 问题反馈</p><h1 id="feedback-heading">{stage === 'review' ? '检查问题报告' : stage === 'handoff' ? '请在 Issue 页面完成创建' : '感谢你的反馈，一起共建项目'}</h1><p className="fb-subtitle">提供更详细的分析报告，帮助我们更快定位和解决问题。</p></div><button className="fb-close" aria-label="关闭问题反馈" onClick={close}>×</button></div>
      <FeedbackProgress stage={stage} direct={mode === 'direct'} />
      <div className="fb-scroll">
        <p className="fb-prototype">体验稿 · 分析为模拟；手动创建仅跳转页面，不会自动提交。</p>
        <label className="fb-label">创建到<select aria-label="提交目标" disabled={stage === 'analyzing' || stage === 'handoff'} value={target} onChange={e => {setTarget(e.target.value); setConsent(false);}}>
          <option>GitHub · Clowder AI · 公开</option><option>GitLab · 内网项目（页面待配置）</option><option>其他 Issue 平台（页面待配置）</option>
        </select></label>
        {(stage === 'edit' || stage === 'review') && <>
          <label className="fb-label">标题<input autoFocus aria-label="问题标题" placeholder="用一句话描述问题" maxLength={160} value={title} onChange={e => {setTitle(e.target.value); setConsent(false); setError('');}} /></label>
          {stage === 'edit' ? <label className="fb-label">问题描述<textarea aria-label="问题描述" rows={6} placeholder={defaultBody} value={body} onChange={e => {setBody(e.target.value); setError('');}} /></label> : <>
            <div className="fb-chips"><span>{mode === 'analyzed' ? 'Agent 初步分析 · 模拟' : '普通反馈'}</span><span>{mode === 'analyzed' ? '含示例诊断信息' : '未读取本地日志'}</span></div>
            <label className="fb-label">报告正文 · 可继续删改<textarea className="fb-report" aria-label="报告正文" rows={11} value={report} onChange={e => {setReport(e.target.value); setConsent(false);}} /></label>
            {mode === 'analyzed' && <p className="fb-note">示例脱敏：路径改为 [PROJECT]、凭据字段已移除。正式版还需服务端重新扫描；此稿不提供真实脱敏保证。</p>}
          </>}
          <div className="fb-label">截图 <span className="fb-muted">可选，最多 3 张</span></div>
          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={e => selectPictures(e.target.files)} />
          <div className="fb-pictures">{pictures.map(p => <div className="fb-picture" key={p.id}>
            <img src={p.url} alt={p.name} /><div className="fb-picture-line"><span>{p.name}</span><button aria-label={`移除 ${p.name}`} onClick={() => { URL.revokeObjectURL(p.url); setPictures(old => old.filter(item => item.id !== p.id)); setConsent(false);}}>移除</button></div>
            {stage === 'review' && <label className="fb-check"><input type="checkbox" checked={p.checked} onChange={e => {setPictures(old => old.map(item => item.id === p.id ? {...item, checked: e.target.checked} : item)); setConsent(false);}} />我已检查图片中的敏感信息</label>}
          </div>)}{pictures.length < 3 && <button className="fb-add" onClick={() => fileInput.current?.click()}>＋ 添加截图</button>}</div>
          <p className="fb-note">请避免提交密码、API Key、客户资料或业务隐私。截图中的文字也可能包含敏感信息。</p>
          {stage === 'review' && <>
            <FeedbackCopyActions title={title} report={report} />
            <label className="fb-label">Issue 页面地址<input aria-label="Issue 页面地址" type="url" placeholder="在插件设置中配置目标 Issue 创建页面" value={pageUrl} onChange={e => {setPageUrls(old => ({...old, [target]: e.target.value})); setConsent(false);}} /></label>
            {pageUrl && !safeUrl && <p className="fb-error">请填写有效的 HTTP／HTTPS 页面地址，不要包含账号或密码。</p>}
            <p className="fb-note">截图需在目标 Issue 页面另行添加。</p>
            <label className="fb-check fb-confirm"><input type="checkbox" aria-label="确认报告内容" checked={consent} onChange={e => setConsent(e.target.checked)} />我已检查报告和图片，将在目标页面手动粘贴并提交。</label>
          </>}
        </>}
        {(stage === 'scope' || stage === 'analyzing') && <>
          <h2>补充分析，让问题更快得到解决</h2><p className="fb-note">使用已有 Agent 生成报告，检查后可前往 Issue 页面手动创建。</p>
          <label className="fb-label">分析成员<select aria-label="分析成员" disabled={stage === 'analyzing'} value={client} onChange={e => setClient(e.target.value)}><option>已配置的本地 Agent Client（示例）</option><option>另一已配置本地成员（示例）</option></select></label>
          <label className="fb-label">项目范围<input value="当前选择的项目（示例）" readOnly /></label>
          <div className="fb-scope"><p>默认采集：Clowder／系统／client 版本摘要</p><label className="fb-check"><input type="checkbox" checked={logs} disabled={stage === 'analyzing'} onChange={e => setLogs(e.target.checked)} />增加最近 15 分钟的错误摘要（先脱敏）</label><p className="fb-muted">不采集完整配置、认证、会话数据库或整包源码。截图默认不交给模型。</p></div>
          <div className="fb-disclosure">本地 Client 可能连接云端模型。正式版会展示实际提供方；在这里，分析完全模拟。</div>
          <label className="fb-check fb-confirm"><input type="checkbox" aria-label="允许分析材料" checked={analysisConsent} disabled={stage === 'analyzing'} onChange={e => setAnalysisConsent(e.target.checked)} />同意将所选脱敏材料交给这个 Agent 分析</label>
          <label className="fb-check fb-muted"><input type="checkbox" aria-label="模拟分析失败" checked={failure} disabled={stage === 'analyzing'} onChange={e => setFailure(e.target.checked)} />体验稿选项：模拟 Agent 不可用</label>
          {stage === 'analyzing' && <div role="status" className="fb-progress">正在生成示例报告…<p className="fb-muted">真实版将在这里展示采证、分析和脱敏的当前阶段。</p></div>}
        </>}
        {stage === 'handoff' && <div className="fb-handoff">
          <h2>已发起页面跳转</h2><p className="fb-handoff-state">Issue 尚未提交。</p>
          <ol><li>复制问题标题，粘贴到目标页面的标题栏。</li><li>复制报告，粘贴到描述栏，并添加检查过的截图。</li><li>在目标页面确认内容后，手动创建 Issue。</li></ol>
          <FeedbackCopyActions title={title} report={report} />
          <p className="fb-note">如果新页面没有打开，可返回报告重试。此窗口会保留你的填写内容。</p>
        </div>}
        {error && <p className="fb-error" role="alert">{error}</p>}
      </div>
      <div className="fb-footer">
        {stage === 'edit' && <><button className="fb-secondary" onClick={reviewDirect}>跳过分析</button><button className="fb-primary" onClick={analyze}>分析并生成报告 <span>推荐</span></button><p>检查报告后，前往 Issue 页面手动创建</p></>}
        {stage === 'scope' && <><button className="fb-secondary" onClick={reviewDirect}>跳过分析</button><button className="fb-primary" disabled={!analysisConsent} onClick={() => {setError(''); setStage('analyzing');}}>开始分析</button><button className="fb-text" onClick={() => {setError(''); setStage('edit');}}>返回填写</button></>}
        {stage === 'analyzing' && <button className="fb-secondary" onClick={() => setStage('scope')}>取消分析，保留草稿</button>}
        {stage === 'review' && <><button className="fb-secondary" onClick={() => {setConsent(false); setStage('edit');}}>返回修改</button>
          <a role="link" className={`fb-primary ${canOpen ? '' : 'fb-disabled'}`} href={canOpen ? safeUrl : undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!canOpen}
            title="跳转到 Issue 页面，然后手动粘贴问题并创建" onClick={e => { if (!canOpen) { e.preventDefault(); return; } setError(''); setStage('handoff'); }}>手动创建</a>
          <p>跳转到 Issue 页面，然后手动粘贴问题并创建</p>
        </>}
        {stage === 'handoff' && <><button className="fb-secondary" onClick={() => setStage('review')}>返回检查报告</button><button className="fb-primary" onClick={close}>关闭</button></>}
      </div>
    </dialog>, document.body)}
  </>;
}

function safeIssueUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return;
    return url.href;
  } catch { return; }
}

function makeReport(title: string, body: string, logs: boolean) {
  return `## 问题摘要\n${title}\n\n## 用户描述\n${body}\n\n## 环境与版本\n示例：Windows · Clowder 版本待核实 · 已配置本地 Client\n\n## 证据覆盖\n${logs ? 'E1（合成示例）：[PROJECT]/logs 内发现 request timeout；不代表真实采证。' : '用户未选择日志；本稿不含日志证据。'}\n\n## 初步分析\n当前信息不足以确认根因。可先核对实际运行版本和首次错误。此段为模拟内容。\n\n## 未验证事项\n尚未真实复现；未执行修复、重启或写入检查。\n\n## 脱敏说明\n示例路径使用 [PROJECT]；未读取认证、完整环境变量或历史会话。`;
}
