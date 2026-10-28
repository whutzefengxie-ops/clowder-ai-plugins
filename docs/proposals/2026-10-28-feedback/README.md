---
feature_ids: [F235, F202]
topics: [feedback, plugins, diagnostics, privacy, issue-provider]
doc_kind: proposal
created: 2026-10-28
---

# 问题反馈插件：设计与实施稿

状态：待体验方向确认。正式插件尚未实现；本目录的交互稿只模拟诊断与发送。

## 原始诉求与已确认决定

2026-10-28 用户要求：插件放在 plugin 仓库，入口在左侧栏下方；支持标题、内容、图片直接转 Issue，以及更推荐的“分析并上传”。后者由本地 Agent Client 结合项目日志和环境生成脱敏报告。插件须提供排查指导／prompt；外网 GitHub、内网 GitLab 或 CLI 可配置，不能与业务代码耦合。

用户已确认：使用 **Clowder 已配置的 Agent Client**。首次方案中的上传确认流程，被同日的下述评审调整取代。

2026-10-28 用户评审调整：内网可能不能用 API／CLI 创建 Issue，报告之后改为“手动创建”，tip 为“跳转到具体 Issue 页面，然后手动粘贴问题并创建”；标题改为感谢反馈／共同建设、详细报告有助于解决问题；增加可见步骤；取消中央演示首页，只保留左侧栏按钮。手动路径成为本稿默认，自动提交保留为部署配置支持的另一种交付能力。

Before：用户凭现象手写 Issue，维护者再往返索取环境、时间、日志和复现信息。
After：用户描述问题并选择材料，已有 agent 辅助形成可审查报告；复制标题／报告，跳转到配置的 Issue 页面手动粘贴、添加截图并创建。agent 不可用时可跳过分析；支持自动提交的部署可另行启用自动交付。

## 当前源码与复用边界

插件仓基线：`zts212653/clowder-ai-plugins@37c14017c257ad106dc60c285fabf2d00fd61aeb`。
宿主只读基线：`clowder-ai-main@44fb36e65b3a9ea4ebb9a9a875e0605c06f80289`。这不是已部署 runtime 的版本声明。

| 已核实位置 | 事实及本次处理 |
| --- | --- |
| Host `packages/web/src/components/shell/WorldRail.tsx`、`ActivityBar.tsx` | 两套真实侧栏均有底部区域；入口应进入这两处，不能只做一种 shell。 |
| 插件 `packages/plugin-contract/src/schemas/manifest.schema.json` | 尚无通用侧栏入口或任意面板 contribution。本次需要增量公开契约，不能假称只装新包就已有入口。 |
| 插件 `docs/plugin-development.md`、`packages/plugin-sdk/src/module-host.ts` | 已有 members、threads、messaging、storage、streams。诊断优先复用普通线程与 send+wake，不新建模型／CLI 调用系统。 |
| 插件 `packages/github-operations/src/native-issue-drafts.ts` | 已有草稿 CAS、目标 allowlist、发布前脱敏、publishing 持久日志、结果不明只查找原单的规则；可借鉴并抽取合适公共代码。 |
| Host `docs/features/F235-feedback-to-community-publisher.md` | 已有社区发布目标；本次是 F235 的新插件入口与诊断路径，关联 F202，不重复立一个同义发布体系。 |
| Host `packages/web/src/components/rich/CommunityPublishFlow.tsx` | 现有卡片只创建 GitHub 草稿，且依赖 GitHub 插件；不足以承担独立、无 agent 的兜底表单。保留现有行为。 |
| Host `packages/api/src/infrastructure/logger.ts` | API 日志根以实际 `LOG_DIR`／启动工作目录解析；不能根据源码目录猜用户安装版的日志位置。 |
| Host `desktop/service-manager.js` | Desktop 按实际 userDataDir 设置 API 日志目录；诊断必须通过宿主获得当前实例的来源事实。 |

