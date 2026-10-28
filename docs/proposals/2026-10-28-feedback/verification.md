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
| 普通反馈旅程 | 必填校验；陌生标题／描述输入出现在报告中；跳过分析时第二步标明已跳过；未检查内容不开放目标链接，编辑正文撤销确认。 |
| 分析旅程 | 材料确认前不可分析；模拟 agent 失败保留填写内容；重试进入报告；用户原始描述进入模拟报告；未验证事项可见。未调用真实 client。 |
| 附件与目标 | 本地选择测试 PNG、预览；逐张图片检查；更换目标／页面地址使旧确认失效；提示用户在目标网页另行添加图片。未进行 OCR、图片脱敏、重新编码或远端上传。 |
| 两 shell／窄屏 | Café 真实底部入口及经典真实底部入口都可打开；390×844 窄屏检查对话框无水平越界。只是合成页面体验证据。 |
| 手动创建与复制 | 复制标题／正文实际经过 handler，但 clipboard 使用浏览器内测试替身，不覆盖系统剪贴板。配置链接拦截不安全 scheme，标题／报告不放 URL；真实浏览器 popup 导航由测试替身接收 GET，无外部建单。跳转后显示“Issue 尚未提交”。 |
| 浏览器清理 | 最新 `evidence-r2/checks.json`：3 组旅程、0 个未捕获异常、0 个意外外部请求、1 次测试替身拦截的页面 GET、`browserClosed:true`。 |
| 主工作区与步骤 | 中央为空白，不显示演示首页；新文案和四步进度位于弹窗内；分析失败停在第二步，报告第三步，手动跳转第四步。 |
| port 草稿 | TypeScript strict + noEmit 检查通过；未作为现有 SDK API 导出。 |
| 代码范围 | 所有新增源文件均在插件仓 feature worktree 的本提案目录；未修改生产 runtime、用户配置／历史或主项目源码。 |

最新浏览器证据：工作区 `artifacts/feedback-preview/evidence-r2/` 下的 `checks.json` 与 7 张截图。首轮证据保留于 `evidence/`，不当作当前版本证据。构建回执：`artifacts/feedback-preview/build-receipt.json`。

2026-10-28 第二轮反馈修改采用现有旅程扩展检查：旧稿首先在“主工作区必须为空，不显示演示首页”断言失败（`artifacts/feedback-review-red.log`）；修改后同一检查与手动交付、复制、进度及错误路径通过（`artifacts/feedback-review-green.log`）。本轮 UI 测试不声称真实模型、系统剪贴板权限或目标平台提交能力通过验收。

## 重放命令

从本插件 worktree 执行；路径作为独立参数传入。构建只读使用主项目源码和另一既有 checkout 的工具依赖，不链接／修复主项目迁移后失效的依赖 junction。不将此工具复用当作 fresh-consumer 或发布闭包证据。

```powershell
node docs/proposals/2026-10-28-feedback/preview/build.mjs `
  'G:\AIwork\clowder-ai\clowder-ai-main' `
  'G:\AIwork\clowder-ai\worktrees\feat-feedback-diagnostics\artifacts\feedback-preview' `
  'G:\AIwork\clowder-ai\cat-cafe-public-package-slimming'

node docs/proposals/2026-10-28-feedback/preview/check.mjs `
  'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node' `
  'G:\AIwork\clowder-ai\worktrees\feat-feedback-diagnostics\artifacts\feedback-preview\evidence-r2' `
  'http://127.0.0.1:5187/' `
  'C:\Users\Administrator\AppData\Local\ms-playwright\chromium-1228\chrome-win64\chrome.exe'
```

最新输出：`{"checks":3,"errors":0,"unexpectedRequests":0,"interceptedNavigations":1,"browserClosed":true}`。

provider port 检查：

```powershell
node 'G:\AIwork\clowder-ai\cat-cafe-public-package-slimming\node_modules\typescript\bin\tsc' `
  --noEmit --strict --skipLibCheck --target ES2022 --moduleResolution bundler --module ESNext `
  docs/proposals/2026-10-28-feedback/provider-port.ts
```

## 实例、保留与收尾

仅保留一套交互预览：`http://127.0.0.1:5187/`，用途为本设计的用户评审，无 Redis、数据库、client HOME、认证或业务数据根。精确 PID、租约、源码提交和 HTML SHA-256 见 `artifacts/feedback-preview/instance-ledger.json`。

旧构建预览已由 managed launcher 停止；Windows 的受控停止使用精确归属进程树强制结束，没有生成正常退出 completion。因此不声称旧实例完成正常资源收尾。已验证旧 supervisor 41320、server 31968 都不存在、5187 已释放，原注册记录复制保存在 `previous-stopped-record.json`，再复用相同目录与相同端口启动当前版本，没有增加第二环境。

当前服务会在租约到期前正常关闭。工作区／原稿／证据保留用于用户评审；不删除数据。不在本轮创建 EXE、快捷方式、注册项或额外验收环境。第二轮直接复用同一服务，通过 CUA 刷新当前用户打开的预览并核对新文案／步骤；刷新前已有的标题、描述试填值已恢复。没有新增服务或浏览器标签页。

## 尚未通过的交付门

- 用户尚未确认具体体验稿。
- 尚无正式插件包、通用侧栏 contribution、Host 受限诊断上下文、真实 agent／GitHub／GitLab／CLI 接入。
- 手动流程的最终粘贴、添加截图与提交须由用户在目标平台完成；本轮未执行这些外部操作。可选自动流程的图片存储／上传仍未实测。
- 没有正式发布包、独立 review、远端 Issue 回读或 runtime 验收；不以模拟检查替代。

正式插件仍处体验评审阶段；第二轮用户明确要求的流程、文案、步骤与入口调整均已落实到当前体验稿，无需为这些已授权修改另行确认。正式业务、权限与发布验证不由本模拟稿替代。
