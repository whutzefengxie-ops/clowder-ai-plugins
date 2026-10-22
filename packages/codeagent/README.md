# CodeAgent

[English](README.en.md)

独立静态 ACP 插件。先在运行 Host 的电脑上安装并登录 CodeAgent，确认启动 Host 的环境能找到 `codeagent` 命令。

1. 在「设置 → 插件 → 从本地目录安装」选择本包目录 `packages/codeagent`，或安装本包打出的 tgz。不要选择整个插件仓库。
2. 启用 CodeAgent 插件。
3. 编辑项目成员，在「使用工具」选择 CodeAgent，保存成员后发送消息。

无需添加预置或保存插件配置。启动命令固定为 `codeagent --acp`；项目目录、当前角色和 Clowder MCP 由 Host 在会话中提供。插件不安装原生客户端、不复制登录凭据，也不代表隔离或限制原生客户端权限。

默认使用 CodeAgent 自身的权限模式。如确需用户明确选择的 bypass 启动，请保留或使用「ACP 客户端目录」中的独立自定义配置：命令 `codeagent`，参数每行一项：

```text
--acp
--permission-mode
bypassPermission
--allow-dangerously-skip-permissions
```

已有 `plugin:official.acp-clients/<固定ID>` 绑定、引导目录和参数不会迁移到本插件，也无需改绑。静态插件引用为 `plugin:official.codeagent/codeagent`。

本包为本地候选，尚未发布到市场。Windows 引导目录策略由 Host 部署配置管理；无法启动时先查看 Host 的引导目录检查结果。目录兼容设置与审计设置相互独立。
