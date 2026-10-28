import { constants } from 'node:fs';
import { mkdir, realpath, lstat, open, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type { Attachment, ImageBytes, Journal, HydratedJournal, Report, StoredAttachment, StoredReport } from './types.js';

/** CAS values contain references only. Bytes stay inside the Host-provisioned installation data root. */
export class AttachmentVault {
  constructor(private readonly dataPath: string) {}
  async storeReport(report: Report): Promise<StoredReport> {
    const attachments: StoredAttachment[] = [];
    for (const image of report.attachments) {
      const normalized = await this.store(image);
      attachments.push({ ...normalized, ...(image.original ? { original: await this.store(image.original) } : {}) });
    }
    return { title: report.title, body: report.body, attachments };
  }
  async readReport(report: StoredReport): Promise<Report> {
    const attachments: Attachment[] = [];
    for (const item of report.attachments) {
      const { original, ...metadata } = item;
      attachments.push({ ...metadata, base64: (await this.bytes(item)).toString('base64'),
        ...(original ? { original: { ...original, base64: (await this.bytes(original)).toString('base64') } } : {}) });
    }
    return { title: report.title, body: report.body, attachments };
  }
  async hydrate(journal: Journal): Promise<HydratedJournal> { return { ...journal, report: await this.readReport(journal.report) }; }
  private async directory(): Promise<string> {
    await mkdir(resolve(this.dataPath), { recursive: true, mode: 0o700 });
    const root = await realpath(resolve(this.dataPath)); const directory = join(root, 'feedback-attachments');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    if ((await lstat(directory)).isSymbolicLink() || await realpath(directory) !== directory) throw new Error('附件目录身份异常');
    return directory;
  }
  private async store(image: ImageBytes): Promise<Omit<ImageBytes, 'base64'>> {
    const metadata = { id: image.id, name: image.name, mime: image.mime, sha256: image.sha256 }; const bytes = Buffer.from(image.base64, 'base64');
    const file = join(await this.directory(), image.sha256);
    try { await writeFile(file, bytes, { flag: 'wx', mode: 0o600 }); }
    catch (error) { if (!(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST')) throw error; }
    await this.bytes(metadata);
    return metadata;
  }
  private async bytes(image: Omit<ImageBytes, 'base64'>): Promise<Buffer> {
    if (!/^[a-f0-9]{64}$/.test(image.sha256) || image.id !== image.sha256) throw new Error('附件引用无效');
    const directory = await this.directory(); const file = join(directory, image.sha256);
    if ((await lstat(file)).isSymbolicLink() || await realpath(file) !== file) throw new Error('附件文件身份异常');
    const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const stat = await handle.stat(); if (!stat.isFile() || stat.size > 4_000_000) throw new Error('附件文件超限');
      const bytes = await handle.readFile();
      if (createHash('sha256').update(bytes).digest('hex') !== image.sha256) throw new Error('附件字节已变化，请重新检查');
      return bytes;
    } finally { await handle.close(); }
  }
}
