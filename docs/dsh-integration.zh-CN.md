# Prism 接入 DeepSeek Harness

**English: [dsh-integration.md](./dsh-integration.md)**

Prism 本身就是一个 MCP server，而 DSH 自带 MCP 客户端，所以这套集成的本体是一个
**纯配置的 bundle**，外加一个 UI 面板。bundle 位于 [`dsh-plugin/`](../dsh-plugin/)。

## 你会得到什么

| 部分 | 效果 |
|---|---|
| MCP 连接 | Prism 的 42 个工具与 4 个 resource 可以按 `mcp__prism__<tool>` 调用 |
| 左侧栏面板 | 侧边栏图标栏里多出 **Prism Preview** 入口，点开是主区的预览面板 |
| 右栏页签 | 同一个面板也能作为右栏页签打开，入口是该栏 guide（也就是它的 **「开始」** 标签页） |

## 安装

这个插件是**自包含**的：它自带要拉起的 MCP server（`dsh-plugin/server/`，由
`dsh-plugin/scripts/copy-server.mjs` 打包），所以安装它不需要 Prism 仓库的任何东西。

安装走 `plugin_manager`；**不要手工编辑** profile 的 `package.json` 或
`cordis.patch.yml`。

- 从检出安装：`plugin_manager` · `action: install_bundle` · `target: D:\Prism\dsh-plugin`
  —— 先打包服务器：`npm run build && node dsh-plugin/scripts/copy-server.mjs`
