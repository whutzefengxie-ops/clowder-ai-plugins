import { createRoot } from 'react-dom/client';
import { AppShell } from '@/components/AppShell';
import { primeCoCreatorConfigCache } from '@/hooks/useCoCreatorConfig';
import { writeShellPresentation } from '@/components/shell/shell-presentation';
import '@/app/globals.css';
import '@/app/theme-tokens.css';
import '@/app/console-tokens.css';
import '@/app/shell-v2.css';

// 模型、业务 API 和运行服务不接入此体验稿。真实 shell、两套 rail 与导航组件参与构建。
globalThis.fetch = async () => new Response(JSON.stringify({
  items: [], count: 0, attentionCount: 0, totalCount: 0,
  data: [], config: {}, status: 'unavailable',
}), { status: 200, headers: { 'Content-Type': 'application/json' } });
primeCoCreatorConfigCache({ name: '体验者', aliases: [], mentionPatterns: [], color: { primary: '#b05f45', secondary: '#f3e3da' } });
writeShellPresentation(new URLSearchParams(location.search).get('classic') === '1' ? 'classic' : 'v2');
createRoot(document.getElementById('root')!).render(<AppShell>
  <main aria-label="主工作区" data-testid="feedback-preview-workspace" className="flex-1" />
</AppShell>);
