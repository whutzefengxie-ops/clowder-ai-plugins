---
feature_ids: [F235, F202]
topics: [feedback, prototype, verification]
doc_kind: evidence
created: 2026-10-28
---

# 本轮交付与验证回执

交付范围：设计、版本化诊断 prompt 草稿、平台适配 port 草稿、真实宿主导航壳中的模拟交互稿。不是正式插件实现或产品验收，不宣称已完成 F235／F202 的新增需求。

## 可复核结果

| 检查 | 结果与限制 |
| --- | --- |
| 构建 | 真实 `AppShell.tsx`、`WorldRail.tsx`、`ActivityBar.tsx` 参与构建。侧栏入口由体验稿构建期 transform 注入，宿主源码没有修改。断言两处真实挂载位置均匹配；不是正式 inventory／contribution 接入。 |
| 普通反馈旅程 | 必填校验；陌生标题／描述输入出现在报告中；未确认不可提交；编辑正文撤销确认；结果明确为模拟，没有外发。 |
| 分析旅程 | 材料确认前不可分析；模拟 agent 失败保留填写内容；重试进入报告；用户原始描述进入模拟报告；未验证事项可见。未调用真实 client。 |
| 附件与目标 | 本地选择测试 PNG、预览；逐张图片检查；未检查图片不可提交；更换 GitLab 目标使旧确认失效。未进行 OCR、图片脱敏、重新编码或远端上传。 |
| 两 shell／窄屏 | Café 真实底部入口及经典真实底部入口都可打开；390×844 窄屏检查对话框无水平越界。只是合成页面体验证据。 |
| 浏览器清理 | `checks.json`：3 组旅程、0 个未捕获异常、0 个外部 HTTP(S) 请求、`browserClosed:true`。blob 图片引用仅在浏览器本地。 |
| port 草稿 | TypeScript strict + noEmit 检查通过；未作为现有 SDK API 导出。 |
| 代码范围 | 所有新增源文件均在插件仓 feature worktree 的本提案目录；未修改生产 runtime、用户配置／历史或主项目源码。 |

浏览器证据：工作区 `artifacts/feedback-preview/evidence/` 下的 `checks.json` 与 6 张截图。构建回执：`artifacts/feedback-preview/build-receipt.json`。

## 重放命令

从本插件 worktree 执行；路径作为独立参数传入。构建只读使用主项目源码和另一既有 checkout 的工具依赖，不链接／修复主项目迁移后失效的依赖 junction。不将此工具复用当作 fresh-consumer 或发布闭包证据。

```powershell
node docs/proposals/2026-10-28-feedback/preview/build.mjs `
  'G:\AIwork\clowder-ai\clowder-ai-main' `
  'G:\AIwork\clowder-ai\worktrees\feat-feedback-diagnostics\artifacts\feedback-preview' `
  'G:\AIwork\clowder-ai\cat-cafe-public-package-slimming'

node docs/proposals/2026-10-28-feedback/preview/check.mjs `
  'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node' `
  'G:\AIwork\clowder-ai\worktrees\feat-feedback-diagnostics\artifacts\feedback-preview\evidence' `
  'http://127.0.0.1:5187/' `
  'C:\Users\Administrator\AppData\Local\ms-playwright\chromium-1228\chrome-win64\chrome.exe'
```

检查输出：`{"checks":3,"errors":0,"outgoing":0,"browserClosed":true}`。

provider port 检查：

```powershell
node 'G:\AIwork\clowder-ai\cat-cafe-public-package-slimming\node_modules\typescript\bin\tsc' `
  --noEmit --strict --skipLibCheck --target ES2022 --moduleResolution bundler --module ESNext `
  docs/proposals/2026-10-28-feedback/provider-port.ts
```

## 实例、保留与收尾

仅保留一套交互预览：`http://127.0.0.1:5187/`，用途为本设计的用户评审，无 Redis、数据库、client HOME、认证或业务数据根。精确 PID、租约、源码提交和 HTML SHA-256 见 `artifacts/feedback-preview/instance-ledger.json`。

旧构建预览已由 managed launcher 停止；Windows 的受控停止使用精确归属进程树强制结束，没有生成正常退出 completion。因此不声称旧实例完成正常资源收尾。已验证旧 supervisor 41320、server 31968 都不存在、5187 已释放，原注册记录复制保存在 `previous-stopped-record.json`，再复用相同目录与相同端口启动当前版本，没有增加第二环境。

当前服务会在租约到期前正常关闭。工作区／原稿／证据保留用于用户评审；不删除数据。不在本轮创建 EXE、快捷方式、注册项或额外验收环境。右侧浏览器打开工具返回 `queued`，没有声称用户已经看到页面。

## 尚未通过的交付门

- 用户尚未确认具体体验稿。
- 尚无正式插件包、通用侧栏 contribution、Host 受限诊断上下文、真实 agent／GitHub／GitLab／CLI 接入。
- 尚未解决并实测 GitHub 图片存储通路；图片支持仍是必需交付项。
- 没有正式发布包、独立 review、远端 Issue 回读或 runtime 验收；不以模拟检查替代。

对应技能依据：`feat-lifecycle/SKILL.md` 的 Design Gate 明确要求“UX 没确认，不准进入正式产品实现；隔离 worktree 可承载真实壳体验稿。”本轮先交付可判断实物，请用户确认表单／分析／预览／确认的主旅程，然后进入正式实现。
