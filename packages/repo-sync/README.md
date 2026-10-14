---
feature_ids: []
topics: [repo-sync, git]
doc_kind: guide
created: 2026-10-12
tips_exempt: 独立内部 Git 接收工具，不接应用 Host；操作说明随本包入口交付。
---

# Repository Sync / 单向 Git 同步插件

## 插件运行与安装边界

插件标识 dev.clowder.repo-sync；候选包 @clowder-ai/repo-sync@0.1.0-alpha.0。独立 manifest 位于 plugin.yaml，协议版本为 0.1.0。兼容宿主通过 configurationFile 指定绝对路径的私有 JSON（可以尚未创建），再启动声明的 stdio MCP contribution，在工作台完成配置。

MCP 只提供 repo_sync_status 和 repo_sync_open_workbench。前者返回受限版本/阶段字段，后者显式启动 loopback 工作台并返回 URL；插件启动不会执行 Git，Agent 没有推送、建单、合入或关单工具。实际同步仍在工作台由用户发起，PR 可通过内置 GitLab v4 兼容 API、平台 Git 扩展或私有命令适配器自动创建，也可明确选择手工方式。CodeHub 经用户实测不支持所用推送创建扩展，应选择 API，在真实平台审核与合入。

私有配置、台账与凭据不在插件安装目录。Git/gh 使用已有认证；配置中的检查命令由用户提供，不能从网页或 MCP 参数更换。关闭 stdio 连接会停止工作台。宿主仍负责进程监督及异常进程树清理；中断后的旧写锁需确认原执行器与子进程退出后再显式恢复。升级或卸载不自动删除用户台账和配置。

源码试用：在插件仓执行 pnpm install --frozen-lockfile，再执行 pnpm --filter @clowder-ai/repo-sync build。正式服务只使用 setup/serve 入口。合成仓库夹具仅供自动化测试，不提供演示服务。

制品安装：在包目录执行 npm pack，将生成的 tgz 安装到独立 consumer（npm install ./clowder-ai-repo-sync-0.1.0-alpha.0.tgz）。安装后的 CLI 是 clowder-repo-sync，MCP 入口是 clowder-repo-sync-mcp。打包白名单包含 dist、web、manifest、图标、README、许可证和 npm-shrinkwrap；开发原型/测试及私有数据不进入制品。

本 PR 提交候选源码和验证。目录 catalog 的不可变 version/integrity 记录需要发布后的精确制品依据；当前尚未正式上架，不声称已在真实 Clowder AI Settings 或内网环境完成安装验收。



支持两种模式：`continuous`（默认）按 main 的实际 PR 落地顺序接收开发过程；`version` 按 tag 接收版本内容并保留声明的内部差异。下面原始对象和 Issue 搬运合同适用于 continuous。version 的内部候选是一次内容更新提交，不要求源 commit 成为内部历史祖先。

外部 GitHub → 内部核心 Git 仓。既有仓库从上次接收的 U0 / 当前内部 I0 登记基线，之后按 main 实际落地范围接收。除显式保留的内部路径外，核心 tree 相同，上游原始对象保留；内部允许初始化衔接和正常接收 merge commit。所有数据保存在操作者指定的私有目录，不写回外部 GitHub。

本包实现真实 Git、持久台账、恢复和 localhost 工作台。代码传输使用 Git；PR 通过内置 API、平台 Git 扩展或私有命令适配器创建。过程模式的 Issue 自动化支持内置 GitLab v4 兼容 API，以及固定 JSON 命令适配器：自动创建或复用、关联具体 PR、合入核验后按条件更新状态并回读。未配置时明确展示人工模式。审核合入仍在平台完成，不自动合入或推 main。

## 启动正式服务

### 使用自己的仓库：空白配置入口

这条入口执行真实 Git，没有预置演示数据或模拟 PR。需要 Node 24+、Git；开发过程模式还需要 GitHub CLI `gh`。本 PR 仍是 Alpha。PR 由所选内置 API / Git 扩展 / 命令适配器自动创建；Issue 由配置的 API/命令适配器自动处理，平台策略与实际构建需使用方验证。

在插件包源码目录执行（路径是示例；配置必须放在所有 Git 工作仓、插件安装与 node_modules 目录之外）：

```powershell
node src/cli.mjs setup "D:/private/repo-sync/config.json" 5220
```

已安装 tgz 的使用方执行 `clowder-repo-sync setup "D:/private/repo-sync/config.json" 5220`。`serve` 也支持这条配置入口。启动只读取本机配置，不执行 Git、不创建演示仓库；首次文件可以不存在。打开终端打印的地址后：

