# Prism 接入 DeepSeek Harness

**English: [dsh-integration.md](./dsh-integration.md)**

Prism 本身就是一个 MCP server，而 DSH 自带 MCP 客户端，所以这套集成的本体是一个
**纯配置的 bundle**，外加一个小的 UI 面板。bundle 位于 [`dsh-plugin/`](../dsh-plugin/)。

## 你会得到什么

| 部分 | 效果 |
|---|---|
| MCP 连接 | Prism 的 42 个工具可以按 `mcp__prism__<tool>` 调用，例如 `mcp__prism__design_add_component` |
| 实时预览面板 | 右侧边栏里一个 **Prism Preview** 页，随设计变化自动跟随 |
| Guide 入口 | 面板从侧边栏 guide 打开，因此不需要先打开任何文件 |

## 实时预览是怎么工作的

```
agent 改动设计             design_preview_sync()          面板轮询该文件
──────────────────►  ──────────────────────────►  ──────────────────────────►
mcp__prism__design_*   写一个固定路径的 HTML 文件     revision 变化 → 重新渲染
```

1. `design_preview_sync` 把当前设计导出为**一份完整的独立 HTML 文档**
   （内联样式、无外部请求），并覆盖单一固定路径：
   - 若设了 `PRISM_PREVIEW_FILE` 则用它，否则 `<cwd>/.prism-preview/design.html`。
2. 文档里带有 `<meta name="prism-preview-revision">` 戳，因此查看方能区分
   "真的变了" 与 "重写了相同内容"。
3. 面板每 `pollIntervalMs`（默认 1500 毫秒）读一次该文件，比对 revision，
   变化时重新渲染 iframe。

因为产物是**一个固定路径**而不是每次调用生成一个带时间戳的文件，任何文件监视器
都能跟随它——面板、编辑器，或浏览器。

## 安装

安装走 `plugin_manager`；**不要手工编辑** profile 的 `package.json` 或
`cordis.patch.yml`。

在具备 Full access（Creator 模式）的会话里，让 agent 安装这个 bundle，
或使用 Web 侧边栏的 **Plugins** 页面：

- `plugin_manager` · `action: install_bundle` · `target: D:\Prism\dsh-plugin`

然后确认它已生效：

```
plugin_manager · action: list_bundles      # bundle 出现在列表里，application: applied
```

新的 Host bundle 有可能通过 HMR 直接激活。**替换**一个已安装的包则需要
**重启**才能加载新的 JavaScript 模块代次；改动了 Client bundle 则需要刷新页面。

### 单独验证 MCP 半边

MCP 那一行活起来之后，Prism 的工具会出现在 `prism` 命名空间下。最省事的证明是
一次只读调用：

```
mcp__prism__design_get_state
mcp__prism__design_list_capabilities
```

两者都不会改动设计。如果它们不存在，说明 MCP 那一行没激活成功——去查 profile
日志，而不是看面板，因为**面板与 MCP 行是各自独立失败的**。

## 前置条件

- Harness 进程必须能解析到 `node`（bundle 会拉起 `node D:\Prism\dist\index.js`）。
  先构建：`npm run build`。
- `dsh-plugin/cordis.patch.yml` 里的绝对路径必须匹配你这份检出。如果 Prism 在别处，
  改 `args[0]` 与那三个 `PRISM_*` 路径。

## 配置

两行都在 [`dsh-plugin/cordis.patch.yml`](../dsh-plugin/cordis.patch.yml) 里配置，
也可以从你的 profile patch 层覆盖：

| 行 | 字段 | 默认值 | 含义 |
|---|---|---|---|
| `mcp-prism` | `command` / `args` | `node` + `D:\Prism\dist\index.js` | 如何启动服务器 |
| `mcp-prism` | `toolCallTimeoutMs` | `120000` | 单次调用超时；截图类调用可以调高 |
| `mcp-prism` | `failOnStartupError` | `true` | 拒绝激活，而不是静默地"启动了但没有工具" |
| `prism-design-panel` | `previewPath` | `D:\Prism\.prism-preview\design.html` | 必须等于服务器的 `PRISM_PREVIEW_FILE` |
| `prism-design-panel` | `pollIntervalMs` | `1500` | 预览刷新间隔 |

### 为什么关掉自动保存

patch 里设了 `PRISM_AUTOSAVE=off` 与 `PRISM_AUTOLOAD=off`。若开着，服务器会静默
恢复上次保存的设计，于是新会话从**陈旧状态**开始，而不是一份空文档。只有在你确实
想要这个行为时才打开。

## 如何提示 agent

预览只有在 agent 主动同步时才会跟随。请在会话里说一次（或写进 persona），免得它漂移：

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

## 验证状态

请留意哪些检查过、哪些没有。

**已验证**

- 预览产物：已写出、自包含（无远程引用）、带 revision 戳，并在设计变化时被观察到
  在磁盘上随之改变（`verify-preview.mjs`）。
- 工具表面：通过真实 stdio 握手注册出 42 个工具，能力清单与注册表完全一致。
- bundle 的**结构**，由 `verify-dsh-bundle.mjs` 检查：manifest 契约、export 目标、
  YAML 里的插件名对得上随发行版附带的 runtime、JavaScript 可解析、Client 半区只用
  文档化的 module-loader 形态，且不 import 任何 Harness Client 包。

**未验证**

- DSH 能否加载这个 bundle、面板能否渲染。本环境没有 `plugin_manager` 工具、没有
  `dsh` CLI，也无法重启正在运行的 Harness，因此**该 bundle 从未被激活过**。
  上面的安装步骤就是它的第一次真实测试。
- 面板自身的文案没有走 Client locale 服务，因此是英文硬编码。
- iframe **刻意不继承** Harness 主题。这是有意为之——预览是被检视的另一套设计系统，
  必须显示它自己的配色——但这也意味着这个面板并不是
  `references/practices.md` 所描述的那种"主题化的 Harness 页面"。