Architecture cell：`plugin` + `community-ops`；Host 保有导航、用户／项目／调用身份、成员及运行事实；反馈插件保有报告、诊断流程、平台适配与回执。
Map delta：需更新两 cell 的真实代码锚点；新增通用 UI contribution 和有界诊断材料读取契约。此处的接口名称均为提案，不是现有 API。

## User Journey

Scope unit：当前安装实例中、当前用户的一份反馈草稿。项目／诊断线程／外部 Issue 各自有身份，不互相冒充。

1. 点击左侧栏底部“问题反馈”图标，打开表单；当前对话留在原处。
2. 填标题和问题描述，可补“如何发生、预期结果、发生时间”，选择截图并逐张预览／移除。
3. 表单始终显示目标平台、仓库与可见性；未知可见性不能显示“私密”。提醒不要填写密码、密钥及业务隐私。
4. 主按钮“分析并生成报告（推荐）”；辅助按钮“跳过分析”。后者只整理用户填写内容，不读取日志，也不依赖模型、诊断线程或 GitHub Operations 插件。
5. 分析路径先选择已有本地 client 对应成员、项目和有界材料范围。说明 client 可能连接远端模型；展示实际模型提供方，未知时明确未知。明确分析输入会去哪里、最终 Issue 会去哪里，两次外发不能混为一谈。
6. “开始分析”后展示当前阶段、材料覆盖、超时／取消与返回的诊断对话链接。agent 只有诊断／保存候选报告能力，没有发布权限。
7. 展示可编辑脱敏正文、附件缩略图、脱敏摘要、事实／推测／未验证。提供“复制标题”和“复制报告”；用户可删改并检查图片。目标 Issue 页面地址独立配置，不能把报告／标题编码进跳转 URL。
8. 主操作为“手动创建”，tip：“跳转到 Issue 页面，然后手动粘贴问题并创建”。打开配置的页面，由用户粘贴标题／报告、另行添加截图并点击目标平台的创建按钮。原反馈窗口保持内容，并明确“Issue 尚未提交”；打开页面不能被记为 `published`。
9. 分析失败保留表单，提供重试分析或跳过分析。目标页面未配置／地址不安全时引导配置，不能假跳转；复制失败允许手动选中文本。手动路径无需 API token 或连通性检查，登录在目标网页完成。

模态框内展示 4 步：**填写问题 → 补充分析 → 检查报告 → 手动创建**。当前步骤用文字与 `aria-current` 标出；跳过分析则第二步显示“已跳过”；分析失败／取消停留第二步，可重试。跳转后第四步显示待用户完成，不伪称建单完成。

标题：“感谢你的反馈，一起共建项目”；说明：“提供更详细的分析报告，帮助我们更快定位和解决问题。”反馈入口只占侧栏底部一个按钮，不新增主界面推广／说明页面；中央工作区保持空白预览，不承载本功能内容。

体验稿覆盖：真实 WorldRail／ActivityBar 底部入口、空白中央工作区、四步流程、表单、截图选择、分析范围、报告编辑、真实复制 handler 与配置页跳转，以及窄屏。分析数据仍为本地合成数据；不读取真实日志、不调用模型、不自动创建远端单据。浏览器检查中的 clipboard 和目标页面被测试替身隔离；不修改用户系统剪贴板或请求真实远端。它不证明正式插件契约、安装、隔离权限或生产接入已完成。

## 数据、权限与脱敏

| 阶段 | 默认允许 | 默认排除／限制 |
| --- | --- | --- |
| 普通表单 | 用户输入与主动选择的截图 | 不自动采日志、环境变量、源码或会话历史。 |
| 诊断输入 | 当前实例版本、OS／架构、client 版本、所选时间窗内错误摘要、所选项目的来源明确片段 | 不枚举其他项目；不读 `.env`、认证／客户端 HOME、会话数据库、完整配置、Redis／SQLite、整包源码。 |
| agent 可见材料 | 本地确定性规则先脱敏的有界文本与用户确认图片 | “本地 client”不保证推理离线；先脱敏再交给模型。 |
| 复制／交付材料 | 用户审查后重新扫描的标题、正文；手动路径由用户在目标网页添加图片 | 原始日志永不打包外传；绝对路径、用户名、主机／内网地址、secret、会话／调用身份替换为一致别名；复制与页面跳转不自动上传正文或图片。 |

