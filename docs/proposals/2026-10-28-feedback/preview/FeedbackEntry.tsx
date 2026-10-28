import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FeedbackCopyButton } from './FeedbackCopyActions';
import { FeedbackProgress, type FeedbackStage } from './FeedbackProgress';
import { FeedbackPictureCard, type FeedbackPicture } from './FeedbackPictures';
import { previewDestinations } from './feedback-destinations';
import './feedback.css';

const defaultBody = '描述你遇到的现象、发生前的操作，以及你期望看到的结果。';

/** 隔离体验稿：没有日志读取、模型、远端上传、认证或生产插件绑定。 */
export function FeedbackEntry() {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<FeedbackStage>('edit');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [report, setReport] = useState('');
  const [pictures, setPictures] = useState<FeedbackPicture[]>([]);
  const [consent, setConsent] = useState(false);
  const [analysisConsent, setAnalysisConsent] = useState(false);
  const [target, setTarget] = useState('GitHub · Clowder AI · 公开');
  const [pageUrls, setPageUrls] = useState<Record<string, string>>({ 'GitHub · Clowder AI · 公开': 'https://github.com/zts212653/clowder-ai/issues/new' });
  const [client, setClient] = useState('已配置的本地 Agent Client（示例）');
  const [failure, setFailure] = useState(false);
  const [uploadFailure, setUploadFailure] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('direct');
  const [logs, setLogs] = useState(true);
  const automatic = previewDestinations.find(destination => destination.label === target)?.automatic ?? false;
  const locked = stage === 'submitting';
  const showReport = stage === 'review' || stage === 'handoff' || stage === 'submitting';
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
  useEffect(() => {
    if (stage !== 'submitting') return;
    const timer = setTimeout(() => {
      if (uploadFailure) {
        setError('自动提交失败（模拟）。报告和截图已保留，可重试自动提交，或使用手动创建。');
        setStage('review');
      } else { setStage('submitted'); }
    }, 1000);
    return () => clearTimeout(timer);
  }, [stage, uploadFailure]);
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
    setPictures(old => {
      const accepted = valid.slice(0, Math.max(0, 3 - old.length));
      return [...old, ...accepted.map(file => ({ id: crypto.randomUUID(), name: file.name, url: URL.createObjectURL(file), file, checked: false }))];
    });
    setConsent(false);
    if (valid.length !== files.length) setError('体验稿只接受 PNG／JPEG／WebP，每张不超过 5 MB。');
    if (fileInput.current) fileInput.current.value = '';
  }
  const pageUrl = pageUrls[target] ?? '';
  const safeUrl = safeIssueUrl(pageUrl);
  const canOpen = Boolean(consent && pictures.every(p => p.checked) && title.trim() && report.trim() && safeUrl);
  const canUpload = Boolean(automatic && consent && pictures.every(p => p.checked) && title.trim() && report.trim());
  const close = () => { setOpen(false); if (stage === 'analyzing') setStage('scope'); };
  return <>
    <button className="fb-rail" type="button" aria-label="问题反馈" title="问题反馈" data-testid="feedback-entry" onClick={() => setOpen(true)}>
      <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M20 11.5a7.8 7.8 0 0 1-8 7.5H7l-4 3V11.5A7.8 7.8 0 0 1 11 4h1a7.8 7.8 0 0 1 8 7.5Z"/><path d="M12 8v5m0 2v1"/></svg>
    </button>
    {createPortal(<dialog ref={dialog} className="fb-dialog" onCancel={e => { e.preventDefault(); close(); }} aria-labelledby="feedback-heading" data-testid="feedback-surface">
      <div className="fb-top"><div><p className="fb-eyebrow">CLOWDER · 问题反馈</p><h1 id="feedback-heading">{stage === 'review' || locked ? '检查问题报告' : stage === 'handoff' ? '请在 Issue 页面完成创建' : stage === 'submitted' ? '自动提交流程体验完成' : '感谢你的反馈，一起共建项目'}</h1><p className="fb-subtitle">提供更详细的分析报告，帮助我们更快定位和解决问题。</p></div><button className="fb-close" aria-label="关闭问题反馈" disabled={locked} onClick={close}>×</button></div>
      <FeedbackProgress stage={stage} direct={mode === 'direct'} />
      <div className="fb-scroll">
        <p className="fb-prototype">体验稿 · 分析和自动提交均为模拟；手动创建仅打开目标页面。</p>
        <label className="fb-label">创建到<select aria-label="提交目标" disabled={stage === 'analyzing' || stage === 'handoff' || locked || stage === 'submitted'} value={target} onChange={e => {setTarget(e.target.value); setConsent(false);}}>
          {previewDestinations.map(destination => <option key={destination.label}>{destination.label}</option>)}
        </select></label>
        {stage === 'handoff' && <div className="fb-handoff-notice"><strong>Issue 尚未提交。</strong>已发起页面跳转；在下方复制标题、报告和图片，再到目标页面粘贴并创建。</div>}
        {(stage === 'edit' || showReport) && <>
          <div className="fb-label"><div className="fb-field-heading" data-testid="feedback-title-heading"><label htmlFor="feedback-issue-title">标题</label>{showReport && <FeedbackCopyButton label="复制标题" value={title} />}</div>
            <input id="feedback-issue-title" autoFocus aria-label="问题标题" placeholder="用一句话描述问题" maxLength={160} value={title} disabled={locked} onChange={e => {setTitle(e.target.value); setConsent(false); setError('');}} />
          </div>
          {stage === 'edit' ? <label className="fb-label">问题描述<textarea aria-label="问题描述" rows={6} placeholder={defaultBody} value={body} onChange={e => {setBody(e.target.value); setError('');}} /></label> : <>
            <div className="fb-chips"><span>{mode === 'analyzed' ? 'Agent 初步分析 · 模拟' : '普通反馈'}</span><span>{mode === 'analyzed' ? '含示例诊断信息' : '未读取本地日志'}</span></div>
            <div className="fb-label"><div className="fb-field-heading" data-testid="feedback-report-heading"><label htmlFor="feedback-report-body">报告正文 <span className="fb-muted">可继续删改</span></label><FeedbackCopyButton label="复制报告正文" value={report} /></div>
              <textarea id="feedback-report-body" className="fb-report" aria-label="报告正文" rows={11} value={report} disabled={locked} onChange={e => {setReport(e.target.value); setConsent(false);}} />
            </div>
            {mode === 'analyzed' && <p className="fb-note">示例脱敏：路径改为 [PROJECT]、凭据字段已移除。正式版还需服务端重新扫描；此稿不提供真实脱敏保证。</p>}
          </>}
          <div className="fb-label">截图 <span className="fb-muted">可选，最多 3 张</span></div>
          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={e => selectPictures(e.target.files)} />
          <div className="fb-pictures">{pictures.map(p => <FeedbackPictureCard key={p.id} picture={p} review={showReport} locked={locked}
            onRemove={() => { URL.revokeObjectURL(p.url); setPictures(old => old.filter(item => item.id !== p.id)); setConsent(false); }}
            onCheck={checked => {setPictures(old => old.map(item => item.id === p.id ? {...item, checked} : item)); setConsent(false);}} />
          )}{pictures.length < 3 && !locked && <button className="fb-add" onClick={() => fileInput.current?.click()}>＋ 添加截图</button>}</div>
          <p className="fb-note">请避免提交密码、API Key、客户资料或业务隐私。截图中的文字也可能包含敏感信息。</p>
          {showReport && <>
            <p className="fb-note">自动提交会一并上传已检查的截图；手动创建时可在每张截图下复制图片后粘贴，或下载后拖拽上传。</p>
            <label className="fb-label">手动创建的目标页面<input aria-label="Issue 页面地址" type="url" disabled={locked} placeholder="在插件设置中配置目标 Issue 创建页面" value={pageUrl} onChange={e => {setPageUrls(old => ({...old, [target]: e.target.value})); setConsent(false);}} /></label>
            {pageUrl && !safeUrl && <p className="fb-error">请填写有效的 HTTP／HTTPS 页面地址，不要包含账号或密码。</p>}
            <label className="fb-check fb-confirm"><input type="checkbox" aria-label="确认报告内容" checked={consent} disabled={locked} onChange={e => setConsent(e.target.checked)} />我已检查标题、报告和截图中的敏感信息。</label>
            {!automatic && <p className="fb-note">当前目标暂不支持自动提交，请使用手动创建。报告和图片仍可复制或下载。</p>}
            {stage === 'review' && automatic && <details className="fb-demo-options"><summary>体验稿选项</summary><label className="fb-check"><input type="checkbox" aria-label="模拟自动提交失败" checked={uploadFailure} onChange={e => setUploadFailure(e.target.checked)} />模拟自动提交失败</label></details>}
          </>}
        </>}
        {(stage === 'scope' || stage === 'analyzing') && <>
          <h2>补充分析，让问题更快得到解决</h2><p className="fb-note">使用已有 Agent 生成报告，检查后确认上传；无法自动提交时可手动创建。</p>
          <label className="fb-label">分析成员<select aria-label="分析成员" disabled={stage === 'analyzing'} value={client} onChange={e => setClient(e.target.value)}><option>已配置的本地 Agent Client（示例）</option><option>另一已配置本地成员（示例）</option></select></label>
          <label className="fb-label">项目范围<input value="当前选择的项目（示例）" readOnly /></label>
          <div className="fb-scope"><p>默认采集：Clowder／系统／client 版本摘要</p><label className="fb-check"><input type="checkbox" checked={logs} disabled={stage === 'analyzing'} onChange={e => setLogs(e.target.checked)} />增加最近 15 分钟的错误摘要（先脱敏）</label><p className="fb-muted">不采集完整配置、认证、会话数据库或整包源码。截图默认不交给模型。</p></div>
          <div className="fb-disclosure">本地 Client 可能连接云端模型。正式版会展示实际提供方；在这里，分析完全模拟。</div>
          <label className="fb-check fb-confirm"><input type="checkbox" aria-label="允许分析材料" checked={analysisConsent} disabled={stage === 'analyzing'} onChange={e => setAnalysisConsent(e.target.checked)} />同意将所选脱敏材料交给这个 Agent 分析</label>
          <label className="fb-check fb-muted"><input type="checkbox" aria-label="模拟分析失败" checked={failure} disabled={stage === 'analyzing'} onChange={e => setFailure(e.target.checked)} />体验稿选项：模拟 Agent 不可用</label>
          {stage === 'analyzing' && <div role="status" className="fb-progress">正在生成示例报告…<p className="fb-muted">真实版将在这里展示采证、分析和脱敏的当前阶段。</p></div>}
        </>}
        {locked && <p className="fb-progress" role="status">正在模拟上传报告和 {pictures.length} 张截图…</p>}
        {stage === 'submitted' && <div className="fb-success"><span>✓</span><h2>模拟自动提交成功</h2>
          <p>报告与 {pictures.length} 张截图已通过模拟提交流程；没有创建真实 Issue，也没有向远端上传文件。</p>
          <p className="fb-note">正式版在这里显示真实 Issue 链接、附件回执和内容核对结果。</p>
        </div>}
        {error && <p className="fb-error" role="alert">{error}</p>}
      </div>
      <div className="fb-footer">
        {stage === 'edit' && <><button className="fb-secondary" onClick={reviewDirect}>直接提交</button><button className="fb-primary" onClick={analyze}>分析并上传 <span>推荐</span></button><p>先检查报告，再确认上传；手动创建可作为兜底</p></>}
        {stage === 'scope' && <><button className="fb-secondary" onClick={reviewDirect}>跳过分析</button><button className="fb-primary" disabled={!analysisConsent} onClick={() => {setError(''); setStage('analyzing');}}>开始分析</button><button className="fb-text" onClick={() => {setError(''); setStage('edit');}}>返回填写</button></>}
        {stage === 'analyzing' && <button className="fb-secondary" onClick={() => setStage('scope')}>取消分析，保留草稿</button>}
        {stage === 'review' && <><button className="fb-text" onClick={() => {setConsent(false); setStage('edit');}}>返回修改</button>
          <a role="link" className={`fb-secondary ${canOpen ? '' : 'fb-disabled'}`} href={canOpen ? safeUrl : undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!canOpen}
            title="跳转到 Issue 页面，然后手动粘贴问题并创建" onClick={e => { if (!canOpen) { e.preventDefault(); return; } setError(''); setStage('handoff'); }}>手动创建</a>
          <button className="fb-primary" disabled={!canUpload} onClick={() => {setError('');setStage('submitting');}}>确认上传</button>
          <p>自动提交不可用时，可手动创建并粘贴标题、报告和图片</p>
        </>}
        {locked && <button className="fb-primary" disabled>正在上传（模拟）…</button>}
        {stage === 'submitted' && <><button className="fb-secondary" onClick={() => {setConsent(false);setStage('review');}}>返回报告</button><button className="fb-primary" onClick={close}>完成</button></>}
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
