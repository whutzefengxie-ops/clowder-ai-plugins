import { createHash } from 'node:crypto';
import { record, text } from './config.js';
import type { Attachment } from './types.js';

export function attachments(value: unknown): Attachment[] {
  if (!Array.isArray(value) || value.length > 4) throw new Error('最多添加 4 张图片');
  let total = 0;
  return value.map((item, index) => {
    const raw = record(item); const base64 = text(raw.base64, 5_600_000);
    const bytes = Buffer.from(base64, 'base64');
    if (!bytes.length || bytes.length > 4_000_000 || bytes.toString('base64') !== base64) throw new Error('图片格式或大小无效（单张上限 4 MB）');
    total += bytes.length; if (total > 8_000_000) throw new Error('图片总大小不能超过 8 MB');
    const mime = bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ? 'image/png'
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg'
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp' : undefined;
    if (!mime || mime !== raw.mime) throw new Error('仅接受实际的 PNG、JPEG 或 WebP 图片');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    return { id: sha256, sha256, base64, mime, name: `screenshot-${index + 1}.${mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1]}` };
  });
}
