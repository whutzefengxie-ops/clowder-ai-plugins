import { useEffect, useState } from 'react';

export function FeedbackCopyActions({ title, report }: { title: string; report: string }) {
  const [status, setStatus] = useState('');
  useEffect(() => { setStatus(''); }, [title, report]);
  async function copy(kind: 'title' | 'report') {
    try {
      await navigator.clipboard.writeText(kind === 'title' ? title : report);
      setStatus(kind === 'title' ? '标题已复制，请粘贴到 Issue 标题栏。' : '报告已复制，请粘贴到 Issue 描述栏。');
    } catch {
      setStatus('无法写入剪贴板，请手动选中上方内容并复制。');
    }
  }
  return <div className="fb-copy-area">
    <div className="fb-copy-actions">
      <button type="button" onClick={() => void copy('title')}>复制标题</button>
      <button type="button" onClick={() => void copy('report')}>复制报告</button>
    </div>
    <p className="fb-note" role="status" aria-live="polite">{status || '分别复制标题和报告，再到目标页面粘贴。'}</p>
  </div>;
}