1. 点击**配置真实仓库**，按外部 / 内部两组填写地址与各自分支。Git 读取 / 推送使用本机 HTTPS 凭据管理器或 SSH 密钥；API Token 在专用密码框输入，不能放进 Git 地址。
2. 选择交付方式：**按 tag 更新**生成一个内部同步 PR；**同步开发过程**逐笔搬运上游 PR/Issue/commit。两种模式使用相同文件规则：明确声明完整保留的内部路径，其余核心文件严格一致。保留路径的上游更新也会跳过；插件不进行文件三方合并或在线冲突编辑。
3. 确认 **PR 创建方式**：CodeHub 选择 **CodeHub / GitLab API 自动创建 PR**，并配置下方平台 API；支持 push-options 的其他平台才使用 Git 扩展。填写内部仓库网页地址以核对回执范围。保存后点击**读取两侧当前版本**，用 `git ls-remote` 轻量检查连接、分支与 HEAD，不下载对象。Git 认证需先在本机配置，后台不提供交互式终端；读取成功不证明可以推送或创建 PR。
4. 填写上次已接收的外部 **U0** 和内部当前 **I0**。第一次同步后内部又有专项提交时，U0 仍是当时接收的外部 A，I0 是内部合入分支现在的最新 HEAD，不能填写第一次同步时的内部旧提交，也不能把外部最新 HEAD 当 U0。**读取两侧当前版本**只查询并填入当前 I0，保留 U0，不更新或覆盖内仓。先声明内部保留路径；其他核心文件须与 U0 一致。同一文件有专项改动时，明确整文件内部保留（跳过外部更新），或先通过内部 PR 对齐核心。工具不能从相同内容唯一猜出此前接收版本。
5. 进入工作台：版本模式读取 tag、选择目标版本；过程模式选择目标 tag、完整 commit SHA 或当前最新版本，读取范围内的 PR/Issue 清单，按合入顺序逐笔接收。点击当前步骤按钮继续，程序只推候选分支，不合入 main。
6. API / Git 自动模式在准备步骤推送并创建 PR，取得平台返回地址后直接进入审核；只在明确选择手工模式时，按模板创建并登记链接。在平台审核合入后回来点击**已在平台合入，核验 Git 结果**。版本模式随即完成；过程模式会按配置关联本笔 PR，实际合入核验后按全部接收条件处理关单并回读。首次准备代码时，按同一流程里的说明确认提交消息关单规则；连接页面不要求提前勾选。

同一工作台支持多个同步项目。启动时指定的私有文件对应默认项目，其配置和原台账原位保留，不迁移、不改写。顶部可选择项目、修改名称或新增项目；已启用项目的地址、模式和文件规则仍不可直接覆盖。手工创建的旧配置继续可读，执行策略仍在本机 JSON 中维护。

### 配置第二个项目并选择不同同步模式

1. 在顶部点击 **＋ 新增项目**，填写能区分仓库的项目名称，点击 **创建项目，配置仓库 →**。
2. 为新项目填写自己的仓库地址、分支和 PR 创建方式，选择 **按 tag 更新** 或 **同步开发过程**，保存后核验该项目的 U0 / I0。不会继承前一个项目的地址、文件规则、检查命令或平台凭据配置。
3. 使用 **当前同步项目** 下拉框返回原项目，或选择新项目继续操作。每个项目有独立的基线、目标、历史、Issue/PR 对应与执行记录；查看历史和处理异常都在所选项目的流程中完成。

切换项目会保存该页面的配置草稿，不取消原项目的后台任务；项目选项显示正在执行的状态。每个浏览器窗口的选择由 URL 的 `project` 参数确定，两个窗口可分别操作不同项目，不使用全局选择状态。某项目有运行中或待补存任务时，其自身恢复闸门保留，其他项目可以正常配置和操作。关闭整个服务会处理所有项目的执行器，不能用切换项目绕过原任务的恢复要求。

项目目录位于启动配置旁：`<配置文件>.projects.json` 保存名称与稳定身份；新增项目配置位于 `<配置文件>.projects/<项目身份>/config.json`，其台账位于同一私有根目录下的 `sync-<身份摘要>/`。默认项目继续使用原 `stateDir`（向导原默认位置是 `bindings/<绑定身份>/`）。备份应包含原配置、项目索引、新增配置目录和所有项目台账；不要只复制启动文件。网页不能指定任意存储路径，不提供删除项目或清空台账。

新增请求回执丢失时点击 **查询 / 重试原新增请求**，复用原标识，不重复创建。索引损坏或已登记配置缺失时保留原件并提示恢复，不能当作首次空白配置覆盖；索引正常时仍可选择其他配置完整的项目。同一个已知内部仓库地址和合入分支不能被两个项目重复接管；如使用 SSH/HTTPS 别名，需自行确认没有重复指向同一接收分支。不同内部仓库或分支可以分别配置两种模式。

默认检查只有 `git fsck --no-reflogs`，页面明确显示**Git 基础完整性检查**；它不证明应用可构建或插件兼容。在首次同步前，可在私有 JSON 的 `checks` 添加项目可信 executable / args；网页和 MCP 无法指定执行命令。连续模式须先实测内部平台不会因原始提交消息误关 Issue，再声明 `commitClosureVerified: true`，未声明会阻止推送。

配置保存使用独立单写锁与内容版本校验：并发或旧页面的修改暂停；损坏文件不会被覆盖。若配置锁因进程中断残留，先确认所有使用该文件的执行器和 Git/检查子进程均已退出，再在本机处理 `<配置文件>.lock`；不能在操作仍运行时移除锁。Git 台账锁仍使用下方显式 `unlock` 流程。配置与台账不是跨平台原子事务，当前提供进程中断恢复。

### 连接诊断与执行进度

