# CodeAgent

[English](README.en.md)

独立、纯声明的 ACP 插件。先在运行 Host 的电脑上安装并登录 CodeAgent；插件不安装原生客户端、不复制认证和历史。

1. 在「设置 → 插件 → 从本地目录安装」选择本包目录 `packages/codeagent`，或安装本包打出的 tgz。不要选择整个插件仓库。
2. 启用 CodeAgent 插件。
3. 编辑项目成员，在「使用工具」选择 CodeAgent，保存成员后发送消息。

默认直接使用 `codeagent --acp`，无需添加预置或保存空配置。一个工具可供多个成员选择，名字、职责和会话各自独立；项目目录、当前角色和已授权的 Clowder MCP 由 Host 提供。

特殊路径或参数在同一插件的配置中保存，不能修改包内 JSON：

- 可执行文件：默认 `codeagent`。在 Host 的 PowerShell 用 `Get-Command codeagent -All | Select-Object Source` 查找真实路径；路径在 Host 电脑上，不在远程浏览器电脑上。含空格的路径直接填入，不额外加引号。
- 启动参数：每行一项，默认 `--acp`。
- 引导目录：默认自动选择；失败时用该字段的“检查”入口验证 Host 电脑上的本机绝对路径。它是 Host 创建专用启动文件的目录，不是 CodeAgent 安装目录或项目目录。检查可能创建私有子目录；不修改系统盘或祖先 ACL。
- 客户端权限请求：默认 `deny`。当前匹配 Host 尚无 ACP 交互审批；如需自动允许，必须明确选择 `auto_allow`。这不扩大 Clowder MCP 授权，也不改变 Host 引导目录策略。

这些连接设置由 Host 在当前项目中持久保存，影响引用此插件的成员后续执行；重启无需重填，升级不覆盖。原生 CodeAgent 的账号、端点、模型、证书仍按其已有配置解析，不在插件里复制一份。

例如路径覆盖的存储值为 `{"command":"D:/Tools/CodeAgent/codeagent.exe"}`，未覆盖字段跟随插件默认值。贡献 ID 固定为 `codeagent`，不能随角色、名称或路径改变。

默认参数不启用 CodeAgent 原生 bypass。如确需用户明确选择的 bypass 启动，可在上述参数字段保存，每行一项：

```text
--acp
--permission-mode
bypassPermission
--allow-dangerously-skip-permissions
```

原生 bypass 参数与 Host 的 ACP 权限响应是两个设置；都按实际需要明确选择。当前声明不支持任意环境变量；不要把企业密钥放到参数或插件包中。

已有 `plugin:official.acp-clients/<固定ID>` 或 native 绑定、引导目录、参数和历史不会迁移到本插件，无需强制改绑。本插件引用为 `plugin:official.codeagent/codeagent`。停用会阻止该绑定的新调用，保留角色和配置；重新启用可恢复。错误配置先在同一入口修正保存，再重试，不需卸载重装。

版本 `0.1.0-beta.2` 需要支持“固定 ACP 声明 + configurationKey 连接覆盖”的 Host（配对分支 `feat/codeagent-plugin-extension`，基于角色重构 `99d68baa8`）。仅支持旧静态声明的 Host 不兼容这个版本，不能忽略报错后继续使用。公开稳定契约尚未发布，本包不宣称已在市场上架。

Windows 引导目录信任与受限审计恢复由 Host 部署策略管理，插件不能放宽。`strict` 默认仍要求可信祖先；内网发行可一次选择 `trusted-host`，同时保留目录自身私有权限。审计放宽只覆盖 Host 验证通过的真实 root-only 变更；命令、参数或权限变更仍要求可用审计。

工程验证须覆盖实际 tgz 的文件闭包及 Host 安装/注册/配置/恢复；协议 fixture 不代表真实模型。真实企业 CodeAgent 的版本、登录、MCP、协作和重启结果由内网现场单独验收。