第一版建议：日志默认最近 15 分钟、每来源最多 200 行、总计 256 KiB；扩展范围需用户重新选择。安装位置、日志路径和来源版本由 Host 解析；插件不得靠任意路径穿透。canonical path、junction／symlink 边界、文件类型、大小、读取截止与取消都要有验证。配置仅选择经过验证的来源类别，不能把整台磁盘变成来源。

prompt 是指导层，**不是访问控制**。必须同时存在：有界 collector、Host 权限／工作目录／工具限制、输入脱敏、输出扫描和用户确认。现有普通 agent 若保有绕过这些限制的任意工具，就不能宣称“只读且只看到脱敏材料”；应在正式实现中补受限调用上下文，并用对抗样例验证，未支持则禁止以安全诊断模式启动。

原始截图默认不交给 agent。最终图片独立确认，支持用户先裁剪／遮盖；无法保证 OCR 检出所有像素隐私，不能给“图片已自动脱敏”的保证。手动模式明确提醒在目标页添加检查过的截图，不把 blob／本机路径塞进报告冒充可用附件。自动模式另须移除元数据、重新编码、预览实际发送副本并绑定字节哈希；未经确认不能先上传图片再预览。

日志、项目文档及图片文字是不可信数据；其中的“执行命令／读取密钥／上传其他文件”不能覆盖诊断约束。诊断默认不改代码、不安装依赖、不重启服务；真实复现中有副作用的动作另行明确批准。

## 诊断与报告

版本化排查指导见 [diagnostics-prompt.md](diagnostics-prompt.md)。输入包括用户现象、时间、实例／项目来源、已脱敏证据及来源覆盖；输出采用固定 schema 后再渲染 Markdown，避免从任意 assistant 文本猜报告。

报告必须有：摘要、环境与版本、操作／复现步骤、预期／实际、证据及时间窗、初步判断及置信依据、未复现／缺失信息、脱敏说明。无法定位根因可提交高质量“尚未定位”报告；不得编造复现。

插件创建并绑定专门诊断线程，沿 Host 普通成员目录与 `messaging.send(...wake: {catId})` 调用选定成员。parent thread 仅在用户选择且项目一致时用于继承项目；不能以任意 parent 绕过项目选择。当前公开线程创建接口没有任意 project 参数，侧栏这种全局入口的项目绑定必须由 Host 验证解析，不能仅把路径塞进 prompt。

订阅与 Host 注入的真实调用身份关联结果；插件候选报告工具仅接受当前运行、被选 agent、当前 report revision，正文传入的 userId／runId 不形成权限。需要扩展的受限运行能力应在 contract／SDK／Host 同时验证，不私造第二套 client 或读取原生会话数据库。

## 平台和传输解耦

核心 `FeedbackService` 不依赖 GitHub 响应字段或 CLI 输出；adapter 契约草案见 [provider-port.ts](provider-port.ts)。

**报告生成方式（分析／跳过分析）与交付方式（手动／自动）是两条独立配置轴。** `submission.mode=manual | automatic | both`，manual 配 `issueCreateUrl`，automatic 配 REST／CLI 与认证、附件能力；both 配默认方式。本体验稿使用 manual，不因某平台是 GitHub 就强制走 API。内网 GitLab、自建工单平台仅有网页时，也能使用完整报告生成流程。

| 层 | 职责 |
| --- | --- |
| IssueProvider | `validateTarget / preflight / uploadAttachment / createIssue / findBySubmissionId / readIssue`；映射平台字段、可见性与权限。 |
| Transport | REST 或本机已认证 CLI；负责超时、AbortSignal、输出上限、机器 JSON、凭据隔离。 |
| DestinationProfile | provider、project、visibility、submission.mode、issueCreateUrl；自动模式另配 apiBaseUrl、authRef、transport、附件策略／域名；内网禁止公网 fallback。 |
| ManualHandoff | 验证配置的 HTTP／HTTPS 无内嵌凭据页面地址及组织域名策略，复制标题／报告，交由 Host 打开目标页；不请求创建 API，不把正文拼入 URL，不冒充创建回执。 |
| DiagnosticRecipe | 版本化 prompt、采证类别与限额、报告模板、组织脱敏策略；替换 recipe 无需改发布流程。 |

