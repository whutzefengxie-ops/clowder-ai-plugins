import { randomUUID } from 'node:crypto';
import { attachments } from './attachments.js';
import { digest, profiles, record, text } from './config.js';
import { marker, provider } from './providers.js';
import { instructions, recipeVersion } from './recipe.js';
import { sanitize } from './sanitize.js';
import type { Host, Journal, OwnerContext, Profile, Provider, Report } from './types.js';

type ProviderFactory = (target: Profile) => Provider;
export class FeedbackService {
  constructor(private readonly host: Host, private readonly factory: ProviderFactory = target => provider(host, target)) {}

  async dispatch(input: unknown, context: OwnerContext | undefined): Promise<unknown> {
    if (context?.kind !== 'owner-http-request' || context.operation !== 'write' || !context.requestIdentity || context.pluginInstanceId !== this.host.pluginInstanceId) throw new Error('反馈仅能由已登录用户在插件面板中操作');
    await context.assertCurrent();
    const data = record(input); const op = text(data.op, 30); const key = `feedback:${digest(context.userId)}`;
    const current = await this.host.storage.get(key);
    const journal = current?.value as Journal | undefined;
    const targets = await profiles(this.host);
    const write = async (value: Journal) => {
      await context.assertCurrent();
      const result = await this.host.storage.compareAndSet(key, current?.revision ?? null, value);
      if (!result.applied) throw new Error('草稿已在另一个窗口更新，请重新打开反馈面板');
      return { journal: value, revision: result.revision };
    };
    if (op === 'bootstrap') {
      let diagnostics;
      try { diagnostics = await this.host.diagnostics?.describe(); } catch { /* Direct submission remains available. */ }
      return { targets, journal, revision: current?.revision, diagnostics: diagnostics ? {
        ...diagnostics, projectRoot: '[PROJECT]', environment: sanitize(diagnostics.environment, [diagnostics.projectRoot]),
      } : undefined };
    }
    if (op === 'save') {
      if (journal && ['writing', 'unknown'].includes(journal.state)) throw new Error('上一次提交结果待核对，请先核对远端，避免重复创建');
      if (journal && journal.state !== 'published' && data.revision !== current?.revision) throw new Error('草稿版本已变化，请重新打开');
      const target = targets.find(p => p.id === data.targetId);
      if (!target) throw new Error('反馈目标已变化');
      const report = this.report(data.report);
      if (!report.title.trim() || !report.body.trim()) throw new Error('请填写标题与问题描述');
      const value: Journal = {
        version: 1, id: !journal || journal.state === 'published' ? randomUUID() : journal.id,
        owner: context.userId, report, target, digest: digest({ report, target }), state: 'draft',
      };
      return write(value);
    }
    if (op === 'prepare-analysis') {
      if (!this.host.diagnostics) throw new Error('当前宿主未提供安全诊断 Client，可直接提交或手动创建');
      const description = await this.host.diagnostics.describe();
      const report = this.report(data.report);
      const material = sanitize(`E1 环境摘要\n${description.environment}\n\nE2 用户描述\n${report.title}\n${report.body}\n\nE3 最近错误摘要\n${data.logs === true ? await this.host.diagnostics.collect() : '用户未选择日志'}`, [description.projectRoot]);
      const hash = digest(material); const analysisKey = `${key}:analysis`;
      const old = await this.host.storage.get(analysisKey);
      await context.assertCurrent();
      const stored = await this.host.storage.compareAndSet(analysisKey, old?.revision ?? null, { material, hash });
      if (!stored.applied) throw new Error('分析范围已变化，请重新检查');
      return { material, hash, clients: description.clients, recipeVersion };
    }
    if (op === 'analyze') {
      const prepared = await this.host.storage.get(`${key}:analysis`);
      const selected = prepared?.value as { material: string; hash: string } | undefined;
      if (!selected || selected.hash !== data.hash || data.confirmed !== true || !this.host.diagnostics) throw new Error('请先检查并确认脱敏后的分析材料');
      const result = await this.host.diagnostics.analyze({ clientId: text(data.clientId, 128), prompt: selected.material, instructions, signal: context.signal });
      await context.assertCurrent();
      return { body: sanitize(result), recipeVersion };
    }
    if (!journal || journal.owner !== context.userId || data.digest !== journal.digest) throw new Error('报告版本已变化，请重新检查并确认');
    if (digest(targets.find(p => p.id === journal.target.id)) !== digest(journal.target)) throw new Error('目标配置已变化，请重新检查报告');
    const adapter = this.factory(journal.target);
    if (op === 'preflight') return adapter.preflight(context.signal);
    if (op === 'manual') return { url: journal.target.issueCreateUrl, remoteIssueCreated: false };
    if (op === 'approve') {
      if (journal.state !== 'draft' || data.confirmed !== true) throw new Error('请检查报告和图片，并确认目标可见性');
      return write({ ...journal, state: 'approved' });
    }
    if (op === 'submit') {
      if (journal.state === 'published') return { journal, revision: current?.revision };
      if (journal.state !== 'approved') throw new Error('提交尚未确认或远端结果待核对，不会重复上传');
      const check = await adapter.preflight(context.signal);
      if (journal.report.attachments.length && !check.attachments) throw new Error('自动附件通路未配置，请手动创建并粘贴或上传图片');
      await context.assertCurrent();
      const locked = await write({ ...journal, state: 'writing' });
      let revision = locked.revision;
      let pending: Journal = locked.journal;
      const checkpoint = async (next: Journal) => {
        const saved = await this.host.storage.compareAndSet(key, revision ?? null, next);
        if (!saved.applied) throw new Error('提交日志发生冲突；请核对远端结果');
        revision = saved.revision; pending = next;
      };
      try {
        const uploaded: string[] = [];
        for (const attachment of journal.report.attachments) {
          await context.assertCurrent();
          uploaded.push(await adapter.upload(attachment, journal.id, context.signal));
        }
        const report = { ...journal.report, body: `${journal.report.body}${uploaded.length ? `\n\n## 截图\n${uploaded.join('\n\n')}` : ''}` };
        await checkpoint({ ...pending, report });
        await context.assertCurrent();
        const issue = await adapter.create(report, journal.id, context.signal);
        await checkpoint({ ...pending, report, issue, state: 'unknown' });
        const verified = await adapter.read(issue, context.signal);
        verify(pending, verified);
        await checkpoint({ ...pending, state: 'published', issue: verified });
        await this.host.storage.compareAndSet(`publication:${journal.id}`, null, pending);
        return { journal: pending, revision };
      } catch {
        try { await checkpoint({ ...pending, state: 'unknown', safeError: '提交结果尚未核实。请先核对远端；不会自动重发。' }); } catch { /* A persisted writing fence also prevents retries. */ }
        return { journal: { ...pending, state: 'unknown' }, revision };
      }
    }
    if (op === 'reconcile') {
      if (!['writing', 'unknown', 'published'].includes(journal.state)) throw new Error('当前没有待核对的提交');
      const found = journal.issue ?? await adapter.reconcile(journal.id, context.signal);
      if (!found) return { journal: { ...journal, state: 'unknown' }, revision: current?.revision, message: '未找到唯一匹配记录；这不代表没有创建。请到目标页面人工核对，暂不允许重发。' };
      const verified = await adapter.read(found, context.signal);
      verify(journal, verified);
      return write({ ...journal, issue: verified, state: 'published', safeError: undefined });
    }
    throw new Error('不支持的反馈操作');
  }

  private report(value: unknown): Report {
    const r = record(value);
    return { title: sanitize(text(r.title, 200)).replace(/[\r\n]/g, ' '), body: sanitize(text(r.body, 100_000)), attachments: attachments(r.attachments ?? []) };
  }
}
function verify(journal: Journal, issue: { title: string; body: string }): void {
  if (issue.title !== journal.report.title || issue.body !== `${journal.report.body}\n\n${marker(journal.id)}`) throw new Error('远端正文与已确认内容不一致，需人工核对');
}
