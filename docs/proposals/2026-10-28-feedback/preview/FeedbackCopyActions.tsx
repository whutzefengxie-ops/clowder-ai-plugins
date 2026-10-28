import { useEffect, useState } from 'react';

export function FeedbackCopyButton({ label, value }: { label: string; value: string }) {
  const [status, setStatus] = useState('');
  useEffect(() => { setStatus(''); }, [value]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus(label === '复制标题' ? '标题已复制' : '报告正文已复制');
    } catch {
      setStatus('无法写入剪贴板，请手动选中上方内容并复制。');
    }
  }
  return <span className="fb-inline-copy">
    <span role="status" aria-live="polite">{status}</span>
    <button type="button" disabled={!value.trim()} onClick={() => void copy()}>{label}</button>
  </span>;
}
