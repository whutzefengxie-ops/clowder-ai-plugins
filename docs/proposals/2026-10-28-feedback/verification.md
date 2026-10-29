---
feature_ids: [F235, F202]
topics: [feedback, plugins, verification]
doc_kind: verification
created: 2026-10-29
---

# 反馈插件验证与交付边界

#155 包含插件实现、公开 SDK 增量和必要文档；#1732 提供通用 UI/runtime-info/projectRef。旧方案的反馈专用 Host 诊断和 Claude/Codex 改动已移除。旧模拟预览已从当前差异移除，历史可回溯到提交 `482b39e5306f68c3d983104bf5f8ac370f49d3c2`，不作为当前运行证据。

## 当前验证

- 插件类型检查、构建及 23 项行为测试通过：普通成员分析、持久状态重开、未知创建/请求中断、冷激活中断、项目 junction 范围、无有效报告/迟到结果、提交与远端回读、截图处理、上传恢复。
- SDK 类型检查及定向 24 项通过：公开接口/文档一致、owner 上下文、撤销和普通线程映射。
- Host API 类型检查通过；4 项通用 UI、owner/生命周期、最小运行信息和项目目录校验测试通过。
- Web 隔离面板定向 3 项通过。
- Packed archive 在干净 consumer 中安装，用实际 Host React 面板、HTTP 路由、模块调用、普通线程与真实私有存储编码器跑过 19 项浏览器旅程。Redis 传输、成员输出和远端平台仍为替身；界面实际接收异步执行/报告事件，不走专用 diagnostics 回调。

可复现命令：

```sh
pnpm --filter @clowder-ai/plugin-sdk typecheck
node --import tsx --test packages/plugin-sdk/src/public-surface.test.ts packages/plugin-sdk/src/owner-action-context.test.ts packages/plugin-sdk/src/thread-mappings.test.ts
pnpm --filter @clowder-ai/feedback typecheck
pnpm --filter @clowder-ai/feedback test
pnpm --filter @clowder-ai/feedback pack --pack-destination artifacts
# 在配套 Host worktree 中：
pnpm --filter @cat-cafe/api test:plugin-feedback
pnpm --filter @cat-cafe/web exec vitest run src/components/plugins/__tests__/plugin-ui.test.tsx
# FEEDBACK_ARTIFACT / FEEDBACK_NPM_CLI 指向实际包和 npm CLI；可配置现有浏览器位置：
pnpm --filter @cat-cafe/api test:plugin-feedback:installed
```

## 真实验收与生命周期

尚未验证真实 Settings 全旅程、真实配置成员/模型调用、GitHub/GitLab 实际反馈写入及内网组织 CLI。以上替身检查不等于这些场景通过；两个 PR 保持 Draft，未部署、未合入。

本轮临时浏览器服务已停止。实际地址、PID、源码工作区、包 SHA、数据目录及停止回执在 Host worktree 的 `artifacts/feedback-installed/instance-ledger.json`；结果在同目录 receipt 与截图中。未绑定用户原生 HOME，也未修改生产实例、配置、角色、会话或数据库。合成草稿/附件和旧消费者程序保留以供复查，不删除持久数据。