长操作以任务执行，返回任务 ID 后页面查询原任务。逐步显示 ✓ / ● / ○ / ×、耗时和固定错误原因；对象下载展示 Git 实际报告的接收对象/解析增量百分比，不代表整笔同步的总百分比。成功后的执行记录折叠在当前流程中。刷新页面会续看原任务；启动回执或查询请求超时不会自动再次提交。

发起交付、Issue 映射、保存冲突处理、接收记录和撤销未发布版本也使用后台任务。请求冻结当前仓库绑定、配置版本和适用的交付 / 目标版本；旧页面不能操作另一笔交付。两套工作台实例对同一台账登记任务时只允许一方进入。

如果请求在登记之前就丢失，页面查询原标识后会显示**重送原请求（保持同一标识）**。点击只重送原参数和原标识；已经登记的请求复用原记录，参数变化拒绝。不点击则继续查询。此恢复参数只暂存在当前页面内存，刷新后不猜测或自动重建上一笔请求。

业务结束后仍会等待**保存执行记录**。出现 **TASK_STORE_FAILED / 只补存执行记录** 时，当前执行器保留原结果并阻止新任务：修复文件占用或目录写权限，再点击**只补存原任务记录**。这只保存同一任务结果和索引，不重新执行 Git、推候选或创建 PR。不要在补存前重启拥有任务的服务；如果进程已经退出，需要依据原台账、Git 和平台对象人工核对，不承诺补回已丢失的内存记录。停止不明的任务即使记录保存失败，也继续保留停止不明状态与锁。

主机密钥校验、密钥变化、SSH/HTTPS 认证、仓库不可访问、分支缺失、网络故障、超时、取消分别提示。原始 stderr、命令参数与未经处理的系统错误不进入执行记录和网页。后台默认 SSH 使用 BatchMode=yes / StrictHostKeyChecking=yes；首次主机信任需要用户在终端核对可信指纹后完成。已有 GIT_SSH_COMMAND / GIT_SSH 自定义传输保留，操作者仍负责其认证与交互配置。

默认每侧连接探测 20 秒，每条对象 fetch 10 分钟；其他命令 120 秒。在本地私有 JSON 可设置 `"timeouts": {"probe": 20000, "fetch": 600000}`，单位毫秒，范围 1000～3600000，网页不能修改执行策略。下载前会重新检查两侧连接；保留 Git 对象缓存与完整历史核验，不使用浅克隆跳过祖先检查。

读取 HEAD、读取 tag、登记基线的对象下载和候选准备可取消；后台确认进程树停止后释放锁，取消下载不会继续登记基线。基线原子提交阶段、候选发布/回读与合入恢复不开放用户取消，推送结果不明沿原交付回读。页面导航和查看记录继续可用，修改绑定或重复发起操作暂时锁定。任务记录留在私有台账目录的 operations/，不进入安装制品或公开仓库；同一请求标识复用原任务，参数和配置变化会拒绝执行。

若状态为“停止结果待确认”或执行器已中断，先在本机确认原执行器与 Git/检查子进程已退出，再按上述配置锁及台账 unlock 流程恢复并重启。不会通过超时租约自动接管未知进程。应用的单元测试、构建与插件兼容仍需要用户补充检查，不由连接诊断代替。

## 按版本更新与内部差异

### 文件差异与错误引用的处理

基线失败在当前步骤展示完整文件报告，比较外部已同步 U0 与内部当前 I0，不把 U0 之后的正常外部更新算作内部差异。文件清单默认折叠，支持目录树、全量搜索、分类筛选和每页 50 项；内部保留与未声明的核心修改明确区分。

首次登记前，可逐文件填入内部保留配置草稿，查看两侧文本，再保存规则并重新核验。选择内部保留会跳过该路径的外部更新；不会默认排除所有不同文件。两种模式均如此；未声明的核心差异须修正基线或通过内部修复 PR 处理。已启用规则固定；其他接收仓库或分支的新定制可新增项目并核验其基线。现有接收分支的规则调整仍需先处理未完成交付并核对原台账，不能通过新增项目重复接管或跳过保护。

PR 步骤先明确创建方式，再提供来源/目标分支、候选 SHA、标题和正文。人工登记需要确认已在平台创建并核对分支；没有平台接口时不声称网页存在性已验证。可以在等待审核阶段展开纠错，替换链接或撤销本机引用；要求旧链接仍匹配、候选未改变、内部 main 未前进。旧链接留在审计记录，不删除候选或平台 PR。已合入时先核验 Git 结果，不能重置。Issue 映射也支持候选冻结前、尚无接收记录的纠正；已使用映射不可改写。

自动创建后的引用被你撤销时，旧 Git 回执或适配器查询不会重新登记该链接，也不会创建第二个 PR。当前步骤改为**登记核对后的 PR 引用**：在平台找到已创建对象，核对分支与候选后补登记正确链接。自动查询与人工纠正的引用不同则显示 PR_MAPPING_CONFLICT，保留你的纠正结果，不能用旧回执覆盖。

### 可配置的自动 PR 创建

#### CodeHub / GitLab v4：内置 API 自动创建

用户在 #77 的内网实测确认：对应 CodeHub 有 GitLab v4 API，但忽略 `merge_request.*` 推送选项。此平台使用 **CodeHub / GitLab API 自动创建 PR**；过程模式的 Issue 选择 **CodeHub / GitLab v4 兼容接口自动处理**。版本模式也可以用此方式创建单个同步 PR，不需要启用 Issue。

