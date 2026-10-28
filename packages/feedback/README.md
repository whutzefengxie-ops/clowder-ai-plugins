# 问题反馈插件

[English guide](README.en.md)

从左栏底部进入，填写标题、现象和截图。推荐“分析并上传”：选择 Clowder 中已配置的本地 Agent Client，先检查脱敏材料，再生成可编辑报告。直接提交不依赖 Agent。两条路径都需要检查报告、截图、目标可见性并确认。

自动提交成功会返回平台实际创建的 Issue 链接，并回读标题和完整正文。手动创建始终保留为兜底，跳转地址不携带标题或正文；字段旁可复制标题、报告，每张图可复制 PNG 或下载原图后上传。

## 安装与宿主要求

需要支持 `ui` command、`activity-bar.bottom` 和可选 `diagnostics` 的宿主。此包是候选实现，尚未加入发布目录或默认安装列表；旧宿主不会显示侧栏入口，需要与宿主配套 PR 一起评审。

```sh
pnpm --filter @clowder-ai/feedback build
cd packages/feedback
npm pack --ignore-scripts
```

将生成的包通过插件设置中的本地包安装入口安装，保存配置、测试后启用。提交日志使用宿主按安装实例隔离的私有 CAS 存储；图片按 SHA-256 保存在宿主提供的 dataPath 中，避免占用单值 1 MiB 的日志预算。业务数据保留；停用、升级与卸载不会由插件删除草稿、图片或提交回执。

## 目标配置

默认目标是公开的 `zts212653/clowder-ai`。GitHub 自动提交需要 `githubToken`；GitLab REST 使用 `gitlabToken`。令牌只存于宿主 secret 字段，不要放入 JSON 或命令参数。

`destinations` 可配置多个目标，用户在表单选择。每次修改配置需递增 `revision`；所有配置字节和报告、图片摘要都会绑定到确认，改变后旧确认无效。内网目标不会降级调用公网。

```json
[
  {
    "id": "internal", "label": "内部反馈", "revision": 1,
    "provider": "gitlab", "mode": "both", "project": "team/clowder-ai",
    "apiBaseUrl": "https://gitlab.example.test/api/v4",
    "issueCreateUrl": "https://gitlab.example.test/team/clowder-ai/-/issues/new",
    "visibility": "private", "attachmentOrigins": []
  }
]
```

只支持网页创建时将 `mode` 设为 `manual`，无须 API 凭据。保留完整的目标配置便于后来切换自动通路。`visibility` 可用 `public`、`private`、`unknown`；自动通路要求实际可见性与配置相同，未知时先人工核对。

## 图片交付

最多 4 张 PNG/JPEG/WebP，单张 4 MB、总计 8 MB。图片在本地解码为 PNG，服务端再次去除元数据；预览和哈希对应实际发送副本，图片不交给模型。原图独立保留用于本地下载，可能包含元数据，不会自动上传。文字脱敏无法覆盖图片中的隐私，用户必须先裁剪、遮盖并检查。

GitLab 使用项目 Markdown 上传接口，上传后回读实际字节并核对 SHA-256。公开项目的上传文件可能通过直接地址访问，不能把 Issue 保密状态当作附件隐私保证。

GitHub Issue REST 没有本插件可直接使用的图片上传通路。带图自动提交需要配置 `attachmentCommand` 和 `attachmentOrigins`，使用组织批准的附件存储。无适配器时，界面保留报告和图片并指向手动创建；无图自动提交仍可使用。不能上传本机 `file:`/`blob:` 地址或把图片遗漏后宣称提交完成。

```json
{
  "attachmentCommand": { "executable": "C:\\tools\\feedback-attachments.exe", "args": ["--json"] },
  "attachmentOrigins": ["https://attachments.example.test"]
}
```

上面字段加在完整目标对象内。上传请求仅包含已确认 PNG 发送副本的字节；原图旁路字段不会传给 CLI；回执必须提供 `url`、`sha256`、与目标相同的 `visibility`。地址必须属于允许源，远端字节回读一致后才关联到报告。需要身份才能下载的独立存储可通过组织适配器统一实现；当前通用附件命令回读按无凭据 HTTPS 请求进行。

## 组织 CLI / glab 适配

将 `provider` 设为 `organization-cli` 并提供 `command: { executable, args }`。程序可包装现有 `glab`、内部命令或网关 SDK。业务代码不依赖命令名称。仅设置固定可执行文件与参数，不使用 shell 字符串，也不要将用户输入插入参数。

进程从 stdin 读取一份 UTF-8 JSON，向 stdout 输出一份 JSON；stderr 不展示给用户。协议为 `clowder-feedback/v1`，30 秒超时，输出上限 2 MB；进程仅继承系统路径、临时目录与原生认证所需的 HOME 目录变量，认证由适配器自己的凭据库负责。

```json
{
  "protocol": "clowder-feedback/v1", "op": "create",
  "target": { "id": "internal", "project": "team/clowder-ai", "apiBaseUrl": "https://gitlab.example.test/api/v4", "visibility": "private" },
  "payload": { "submissionId": "uuid", "title": "title", "body": "approved markdown including marker" }
}
```

| 操作 | 请求 payload | 返回 |
| --- | --- | --- |
| `preflight` | `{}` | `principal, project, visibility, canCreate, attachments` |
| `upload` | `submissionId, attachment`（含 base64、mime、sha256） | `url, sha256, visibility` |
| `create` | `submissionId, title, body` | `id`/`iid`/`number`, `url`, `title`, `body`/`description` |
| `read` | `id` | 同 `create` 的实际远端内容 |
| `reconcile` | `submissionId` | `{ issues: [...] }`，必须保留正文中的提交标记 |

创建回执必须返回真实 Issue 编号和目标项目内的实际链接。CLI 成功退出、打开浏览器、返回预览地址都不构成发布完成。

## 诊断与隐私边界

排查配方在 `src/recipe.ts`，版本 `feedback-diagnosis/1`。宿主仅采集系统/Node 摘要和当前实例最近 15 分钟、有界的结构化 warning/error；没有记录会明确显示缺口。不会遍历源码、认证、完整配置或会话数据库。

本地 Client 可能使用云端模型。插件先确定性替换敏感字段、用户路径、邮箱、地址和身份标识，展示完整材料、实际账号和模型目的地并征求确认，再调用已配置服务与账号；无法解析的原生目的地明确标注未知。确认绑定 Client/账号/目的地快照，配置变化须重新确认。诊断使用临时空目录、只读策略、禁用工具、禁用原生会话持久化；不续接业务会话。结果再次脱敏，事实、推测和未验证事项分别报告。规则无法保证识别任意业务秘密，最终仍需用户检查。

上传前先持久化 `writing` 状态。网络超时、进程退出或回读不一致会保留 `unknown`，只能核对远端，不会自动重发。查不到结果不代表未创建；人工核对前不建议手动再建。已取得真实链接但回读失败时，显示“已创建，待核验”和链接。附件逐张记录回执，明确尚未进入建单阶段的失败可保留回执后返回编辑，不会自动重传。恢复核对最多查看最近 100 条 Issue；无法找到唯一标记时保持待核对。

## 验证

```sh
pnpm --filter @clowder-ai/feedback typecheck
pnpm --filter @clowder-ai/feedback test
pnpm --filter @clowder-ai/feedback build
```

单测使用合成日志、测试凭据和远端替身；真实模型、GitHub/GitLab 写入及企业附件适配器需要在目标环境按实际配置验收，不能用这些测试代替。
