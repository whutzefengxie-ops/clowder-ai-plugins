import { useState } from 'react';

export type FeedbackPicture = { id: string; name: string; url: string; file: File; checked: boolean };

async function pngBytes(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    context.drawImage(bitmap, 0, 0);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('PNG conversion failed')), 'image/png'));
  } finally { bitmap.close(); }
}

export function FeedbackPictureCard({ picture, review, locked, onRemove, onCheck }: {
  picture: FeedbackPicture; review: boolean; locked: boolean;
  onRemove(): void; onCheck(checked: boolean): void;
}) {
  const [status, setStatus] = useState('');
  async function copyImage() {
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
      setStatus('当前浏览器不支持复制图片，请下载后拖拽到 Issue 描述区。');
      return;
    }
    try {
      // Promise<Blob> 在点击事件内创建，供有用户手势要求的浏览器消费。
      const item = new ClipboardItem({ 'image/png': pngBytes(picture.file) });
      await navigator.clipboard.write([item]);
      setStatus('图片已复制，请在 Issue 描述区粘贴；不支持粘贴时可下载后上传。');
    } catch { setStatus('图片复制失败，请下载后拖拽到 Issue 描述区。'); }
  }
  return <div className="fb-picture" data-testid="feedback-picture-card">
    <img src={picture.url} alt={picture.name} />
    <div className="fb-picture-line"><span>{picture.name}</span>
      {!locked && <button type="button" aria-label={`移除 ${picture.name}`} onClick={onRemove}>移除</button>}
    </div>
    <div className="fb-picture-actions">
      <button type="button" aria-label={`复制图片 ${picture.name}`} onClick={() => void copyImage()}>复制图片</button>
      <a href={picture.url} download={picture.name} aria-label={`下载图片 ${picture.name}`}>下载图片</a>
    </div>
    {status && <p className="fb-picture-status" role="status">{status}</p>}
    {review && <label className="fb-check"><input type="checkbox" checked={picture.checked} disabled={locked}
      onChange={event => onCheck(event.target.checked)} />我已检查图片中的敏感信息</label>}
  </div>;
}