推荐填写 **Issue 网页链接** 并提供 Token。同域兼容平台会自动推断 `/api/v4` 基础地址及项目路径，页面展示推断结果；无须寻找数字项目 ID。**API 地址**与**项目 ID / 路径**均标为可选，默认折叠在高级设置内。已有高级项目 ID 时 Issue 链接可留空，也可从内部仓库首页推断。

API 和网页不同域，或部署路径无法直接推断时，再展开高级设置覆盖：API 地址是完整 URL（例如 `https://api.example/api/v4`），项目路径是 `team/core`，两者不能混填。API 末尾 `/` 和已编码的 `team%2Fcore` 可规范化；HTTPS 与凭据检查保留。保存失败会标明具体输入框、展开所在区域并定位；普通草稿保留，Token 不恢复。保存后点击 **验证平台接口（只读）** 核对项目和默认分支，这仅证明项目读取，不证明创建权限或业务检查。依据：[GitLab REST API 地址与项目路径编码](https://docs.gitlab.com/api/rest/#namespaced-paths)。

Token 默认在密码框直接输入，只在当前服务内存保留，不写配置、任务、历史、URL 或浏览器草稿；刷新后输入框为空，认证仍在服务内存，服务重启需重新输入。已有环境变量配置继续支持。Issue 与 PR 使用同一个 API 项目和认证；Git 自身的凭据配置仍独立。选择 API 时的私有配置形态示例：

```json
{
  "internalWebUrl": "https://web.example/innersource/team_G/core",
  "pullRequests": {
    "mode": "gitlab", "apiUrl": "https://api.example/api/v4",
    "projectId": "innersource/team_G/core", "authMode": "session"
  },
  "issues": {
    "mode": "gitlab", "apiUrl": "https://api.example/api/v4",
    "projectId": "innersource/team_G/core", "authMode": "session"
  }
}
```

候选通过 Git 检查 / 推送后，内置接口查询同分支的 MR，保存交付创建意图，创建并回读稳定来源标识、分支、实际 head / base、状态与仓库 URL，再进入正常审核。回执丢失后只查原 MR，不重复创建；重复对象、来源标识丢失或 head 变化暂停。旧式 `/merge_requests/N` 与 `/-/merge_requests/N` 均支持关联 Issue。依据：[GitLab MR API](https://docs.gitlab.com/api/merge_requests/)、[项目 API](https://docs.gitlab.com/api/projects/)。

Node 支持相应 API 时，平台客户端在首次请求前合并系统受信任 CA 与现有默认 / 额外 CA，保留 TLS 校验。企业 CA 必须由本机正确安装；较早的 Node 24 可以使用 `node --use-system-ca src/cli.mjs setup ...`。证书链未受信任时显示固定原因与处理方法，不使用关闭证书验证的绕过方式。依据：[Node TLS CA 配置](https://nodejs.org/api/tls.html#tlssetdefaultcacertificatescerts)。

已有 Git 创建意图或平台对象不会因改选 API 被重置；先核对原交付和既存 MR，不能用更换方式重复创建。基础 API 创建的内网证据来自用户测试；本轮作者完整回归使用隔离真实 Git 和 API 夹具，不能代替新版在该 CodeHub 的端到端验收。

#### 通过 Git 推送自动创建（正式向导默认选择）

仓库设置中的 **PR 创建方式 → Git 推送时自动创建 PR** 会将创建动作接入准备同步：检查候选 → 同一次推送触发 PR → 解析服务器返回的具体 PR 地址 → 回读候选 ref → 自动登记 → 等待平台审核。正常路径不填写 PR 链接，也不手工创建。已有基线可在 **PR 自动创建设置** 启用，保持原台账；命令适配器也已接入准备步骤，配置后会自动执行。

```json
{
  "internalWebUrl": "https://internal.example/team/core",
  "pullRequests": {
    "mode": "git",
    "pushOptions": [
      "merge_request.create",
      "merge_request.target={targetBranch}",
      "merge_request.title={title}",
      "merge_request.description={description}"
    ]
  }
}
```

pushOptions 可省略，默认使用上面这组 GitLab 兼容扩展。它是平台对 Git 的扩展，不是所有 Git 服务器共同提供的 PR 接口；实际平台采用其他创建选项时，在私有配置中提供其选项。不支持时明确暂停，不默认改成手工创建。协议依据：[Git push-option](https://git-scm.com/docs/git-push)、[GitLab 创建扩展与正文换行](https://docs.gitlab.com/topics/git/commit/#push-options-for-merge-requests)。正文换行传输为反斜杠 n，参数不经 shell；自动合入、删除分支、跳过 CI 等选项禁止。

创建意图、选项指纹与候选先落盘。服务器回执只提取受内部网页仓库范围约束的具体 PR 链接，不保存原始输出；多个链接、缺失回执、候选变化均暂停。Git ref 回读并不等于平台 PR 属性 API 核验，界面明确标记 Git 回执来源。结果不明时不再次推送同一创建请求；如果平台已经创建，只补登记原 PR 的链接作为异常恢复，不重新创建。

已发布的旧手工候选无法依赖一次无变化 push 触发创建。启用 Git 路径后，工具以同一已检查 commit 新建确定的 `-pr` 分支，保留原分支与审计，再触发创建；不增加提交、不改 main。新分支已存在或当前交付已有 PR/创建意图时，禁止猜测或改写。平台创建配置冻结后不能更换。

#### 固定命令适配器（额外路径）

平台命令适配器是 Git 创建扩展之外的额外自动路径，在本地私有 JSON 配置其真实查询/创建能力后，准备步骤会自动执行。只在明确选择手工模式时引导在平台创建后登记；Git 路径缺少回执或不支持选项时暂停，不自动降级。网页和 MCP 不能设置命令、参数或命令适配器凭据。

```json
{
  "internalWebUrl": "https://internal.example/team/core",
  "pullRequests": {
    "mode": "command",
    "timeoutMs": 120000,
    "find": {"command": "D:/private/platform-adapter.exe", "args": []},
    "create": {"command": "D:/private/platform-adapter.exe", "args": []}
  }
}
```

固定可执行文件通过 UTF-8 stdin 接收 JSON：schema=1、action=find/create、deliveryId、repository、branch、targetBranch、head、base、title、body。不经过 shell，不将正文或凭据放入 argv。适配器可以在内部调用平台 API 或实际 CLI；实现与认证由内部环境提供，不能把 Git 推送当作创建完成。

find 必须完整查询该 deliveryId 对应对象，未创建时返回 JSON null；存在时返回唯一 JSON 对象，包含 deliveryId、branch、targetBranch、head、base、state=open/merged、url。多个对象、关闭状态或属性不符必须暂停。create 以 deliveryId 做幂等键并返回 JSON；调用后程序再次 find，核验全部冻结字段后才登记。

创建前保存意图。超时、输出无效或回执丢失后，重试只查同一交付；查不到不会再次 create，需要在平台确认后登记已有对象。不会自动合入。真实内网协议尚未提供，当前验证的是适配器协议与故障恢复，不能代替该平台验收。

CLI：`create-pr <私有配置>` 查询/创建；`pr <私有配置> <正确链接> [原链接]` 登记/纠正；`clear-pr <私有配置> <原链接>` 撤销本机错误引用。私有配置中指定 internalWebUrl 可限制对象链接属于该仓库；Git 地址与网页地址不同的平台应明确填写。

在私有配置中指定：

```json
{
  "mode": "version",
  "internalPaths": ["internal-docs/", "README.md"]
}
```

仓库地址、分支、`stateDir` 与 `checks` 沿用下方完整配置。尚未登记基线时，也可以在仓库设置选择模式、声明规则；选择保存到该私有目录的 `sync-settings.json`，CLI 重启会回读。模式和规则进入绑定身份，已启用后更换会阻断；另一组仓库可在同一工作台新增项目，拥有独立配置和台账，再选择另一种模式。命令行也可直接使用对应项目的私有配置文件。

- `internalPaths` 保留整个文件或目录，包括内部删除。若已有上游同名文件，之后的上游变化明确标记为跳过；若上游首次新增内部保留路径或出现文件/目录结构冲突，暂停，不能静默覆盖。
- 不支持共同文件三方合并与在线冲突编辑。同一文件需要保留内部改造时，明确加入 `internalPaths`，该文件整份保留；需继续跟随上游时，先在内部以正常 PR 对齐核心范围。不会替用户拼接双方改动。
- 其余文件必须与 U0 相同；禁止通过忽略比较而丢失内部文件。内部后续定制提交必须延续已登记历史且只改允许路径，选择下次版本时核验并冻结。交付期间 main 变化暂停。
- 标签名称、标签对象 SHA 和解析后的 commit SHA 一起冻结；目标必须在已接收版本之后且位于配置的来源分支历史中。标签移动、删除、回退或改写历史均暂停。
- 只生成一个候选内容更新提交和内部同步 PR，不复制 Issue、外部 PR 或上游提交消息。因此 version 不需要 continuous 的 `commitClosureVerified` 声明。两种模式均需要至少一项检查，不自动合入或推 main。
- 合入后核验真实 main 等于已检查候选的文件树、内部祖先和冻结 merge base/head，再原子保存 tag → 外部 SHA → 内部 SHA 并完成，没有 Issue 接收步骤。

CLI 顺序：

```bash
clowder-repo-sync adopt private-config.json <U0> <I0>
clowder-repo-sync tags private-config.json
clowder-repo-sync select-tag private-config.json v2.0.0
clowder-repo-sync start private-config.json
clowder-repo-sync prepare private-config.json
# 自动模式已创建并登记 PR；仅手工模式需要：
# clowder-repo-sync pr private-config.json https://codehub.example/core/pull/501
# 在平台正常审核合入，然后：
clowder-repo-sync recover private-config.json
```

旧配置的非空 `mergePaths` 会报 `UNSUPPORTED_MERGE_POLICY`，原配置与台账保留，不能静默转成保留路径。尚未启用的项目可明确重新选择整文件保留或对齐核心；已有交付先使用原版本处理完成，再按已启用规则的保护流程核对新基线。空数组兼容保留，原有合法绑定身份不改变。

冲突处理可用 `resolve private-config.json README.md internal`、`upstream` 或 `manual merged-readme.txt`。未发布的版本交付可用 `cancel-version` 撤销并重新选择；保留审计，已发布分支不允许撤销。网络结果不明仍先恢复原交付，不能另开重复版本。

## 开发过程：目标边界与内部文件保留

目标 tag / 完整 40 位 commit SHA 是本轮终点。工具读取 U0 到终点之间 main 的实际接受边界，不跳过中间 PR、不截断 PR。每次只准备并创建一个对应内部 PR；本笔合入和 Issue 接收完成后开放下一笔。所选终点、扫描时最新 HEAD 和已接受游标分开显示；完成较早 tag 不会显示为已接收全部最新更新。

```json
{"mode":"continuous","internalPaths":["README.md","README.cn.md","README.en.md","internal-docs/"],"mergePaths":[]}
```

例如外部 README.md 为英文、README.cn.md 为中文；内部 README.md 为中文、README.en.md 为英文，内部没有 README.cn.md。以上规则保留内部三条路径的内容及不存在状态，上游 README 更新不会覆盖或额外新增这些路径，其余核心文件严格跟随每笔 PR。填写仓库中实际路径，大小写敏感，不支持通配符。工具展示上游变化和内部差异，不自动忽略所有不同文件。

规则贯穿基线、候选和合入检查，随绑定固定。已有台账不能静默加入新规则：保留原台账和未完成交付，为新规则使用独立私有配置 / 台账，并登记经过核验的 U0/I0。没有活动交付时，内部仅保留路径的后续提交可以经核验接管；活动交付期间 main 前进仍暂停核对。

原始上游 Git 对象、消息和祖先不改写；额外接收节点使用“上游核心 + 内部保留路径”的文件树。外部原始 SHA 可追溯，内部接收 SHA 另记；不能说每个历史 commit 的保留文件都已改成内部版。仅文档变化的 PR 仍生成接收历史，不静默跳过；平台拒绝无内容差异 PR 时明确报错，不伪造成功。保留文件与上游核心目录冲突时指出路径，发布前停止。

```bash
clowder-repo-sync discover private-config.json tag v2.0.0
clowder-repo-sync discover private-config.json commit <完整40位SHA>
clowder-repo-sync discover private-config.json latest
```

标签对象 / commit 一并冻结，每笔执行和接受前重新验证。目标回退、不在配置分支、位于 PR 中间、标签移动 / 删除均暂停。活动交付存在时不能替换范围。

## Issue 自动创建、关联和关单

在“仓库设置 → Issue 自动化设置”选择实际方式。PR 使用平台 API 或扩展，Git 本身不提供通用 Issue 命令；仅知道平台支持 Git，不能推断 Issue 协议。

GitLab 兼容 API 可直接配置，无需另写适配器：网页链接可生成项目路径，数字项目 ID 是可选的高级配置；Token 可以在专用密码框直接输入，或继续使用环境变量。不要把 Token 放进仓库地址或配置正文。环境变量方式的私有配置示例：

```json
{
  "internalWebUrl":"https://internal.example/team/core",
  "issues":{"mode":"gitlab","apiUrl":"https://internal.example/api/v4","projectId":"team/core","tokenEnv":"REPO_SYNC_INTERNAL_TOKEN","timeoutMs":30000}
}
```

API 权限需支持读写项目 Issue、读取 MR 与更新其关联说明。程序完整查询稳定来源标记，创建后再次查询回读；关联时验证本笔 MR 的 head、源分支、目标分支及原生 related_merge_requests 回读。追加普通关联，不靠来源编号猜测关闭对象。依据：[Issue API](https://docs.gitlab.com/api/issues/)、[MR API](https://docs.gitlab.com/api/merge_requests/)。

其他平台在本机私有 JSON 使用固定命令适配器，可在内部调用该平台真实 Git 扩展、CLI 或 API。网页不能提交 executable / args：

```json
{"issues":{"mode":"command","command":"D:/private/internal-issue-adapter.exe","args":[],"timeoutMs":30000}}
```

适配器从 UTF-8 stdin 读取 JSON：schema=1、operation=find/create/read/link/update、sourceId、key（bindingId + sourceId 的 SHA-256）、repository、issue（来源 title/body/url 等）、internalId（已映射时）、pr（url/head/branch/targetBranch，关联后）、desiredState（update 时 open/closed）。stdout 必须仅返回 JSON `{"schema":1,"issue":...}`；find 未查到时 issue=null，其他操作不得伪造对象。

对象包括 sourceId、key、internalId（字符串）、url、state=open/closed、links 数组；每条关联包括 url/head/branch/targetBranch。适配器必须核验真实仓库、完整查询同一 key、保证 create / link / update 幂等并回读平台。多个对象、身份或属性不符、状态不明必须失败。原始输出、命令参数与凭据不进入公开记录。此处提供真实执行和校验合同；未提供协议的内部平台需按实际扩展接入。

准备阶段先自动创建/复用全部 Issue，再构造、检查和推送候选；具体 PR 取得后自动关联。平台正常审核合入后，点击“已在平台合入，核验 Git 结果”：核心文件树和祖先通过才推进代码游标，随后回读关联与 Issue 状态。关闭关系且所有 requiredTargets 接受后关单；条件不足保持打开（误提前关闭时恢复打开），普通关联保留状态。映射跨多笔 PR 复用，不按外部编号创建同号对象。

创建意图先落盘；回执丢失后只查询原对象，查不到显示 ISSUE_CREATE_RESULT_UNKNOWN，不再 create。关联与状态更新也先存意图，回读原 PR / Issue；更新已生效但回执丢失时只确认状态，不重写。代码已接受后失败保持 CODE_ACCEPTED_PENDING_METADATA，按钮明确“回读并恢复原 Issue 操作”，不再推代码或创建 PR。首次创建意图后适配器与仓库范围固定；配置变化、损坏记录暂停，异常在相应子步骤展示 × 和安全错误摘要。

未配置 Issue 接口时保留明确人工方式，不能显示自动完成。历史分别标记平台回读 / 人工登记，保留原配置指纹、来源、关联与执行时间。真实内部平台的认证、Git 扩展和关闭语义仍需在其测试项目验收；原始提交跨编号误关风险仍由 commitClosureVerified 实测声明阻止推送。


## 接入实际仓库

1. 在核心仓之外保存私有 JSON 配置。下列地址、目录与命令都是示例，需要按内部环境设置；不要提交真实配置。

```json
{
  "sourceUrl": "https://github.com/example/core.git",
  "internalUrl": "git@codehub.example:team/core.git",
  "sourceBranch": "main",
  "targetBranch": "main",
  "stateDir": "D:/private/repo-sync-state",
  "commitClosureVerified": false,
  "checks": [{ "command": "node", "args": ["scripts/check-core-and-plugins.mjs"] }]
}
```

2. 使用 Git 自身的凭据管理和 `gh` 已有认证。外部读取仅使用 github.com 的只读 Git/API；平台 Token 只通过专用密码框或本机环境提供，不写配置、日志、静态 HTML 或带凭据 URL。`checks` 必须使用可信 executable 与 args，不能通过网页提交 shell 命令。检查在冻结候选的隔离工作目录运行；应覆盖核心、实际构建依赖及独立插件，工具核对检查没有修改核心文件或 HEAD。
3. 在测试项目核对内部平台关单行为：推分支、创建 PR、合入；编号不一致、初始化前旧历史、同号无关 Issue、多个交付共享 Issue。证明不会误关后才将 `commitClosureVerified` 设为 true。此声明来自使用方实测，工具不能仅凭 Git 验证平台行为。
4. 以完整 40 位 SHA 登记上次已经同步的 U0、当前内部 I0。I0 必须等于远端当前目标 HEAD；两者在非保留范围一致，U0 在上游交付历史中。接管只登记，不改变 main。

```bash
clowder-repo-sync adopt private-config.json <U0> <I0>
clowder-repo-sync serve private-config.json 5187
```

5. 在界面检查上游更新 → 发起下一笔 → 过程模式自动创建/复用并回读 Issue → 检查候选并自动创建内部 PR → 打开具体 PR 在平台正常审核合入 → 回来核验 Git 结果 → 过程模式按实际接受条件自动更新 / 回读 Issue 并保存本笔记录。只有明确手工模式才需要用模板创建 PR 并登记地址；版本模式不搬运 Issue。

GitHub 发现根据 first-parent main 顺序、commit→PR 查询与实际 merge SHA确定范围，区分 squash/rebase 的实际 main 对象。读取关闭关联和完整 Issue timeline，只有能绑定本笔落地 commit 的关闭事件才视为关闭证据；文本提及仅作普通关联。无法唯一归属主干提交、PR 边界不一致或元数据查询失败时暂停。首版不提供评论、附件、账户、里程碑的全量镜像。

## CLI 与恢复

### SSH 地址与 PR / Issue 网页地址

`internalUrl` 是 Git 克隆地址，`internalWebUrl` 是浏览器中的 HTTPS 仓库首页。例如 SSH 服务为 `ssh://git@ssh.example:2222/team/core.git`，网页可以是 `https://web.example/team/core`。工具不再从 SSH 主机、端口或 HTTPS 克隆路径反推网页来源。生产环境登记对象前需要明确配置网页仓库，之后按 origin 和路径范围核验具体链接。

出现 `INTERNAL_WEB_URL_REQUIRED` 时，在当前 PR 步骤直接填写网页仓库地址并保存，也可进入“仓库设置 → PR 自动创建设置”；不用重建 U0/I0、台账或候选。已有手工引用但缺地址时，保持原创建方式、补填包含该引用的仓库范围；错误引用先撤销，再配置正确范围。自动创建意图已经冻结时禁止更换平台范围。Issue 同样按此网页范围登记。

### Windows 台账保存失败

同一文件的状态读取与原子替换按路径协调；短暂的 EPERM/EACCES/EBUSY 只有限重试文件替换，不重新执行同步或创建 PR。台账、私有配置、模式设置、执行记录均使用同一机制，不通过删除旧文件或截断目标来规避占用。

如果仍出现 `LEDGER_WRITE_FAILED`，当前执行记录会显示“保存交付台账 ×”及固定原因。先关闭占用台账的编辑器/其他工具并核对目录写权限，再刷新回读原台账和 Git。撤销引用保存失败时原链接仍保留，确认状态后可重试撤销；候选与双游标不重置。涉及推送/合入的任务先恢复原交付，避免重复操作。台账本身无法写入时不声称 delivery.error 已落盘；执行记录独立保存，整个目录无法写入时也不能承诺记录持久化。

### 损坏记录与私有目录

已有配置、台账、文件规则和任务必须具有有效对象结构。`null`、`false`、数字、数组等值不是首次空白配置；记录缺少状态、执行器、检查结果或真实接受 commit，以及任务索引指向丢失文件时，暂停并保留原件。先备份，在本机依据原配置、备份和 Git / 平台结果恢复；不要删除台账后重新初始化来跳过报错。

正式 setup/serve、CLI 与 MCP 会核对 `stateDir` 也位于 Git 工作仓、插件安装和 node_modules 之外。已有目录不合规时，先停止所有相关执行器、备份并完整迁移原目录，再更新私有配置中的绝对路径；不要另建空台账代替。测试夹具的 `allowLocal` 是显式隔离测试设置，实际环境不应启用来绕过保护。

```bash
clowder-repo-sync discover private-config.json
clowder-repo-sync start private-config.json
# 已配置自动化时 prepare 自动搬运，也可先执行：
clowder-repo-sync sync-issues private-config.json
# 仅人工方式需要 issue <source-node-id> <internal-issue-id> <https-issue-url>
clowder-repo-sync prepare private-config.json
# 自动模式已取得 PR 地址；仅手工模式需要：
# clowder-repo-sync pr private-config.json <https-pr-url>
clowder-repo-sync recover private-config.json
# 自动方式 recover 已完成状态更新；失败只恢复原 Issue 操作：
clowder-repo-sync sync-issues private-config.json
# 仅人工方式使用 receipts private-config.json observations.json
clowder-repo-sync status private-config.json
```

仅人工方式的观察文件为 `[{"sourceId":"来源稳定身份","internalId":"内部编号","state":"open或closed"}]`。它记录人工回读，不向平台发关单请求；映射不一致、应关未关或提前关闭时暂停。当前交付应写记录成功即 COMPLETE，普通关联或等待后续交付的 Issue 可以保持 open。

恢复始终先查 active delivery。候选推送意图先落盘，超时回读同名 ref：相同则复用，不同则暂停。创建候选分支使用空 expected-ref 条件，竞争写入会拒绝；不会覆盖现有分支。合入后核验 tree、原始目标/上一内部版本/冻结候选的可达性，以及实际接受 merge 的 base/head；核验通过才补写双游标。代码接受后元数据失败，仅补记录，不再推送或合入。工具未请求平台合入，因此“平台合入请求超时”需在平台自行查询；Git 工具负责随后对账。

台账用原子替换保存，单写锁覆盖 Git 和状态操作；不按 TTL 自动接管。旧执行器崩溃后，先核对执行器和它的 Git／检查子进程均已退出，再执行 `unlock private-config.json --confirm-no-writers`；仍存活或 PID 复用时拒绝解锁。这个标志是操作者确认，不是程序仅凭父 PID 推断所有子进程已退出。损坏台账直接暂停，不自动建空台账覆盖。当前实现针对进程中断，不承诺跨系统事务或掉电时所有文件系统的持久性。

## 验证与限制

```bash
node --test packages/repo-sync/test/*.test.mjs
```

Git 路径在虚构仓库验证；真实 CodeHub、审批保护、平台自动关单、实际插件及依赖环境仍需使用方接入验证。首版只支持 Git SHA-1 对象，检测到 LFS 声明或子模块则暂停；不把 Git tree 一致说成应用可运行。配置、台账、原始错误输出和内部对象不能发布到外部 PR/Issue；公开材料只包含源代码、通用合同和合成测试结论。

## 同一笔同步的操作与历史回看

工作台左侧选择“当前同步”或某笔历史；右侧使用同一条五阶段流程：确认范围 → 准备代码 → 发布候选与创建 PR → 内部审核合入 → 核验并保存。每个阶段内展示适用子步骤、执行尝试、时间与安全错误摘要。执行记录不再是独立页或弹窗。

当前详情底部提示下一步，并提供一个主要目标。PR 审核直接跳转已登记的具体平台页面；合入后点击“已在平台合入，核验 Git 结果”。推送 / 创建回执不明时核对原交付；记录保存失败时只补存原记录。历史记录只读，不能通过旧记录启动另一笔操作。

记录可按 tag / PR / SHA、状态和日期筛选；详情按需读取，每页最多 50 个关联任务，更多尝试可在第 5 阶段继续加载。新记录保存来源、U0/I0、候选与接受 SHA、Issue 映射、执行时间以及当时的受限配置摘要。摘要不保存检查命令、参数或凭据；内部 tag 若未创建就明确显示未记录。

已知旧格式以只读方式显示，缺少的配置 / 时间 / 关联不从当前环境猜测；未知格式或损坏记录暂停并保留文件。新执行为仍在进行的旧交付补记实际观察，不能反推它最初的发起时间。查看历史时后台继续执行，完成不会抢走选择。刷新保留历史选择、阶段展开和同一对象的合法表单草稿；冲突草稿只保存在本次浏览器会话中。

窄屏从记录列表进入同页面详情，使用“返回同步记录”返回。原配置与基线入口继续保留，启动不自动查询 Git，也不把未扫描的仓库称为最新。此产品只有正式服务；隔离测试仓与测试平台回执不随安装制品启动。