拟定自动提交适配：GitHub REST／`gh`，GitLab REST／`glab`。另提供可替换的组织 CLI adapter，其进程通过约定 JSON stdin/stdout 协议交互，`shell:false`、固定 executable／argv、有限 env、超时／退出码／进程树监督。不能让用户输入一整行 shell 模板，更不能拼接标题／正文进命令。它们的可用性不影响手动创建路径。

自动模式配置只引用明确 secret store 条目或 CLI 已有登录态；连接测试展示实际登录身份、精确目标、可见性与能力。手动模式不要求这类 API 凭据，用户在目标网页登录并创建；插件无法验证目标页结果时保持 `page_open_requested`，可以接受用户补充 Issue 链接，但自报链接不能直接当作已核验远端事实。

自动模式仍须解决附件交付：GitHub 创建 Issue 的公开 REST 接口不能直接充当截图上传接口；GitLab 有独立 Markdown uploads 接口。配置并验证附件 adapter 后才能启用带图自动提交，不能静默丢图或隐式用公开图床。**手动模式不依赖这条上传链**：提示用户在目标 Issue 页添加图片，并由目标平台处理附件；完整验收须走到用户实际粘贴、添加图片并创建的结果。

官方依据（核对日期 2026-10-28）：[GitHub create issue](https://docs.github.com/en/rest/issues/issues#create-an-issue)、[gh issue create](https://cli.github.com/manual/gh_issue_create)、[GitLab issues](https://docs.gitlab.com/api/issues/#new-issue)、[GitLab Markdown uploads](https://docs.gitlab.com/api/project_markdown_uploads/)、[glab issue create](https://docs.gitlab.com/cli/issue/create/)。部署支持的具体版本和权限须实测。

## 状态与并发

持久主记录由插件私有 storage 持有，以 CAS revision 更新；用户／安装归属由 Host action context 取得，不接受前端冒充。原始材料引用与对外报告分开保存，持久数据不随停用／卸载清空。

- 草稿：`editing → collecting → analyzing → review_ready`；跳过分析为 `editing → review_ready`。分析失败／取消保留编辑稿，晚到结果因 run generation 失效不能覆盖。
- 手动交付：`review_ready → page_open_requested`。复制／跳转都不改变为 published；目标页面未打开可重试跳转，原稿始终可回到检查阶段。四步 UI 仅投影已有草稿和交付状态，不另存一套业务状态。
- 以下为可选自动发布合同：`idle → confirming → submitting → published | submission_unknown | rejected`。状态与诊断运行分别记录，互不隐式回退。进程崩溃后 `submitting` 按 `submission_unknown` 处理。
- 每次确认绑定 owner、installation、destination config revision、report revision、正文摘要、附件清单与字节哈希。编辑、换目标、改可见性或换图使旧确认失效；agent 不能制造确认。
- 外发前持久记录 submissionId 与内容摘要；双击、多窗口、重启仅产生一次有效 create 尝试。不是所有平台都有原生幂等，不能承诺网络意义 exactly once。
- 附件上传也是外部副作用：按 submissionId+hash 保存回执，结果不明停止并核对；部分上传成功而建单失败时保存具体对象，不能自动反复上传或擅自删除远端对象。
- 创建超时／响应丢失后只查原单；无可靠查询能力则保留 unknown 供人工核对。不能把“搜索没找到”当作允许再 POST 的充分证据。
- readback 必须核对目标、标题、正文、附件引用及远端可见性；创建已成功但回读失败须显示已创建待核验和真实链接，不能创建第二张单。

## 实施工作单元

| 单元与改动位置 | 可观察结果 | 验证 |
| --- | --- | --- |
| 1. F235 delta 与通用 UI 契约；Contract schema／types／fixtures；Host `WorldRail`、`ActivityBar`、installed inventory 投影 | 安装且启用的插件经受限声明贡献底部入口；停用隐藏入口，运行中报告保留；旧 Host 拒绝不支持声明 | schema／类型生成一致性；两 shell 与窄屏默认入口浏览器旅程；未知声明、失效实例、恶意图标／action 被拒绝 |
| 2. `packages/feedback` 独立包、配置、私有草稿及通用表单／报告 surface | 无 agent／无 GitHub Operations 插件仍可填单、选图、预览、保存与恢复 | 新输入 sentinel、刷新恢复、跨用户／实例访问拒绝、附件边界、取消不丢稿 |
| 3. collectors、recipes、sanitizer 与 Host 受限诊断上下文 | 当前真实实例的有界脱敏材料进入所选已配置 client，结果回同一草稿 | 路径穿透／junction／secret／prompt injection 对抗用例；取消／超时／停用／项目变化拒绝晚到结果 |
| 4. manual handoff、provider port；可选 GitHub、GitLab 和 JSON CLI adapter | 仅配置网页即可手动交付，不要求 API token；自动通路与平台独立配置 | 复制失败／成功、URL scheme／凭据／域名检查、报告不进 URL、截图另行添加；自动通路再做 fake HTTP／CLI 检查 |
| 5. 四步进度与交付状态；可选自动发布 journal | 用户看清当前步骤；跳过／失败／返回不乱序；跳转不能显示已发布 | 默认路径与跳过分析；未知／未配置页面、重开窗口、修改旧确认失效；自动模式另测并发 CAS 与 POST 响应丢失 |
| 6. 真实安装与发布闭包 | 从最终 packed 包安装，走跳过分析与真实 agent 分析，再在 GitHub／内网网页手动完成建单 | fresh consumer、真实粘贴与截图、诊断隐私抽检、启停／升级保留状态；启用自动模式时另验上传和远端回读 |

行为实现按 RED→GREEN；插件仓已核实命令为 `pnpm typecheck`、`pnpm conformance`、`pnpm gate:ci`、`pnpm pack:gate`，新增包后添加该包 `test/typecheck/build` 并确认 filter 命令可执行。宿主按实际 package scripts 运行 `pnpm check`、`pnpm lint` 与所改浏览器旅程；本设计文档不声称这些产品检查已通过。正式提交需非作者独立审查，重点是输入／输出外发、确认真实性和 unknown 恢复。

## 验收和回退

- 无 agent 时可跳过分析，复制填写内容并前往配置网页；由用户粘贴并添加真实截图创建 Issue。
- 分析路径使用用户已有 client，给出来源、环境、证据、未决点；标题、正文、复制内容一致，手动粘贴后与目标页面内容核对。
- 日志／配置 canary secret 不进入模型输入及外部请求；图片只发送审查后的字节；内网模式没有公网流量 fallback。
- 两种 shell 底部入口、默认页、窄屏、分析失败、无认证、超时不明、草稿恢复均有实际路径证据。
- 打包安装、升级与停用保留报告与回执；回退 Host／插件版本不清理认证、会话或原始业务数据。

上线前 No-Go：受限 agent 可绕过材料边界、确认可由模型伪造、内网外发 fallback、报告拼进跳转 URL、跳转冒充已建单、最终 packed 包未安装验证；自动模式另有图片链未验证、未知结果盲重发门禁。关闭入口／停用插件可停止新工作；用户已在目标平台提交的 Issue 无法通过回退代码撤回，必须如实记录。

## 当前交付边界

本轮提供可评审设计、prompt、provider port 草案与隔离体验稿。未发布插件、未改变 runtime、未读取用户真实诊断材料、未创建外部 Issue。体验方向尚未获得用户对具体稿的确认；源码技能要求“UX 没确认，不准进入正式产品实现”，先请用户评审实物，再实施公开契约和正式业务。

体验入口：[本机预览](http://127.0.0.1:5187/)。复现命令、逐项证据和保留回执见 [verification.md](verification.md)。
