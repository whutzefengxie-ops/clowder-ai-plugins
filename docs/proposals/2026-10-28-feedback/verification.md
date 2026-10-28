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
| 普通反馈旅程 | “直接提交”仍进入报告检查；必填校验、陌生输入保留、第二步显示跳过分析；未检查正文／图片时自动和手动主次操作均受限，编辑撤销确认。 |
| 分析旅程 | 材料确认前不可分析；模拟 agent 失败保留填写内容；重试进入报告；用户原始描述进入模拟报告；未验证事项可见。未调用真实 client。 |
| 附件与目标 | 本地选择生成的 16×10 测试 PNG；复制图片实际经 bitmap→canvas→PNG 编码，clipboard 写入用浏览器替身验证类型、PNG 签名和尺寸。下载图片实际执行，保存文件与原输入逐字节相同。复制失败仍保留下载；不声称完成像素脱敏、系统剪贴板权限或外部上传。 |
| 两 shell／窄屏 | Café 真实底部入口及经典真实底部入口都可打开；390×844 窄屏检查对话框无水平越界。只是合成页面体验证据。 |
| 字段旁复制 | 标题和报告正文各自标签同行有对应复制按钮，浏览器几何断言验证其垂直中心处于同一行；没有底部集中复制区。剪贴板使用浏览器替身，不覆盖系统剪贴板。 |
| 自动与手动 | 自动“确认上传”为主操作、手动创建为次操作，两者并存。模拟自动失败后保留正文和图片，手动兜底仍在；重试模拟成功明确计入 1 张图片，不冒充真实建单。无自动能力目标保留禁用主按钮和原因。手动页 GET 被测试替身拦截，跳转不带报告内容、不伪称提交。 |
| 成功回链 | 自动提交结果生成独立 ID、模拟编号与对应本地 URL；成功页展示 URL 和“打开 Issue”。测试真实点击后断言打开页 URL／ID 与结果一致并关闭该页；失败时没有成功链接。不会把现有真实仓库中的任意 Issue 当作模拟结果。 |
| 浏览器清理 | 最新 `evidence-r4/checks.json`：5 组旅程、0 个未捕获异常、0 个意外外部请求、1 次测试替身拦截的页面 GET、`browserClosed:true`。成功回链访问同一本地服务，额外打开页已关闭。下载保存在任务证据目录；没有改变用户剪贴板或下载目录。 |
| 主工作区与步骤 | 中央为空白，不显示演示首页；新文案和四步进度位于弹窗内；分析失败停在第二步，报告第三步，手动跳转第四步。 |
| port 草稿 | TypeScript strict + noEmit 检查通过；未作为现有 SDK API 导出。 |
| 代码范围 | 所有新增源文件均在插件仓 feature worktree 的本提案目录；未修改生产 runtime、用户配置／历史或主项目源码。 |

最新浏览器证据：工作区 `artifacts/feedback-preview/evidence-r4/` 下的 `checks.json`、PNG 下载物和截图，`08-automatic-success.png` 展示 Issue 回链。旧轮次证据保留在各自目录，不当作当前版本证据。构建回执：`artifacts/feedback-preview/build-receipt.json`。

2026-10-28 第二轮反馈修改采用现有旅程扩展检查：旧稿首先在“主工作区必须为空，不显示演示首页”断言失败（`artifacts/feedback-review-red.log`）；修改后同一检查与手动交付、复制、进度及错误路径通过（`artifacts/feedback-review-green.log`）。本轮 UI 测试不声称真实模型、系统剪贴板权限或目标平台提交能力通过验收。

第三轮用户纠正了作者将手动能力替代自动能力的误解。旧稿在“自动提交应保留为主操作，手动创建只是兜底”断言 RED（`artifacts/feedback-review-r3-red.log`）；修改后自动成功／失败、字段旁复制、PNG 编码／下载、手动兜底与原旅程一并 GREEN（`artifacts/feedback-review-r3-green.log`）。

第四轮要求补齐自动提交后的对应 Issue 链接。旧稿在“自动提交完成必须显示对应 Issue 链接”断言 RED（`artifacts/feedback-review-r4-red.log`）；更新后该断言、链接打开与结果 ID 一致、失败无成功回链及既有旅程 GREEN（`artifacts/feedback-review-r4-green.log`）。链接通过结构化模拟提交结果交给 UI；本地模拟结果页不承载真实平台建单，也不更改主预览的 shell 选择。

## 重放命令

从本插件 worktree 执行；路径作为独立参数传入。构建只读使用主项目源码和另一既有 checkout 的工具依赖，不链接／修复主项目迁移后失效的依赖 junction。不将此工具复用当作 fresh-consumer 或发布闭包证据。

```powershell
node docs/proposals/2026-10-28-feedback/preview/build.mjs `
  'G:\AIwork\clowder-ai\clowder-ai-main' `
  'G:\AIwork\clowder-ai\worktrees\feat-feedback-diagnostics\artifacts\feedback-preview' `
  'G:\AIwork\clowder-ai\cat-cafe-public-package-slimming'

node docs/proposals/2026-10-28-feedback/preview/check.mjs `
  'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node' `
  'G:\AIwork\clowder-ai\worktrees\feat-feedback-diagnostics\artifacts\feedback-preview\evidence-r4' `
  'http://127.0.0.1:5187/' `
  'C:\Users\Administrator\AppData\Local\ms-playwright\chromium-1228\chrome-win64\chrome.exe'
```

最新输出：`{"checks":5,"errors":0,"unexpectedRequests":0,"interceptedNavigations":1,"browserClosed":true}`。

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

第三轮仍复用同一目录和 5187 服务，生成文件已通过 HTTP 200 与独立浏览器检查。尝试操作当前预览时 CUA 返回 `browser.user is unavailable`，目的工具打开同一标签返回 `queued`，因此只声明预览产物已更新，不声明用户当前标签已经刷新。

## 尚未通过的交付门

- 用户尚未确认具体体验稿。
- 尚无正式插件包、通用侧栏 contribution、Host 受限诊断上下文、真实 agent／GitHub／GitLab／CLI 接入。
- 自动主路径仍为模拟，真实平台认证／图片上传／建单／回读未验收；手动兜底最终粘贴、上传和提交也未在真实平台执行。图片复制／下载本地功能不等同于这些外部能力。
- 没有正式发布包、独立 review、远端 Issue 回读或 runtime 验收；不以模拟检查替代。

正式插件仍处体验评审阶段；第二轮用户明确要求的流程、文案、步骤与入口调整均已落实到当前体验稿，无需为这些已授权修改另行确认。正式业务、权限与发布验证不由本模拟稿替代。