- 从 npm 安装：`plugin_manager` · `action: install_bundle` · `target: dsh-plugin-prism-design`
  —— [npmjs.com/package/dsh-plugin-prism-design](https://www.npmjs.com/package/dsh-plugin-prism-design) · `dsh plugin add dsh-plugin-prism-design`

然后确认它已生效：

```
plugin_manager · action: list_bundles      # bundle 出现在列表里，application: applied
```

`application: applied` 表示每一行都激活了。两行是**各自独立失败**的，所以警告会明确
指出是哪一行没起来（见[故障排查](#故障排查)）。

重新应用 bundle（或为了加载改动过的 Client 半区而开关一次）会重建 MCP 那一行，也就是
重启 Prism 进程。`PRISM_AUTOLOAD=off` 时内存里的设计会被清空，所以改动前先
`design_save_project`，改动后 `design_load_project` 恢复。Client 半区的改动刷新页面
也会生效。

## 前置条件

- Harness 进程必须能解析到 `node`（bundle 会拉起它）。
- **patch 里没有任何与这台机器绑定的东西。** 所有路径都在加载时推导：
  `createRequire(baseUrl)` 定位已安装的包（MCP 行要拉起的服务器、以及 Host 半区的
  file URL），`dshHomePath()` 把预览产物与保存的项目放到 Harness home 下
  （`<DSH_HOME>/prism/design.html`、`<DSH_HOME>/prism/projects`）。检出可以放在任何
  位置，别人安装时一个字都不用改。
- Host 那一行用**绝对 file URL** 寻址，URL 由已安装的包计算出来。这是有意的：从
  profile 外链进来的 bundle 按包名能解析，但它的**子路径**过不了 profile 的模块解析
  层；而运行中的 Host 又会把模块代次留在 Node 的 ESM 缓存里——所以这一行直接指名文件。
- 从检出安装时需要先打包服务器：`npm run build && node dsh-plugin/scripts/copy-server.mjs`。
  发布时由插件的 `prepack` 钩子自动执行同一步。

## 配置

两行都在 [`dsh-plugin/cordis.patch.yml`](../dsh-plugin/cordis.patch.yml) 里配置，
也可以从你的 profile patch 层覆盖：

| 行 | 字段 | 默认值 | 含义 |
|---|---|---|---|
| `mcp-prism` | `command` / `args` | `node` + `<包目录>/server/index.js` | 如何拉起打包进来的服务器 |
| `mcp-prism` | `env.PRISM_PROJECT_DIR` | `<DSH_HOME>/prism/projects` | `design_save_project` 写到哪里 |
| `mcp-prism` | `env.PRISM_PREVIEW_FILE` | `<DSH_HOME>/prism/design.html` | 实时预览产物 |
| `mcp-prism` | `toolCallTimeoutMs` | `120000` | 单次调用超时；截图类调用可以调高 |
| `mcp-prism` | `failOnStartupError` | `true` | 拒绝激活，而不是静默地"启动了但没有工具" |
| `prism-design-panel` | `previewPath` | `<DSH_HOME>/prism/design.html` | 必须等于服务器的 `PRISM_PREVIEW_FILE` |
| `prism-design-panel` | `pollIntervalMs` | `1500` | 预览刷新间隔 |

面板的 Host 半区把这份配置声明为 **Standard Schema**（`Config["~standard"].validate`），
而不是 Schemastery schema。两个原因是实测出来的：

- Loader 校验所有插件配置都走 `Config["~standard"].validate`，而普通 JSON Schema 对象
  没有这个字段——那一行会以 `Cannot read properties of undefined (reading 'validate')`
  直接挂掉；
- bundle 在 profile 之外，Schemastery 这类 Harness 包在那里 import 不到（只有装进
  profile 的包才解析得到）：静态 `import z from '@deepseek-ai/schemastery'` 会以
  `ERR_MODULE_NOT_FOUND` 失败，写不写 `peerDependencies` 都一样。

一个副作用：Plugins 页面会把这个行的配置显示为 *unsupported*（非原生 schema 不生成
表单）。请改 patch 层里的这两个值。

### 为什么关掉自动保存

patch 里设了 `PRISM_AUTOSAVE=off` 与 `PRISM_AUTOLOAD=off`。若开着，服务器会静默恢复
上次保存的设计，于是新会话从**陈旧状态**开始，而不是一份空文档。只有在你确实想要这个
行为时才打开。

## 实时预览是怎么工作的

```
agent 改动设计             design_preview_sync()          面板轮询该文件
──────────────────►  ──────────────────────────►  ──────────────────────────►
mcp__prism__design_*   写一个固定路径的 HTML 文件     revision 变化 → 重新渲染
```

1. `design_preview_sync` 把**当前页**导出为一份完整的独立 HTML 文档（内联样式、无外部
   请求），并覆盖单一固定路径：若设了 `PRISM_PREVIEW_FILE` 则用它，否则
   `<cwd>/.prism-preview/design.html`。
2. 文档里带有 `<meta name="prism-preview-revision">` 戳，因此查看方能区分"真的变了"
   与"重写了相同内容"。
3. 每个面板实例每 `pollIntervalMs`（默认 1500 毫秒）读一次该文件，只有 revision 变化时
   才重新渲染 iframe。标题栏显示当前 revision，并带一个 **Pause/Follow** 控制。

因为产物是**一个固定路径**而不是每次调用生成一个带时间戳的文件，任何文件监视器都能
跟随它——面板、编辑器，或浏览器。

预览跟随的是 `design_preview_sync` 调用，而不是设计变更本身。想看着页面一格格长出来，
就要求 agent 每步都同步一次：

> 改动设计之后，调用 `mcp__prism__design_preview_sync`，让 Prism Preview 面板更新。

一次典型流程：

```
mcp__prism__design_init            project_name="Coffee Roastery", base_color="#8B5E3C"
mcp__prism__design_semantic_style  adjectives=["温暖","优雅"]
mcp__prism__design_apply_template  template="saas_landing"
mcp__prism__design_preview_sync    → 面板现在显示这个页面
mcp__prism__design_audit_accessibility level="AA"
mcp__prism__design_add_component   …… 然后再次 sync
```

## Client 半区的契约

下面这些位置**出错时是静默的**、或者会整栏一起挂掉。每一条现在都由
[`verify-dsh-bundle.mjs`](../verify-dsh-bundle.mjs) 守着。

| 契约 | 不遵守会怎样 |
|---|---|
| guide 条目的 `title` 与 `description` 必须读作 **thunk** | `GuideBody` 调用 `entry.title()` 与 `entry.description?.()`；任一写成字符串都会在 guide 内抛错，把整个标签页变空白 |
| Remote 调用回的是 `{ ok, value }` / `{ ok, error }` 信封 | 直接读信封上的 `result.data` 会拿到 `undefined`，字节解出空字符串，面板显示 "The preview file is empty" |
| `dsh.client.inject` 必须列出 Client 半区用到的所有服务所属的包 | 浏览器的模块表需要加载 `@deepseek-ai/dsh-client-ui-sidebar-right`（页签注册表）、`@deepseek-ai/dsh-client-ui-sidebar`（图标栏 + 主区）、`@deepseek-ai/dsh-api-remotes`（文件读取） |
| 预览 iframe 的 sandbox **只能给** `allow-scripts` | `allow-scripts allow-same-origin` 会让产物与 Harness 应用同源：它的脚本能摸到父页面，甚至摘掉自己的 sandbox 属性 |
| Host 行用 file URL，URL 由已安装的包计算 | 运行中的 Host 会把模块代次留在 Node 的 ESM 缓存里（失败的也留）；而链入 bundle 的子路径过不了 profile 的模块解析层——所以 `exports["."]` 就是 Host 半区，那一行直接指名这个文件 |

`main` 面板是 root 作用域、**拿不到会话绑定**，所以它自己订阅 Client 当前会话
（`uiSession.adapter.current`）并把文件读取绑到那个 id；右栏页签则相反，session id 由
Slot 的 `inject` 工厂传进来。

## 故障排查

面板会在占位框里写出自己的状态——先看它：

| `state:` | 含义 |
|---|---|
| `ready` | 产物已读到，iframe 正在渲染它 |
| `missing` | 读取失败；下面那行 `read failed: …` 带 Remote 的具体错误 |
| `empty` | 读取成功但载荷解出来是空的（就是上面那个信封问题） |
| `unavailable` | 面板没有绑到读取器——当前还没有会话 |

控制台诊断日志带 `[prism-design]` 前缀：会记录 Client 半区加载、面板挂载（有没有绑到
读取器），以及每一次读取失败。

单独验证 MCP 半边——它与面板**各自独立失败**：

```
mcp__prism__design_get_state
mcp__prism__design_list_capabilities
```

两者都不会改动设计。如果它们不存在，说明 MCP 那一行没激活：去查 profile 日志，而不是
看面板。

## 收录到 dsh.so

[dsh.so](https://www.dsh.so/zh/) 是社区插件市场（与 DeepSeek AI 无隶属关系）。它会索引带
[`dsh-plugin`](https://github.com/topics/dsh-plugin) 话题的仓库——本仓库已经带上——提交
表单接受仓库地址或 npm 包名。

它的检查器要求什么，本仓库的现状：

| 要求 | 现状 |
|---|---|
| DSH 兼容信号 | `dsh-plugin/package.json` 里的 `dsh.bundle.patch` + `dsh.client`，以及仓库话题 |
| README 带安装说明 | [仓库 README](../README.zh-CN.md) 与本指南 |
| SPDX 可识别的许可证 | MIT（[`LICENSE`](../LICENSE)） |
| 插件 id 匹配 `^[a-z0-9]+(-[a-z0-9]+)*$` | `dsh-plugin-prism-design`（包名）· `prism-ui-design`（仓库名） |
| 源码可扫描 | `src/`（TypeScript）与插件的 ES 模块 |
| 有已发布的 tarball 可安装 | [`dsh-plugin-prism-design@1.0.0`](https://www.npmjs.com/package/dsh-plugin-prism-design)：已用发布出来的 tarball 做过安装 + MCP 握手验证（42 个工具、4 个 resource） |

在 <https://www.dsh.so/zh/submit/> 粘贴仓库地址即可提交：检查器会拉取源码、校验格式、
执行安全扫描，并生成一条待审条目。在有人报告真实运行结果之前，兼容性只会被记为
*Declared（声明）*；市场的兼容性模板要求填写插件、DSH 版本、安装方式、结果与备注。

## 验证状态

**已验证**——在真实桌面版 Harness 上，以及用脚本

- bundle 能安装且每一行都激活：`plugin_manager` 报告 `application: applied`。
- MCP 那一行通过真实 stdio 握手注册出 **42 个工具与 4 个 resource**，能力清单与注册表
  完全一致。
- 面板的两个入口都注册进了运行中的 Client：`sidebar.panellist` 的 id
  `prism-preview`、`main` 的 key `prism-preview`、以及 `sidebar.right.pane.tab` 上的
  tab body —— 通过 Client 的 `Slots` inspect provider 观察到。
- 读取链路端到端可用：面板渲染出 `design_preview_sync` 写出的、带 revision 戳的
  自包含文档，并在设计变化时跟随刷新。
- 预览产物本身（`node verify-preview.mjs`）：已写出、自包含（无远程引用）、带 revision
  戳，并在磁盘上被观察到随之改变。
- 结构静态检查（`node verify-dsh-bundle.mjs`，40 项）：manifest 契约（名称、patch、
  client 声明、export、随包服务器、运行时依赖、prepack）、patch 行、patch 的可移植性、
  JavaScript 语法、上面那些 Client 契约、以及 locale 文件。
- **可移植性：真机验证**。以可发布的包名卸载并重装，所有路径都由表达式推导——
  `application: applied`，随包服务器成功启动，`design_preview_sync` 写到
  `<DSH_HOME>/prism/design.html`。

**未验证**

- 面板**像素级**的渲染：没有任何断言（没有截图测试）。
- 面板自身的文案没有走 Client locale 服务，因此是英文硬编码。
- iframe **刻意不继承** Harness 主题。这是有意为之——预览是被检视的另一套设计系统，
  必须显示它自己的配色——所以这个面板并不是 `references/practices.md` 所描述的那种
  "主题化的 Harness 页面"。
