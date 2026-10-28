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
  <main className="feedback-demo-content">
    <div className="feedback-demo-label">问题反馈 · 隔离体验稿</div>
    <h1>让反馈更容易被理解和复现</h1>
    <p>点击左下方的反馈图标，填写问题。可以让已有 Agent 帮忙整理线索，也可以直接提交。</p>
    <aside><p>这里使用真实 Clowder 导航壳，中央是示例内容。诊断和上传均为模拟；不会访问你的项目、日志、模型或远端仓库。</p></aside>
    <p style={{ marginTop: 26 }}>体验范围：填写与截图 → 分析范围 → 报告检查 → 模拟确认。可用浏览器窄屏检查布局。</p>
    <p><a href="?classic=1">查看经典侧栏</a> · <a href="/">查看 Café 侧栏</a></p>
  </main>
</AppShell>);
