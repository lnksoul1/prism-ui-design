# Prism

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js >= 18](https://img.shields.io/badge/node-%3E%3D18-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-stdio-purple.svg)](https://modelcontextprotocol.io/)

**English: [README.md](./README.md)**

**做设计工作的 MCP server。** 让 AI agent 能生成设计令牌、用 38 种组件类型组装页面、
审阅可访问性与设计质量，并导出为代码或令牌。

- **42 个工具**、4 个 resource、3 个 prompt，全部走 **stdio**
- **38 种组件类型**，props 由 Zod schema 校验
- **导出** HTML、React、Vue、React-TS、Svelte、CSS、演示文稿、Flutter、SwiftUI
- **令牌**支持 DTCG、CSS 自定义属性、Style Dictionary、Figma Tokens、Tailwind v4 `@theme`、DESIGN.md
- **会话**有状态且可持久化：存/取为一个 `.prism.json`
- **实时预览**：一个固定产物，任何查看方都能跟踪（`design_preview_sync`）；另有自包含的 DeepSeek Harness 插件（`dsh-plugin-prism-design`），面板在左侧图标栏与右栏都能打开
- **没有 Dashboard、没有 HTTP 服务、不调用外部 API。** 导出的页面完全自包含（纯 CSS 动画，无 CDN 运行时）

---

## 快速开始

```bash
npm install
npm run build
npm start            # 通过 stdio 讲 MCP
```

### 接入 MCP 客户端

```json
{
  "mcpServers": {
    "prism": {
      "command": "node",
      "args": ["/absolute/path/to/prism/dist/index.js"]
    }
  }
}
```

任何支持 MCP 的客户端都可以（Claude Desktop、Cursor、Claude Code，或你自己写的）。
接上之后，可以这样要求 agent：

> 给一家手冲咖啡品牌做一个落地页，暖色调、偏杂志感。然后做一次可访问性审计，
> 再导出 React 版本。

agent 会依次调用 `design_init` → `design_add_component` → `design_audit_accessibility`
→ `design_export`，并且能通过 `design_get_state` 查看自己的成果。

### 验证服务器

```bash
npm run smoke    # 拉起 dist/index.js，完成握手，列出 tools/resources/prompts
```

---

## 工具

调用 `design_list_capabilities` 可拿到机器可读的清单。它列出的工具与**实际注册集合完全一致**
——这一点由 `tests/tools.test.ts` 强制，所以清单不会与注册表脱节。

### 基础生成 —— 无状态的令牌与素材生成器（10）

| 工具 | 说明 |
|---|---|
| `ui_generate_color_palette` | 由基色生成和谐配色（6 种和谐法则） |
| `ui_suggest_typography` | 精选字体配对，附 Google Fonts 链接 |
| `ui_generate_type_scale` | 模块化字号阶梯（黄金比、纯四度……） |
| `ui_generate_spacing_scale` | 间距系统（线性、几何、斐波那契） |
| `ui_generate_shadow_system` | 阴影层级（subtle、medium、sharp） |
| `ui_generate_border_radius_scale` | 圆角阶梯（sharp、subtle、rounded、pill） |
| `ui_check_color_contrast` | WCAG 2.1 对比度，附 AA/AAA 评级 |
| `ui_generate_gradient` | 带和谐色阶的 CSS 渐变 |
| `ui_suggest_breakpoints` | 响应式断点系统（Tailwind、Bootstrap、Material） |
| `ui_generate_design_tokens` | 一次调用产出完整令牌系统 |

### 会话 —— 在服务器状态里构建设计（18 + 3 个持久化）

| 工具 | 说明 |
|---|---|
| `design_init` | 开始会话（中性默认令牌 + 可选基色） |
| `design_add_component` | 按类型添加组件，props 会被校验 |
| `design_update_component` | 更新 props、布局、可见性、锁定 |
| `design_rename_component` | 重命名图层 |
| `design_remove_component` | 删除组件 |
| `design_reorder_component` | 调整同级顺序 |
| `design_align_components` | 对齐/分布（单个撤销步） |
| `design_z_order_component` | 层级：front/back/forward/backward |
| `design_set_token` | 设置单个令牌 |
| `design_set_theme` | 明/暗 |
| `design_apply_template` | 5 套页面模板之一 |
| `design_add_page` / `design_switch_page` / `design_remove_page` | 多页会话 |
| `design_get_state` | 读取整个会话（令牌、页面、组件、活动日志） |
| `design_get_conflicts` | 令牌对比度冲突 |
| `design_undo` / `design_redo` | 历史（50 个快照） |
| `design_save_project` / `design_load_project` / `design_list_projects` | 把会话存取为 `.prism.json` |

### 审阅、交付与元信息（11）

| 工具 | 说明 |
|---|---|
| `design_audit_accessibility` | 面向 WCAG 的审计，0–100 分 |
| `design_suggest_improvements` | 启发式评审：结构、密度、动效、可访问性、令牌 |
| `design_render_preview` | 独立 HTML 预览（装了 Playwright 时另出 PNG） |
| `design_preview_sync` | 写入实时预览文件，让查看方看到最新设计 |
| `design_export` | html / react / vue / react-ts / svelte / css / presentation / flutter / swiftui |
| `design_export_tokens` | DTCG / CSS / Style Dictionary / Figma Tokens / DESIGN.md / Tailwind v4 |
| `design_import_tokens` | 导入 DTCG 令牌（replace / merge-overwrite / merge-keep） |
| `design_import_webpage` | 导入 URL 或粘贴的 HTML 为组件 |
| `design_import_design_md` | 从 Google DESIGN.md 文档导入令牌 |
| `design_semantic_style` | 把形容词（"温暖"、"warm"）映射为可度量的令牌增量 |
| `design_list_capabilities` | 清单本身 |

### Resources 与 prompts

- Resources：`prism://tokens/active`、`prism://components/registry`、
  `prism://patterns`、`prism://audit/checklist`
- Prompts：`build_page`、`design_review`、`import_project`

### 实时预览

`design_preview_sync` 把**当前页**渲染到**一个固定文件**
（`PRISM_PREVIEW_FILE`，默认 `<cwd>/.prism-preview/design.html`），并写入 revision 戳。
因为它是单一路径、原地覆盖，任何监视器都能跟踪它——见
[DeepSeek Harness 集成](docs/dsh-integration.zh-CN.md)：那个 bundle 还会装上
Prism Preview 面板（左侧图标栏入口，或右栏页签），revision 一变就重新渲染。这个 bundle
是**自包含**的：它把要拉起的 MCP server 一起打包，所有路径都从「装在哪里」推导出来，
没有任何与本机绑定的配置。

---

## 组件类型

导出器能渲染的 38 种类型。取值由 `src/component-schemas.ts` 校验
（未知键透传，缺失键容忍）；有测试断言 schema 映射与目录列表包含完全相同的类型。

`accordion` · `alert` · `avatar` · `badge` · `bento_grid` · `breadcrumb` · `button` ·
`card` · `card_grid` · `carousel` · `container` · `cta` · `faq` · `feature_grid` ·
`feature_list` · `footer` · `form` · `glass_card` · `grid` · `hero` ·
`html_fragment` · `image` · `input` · `marquee` · `navbar` · `pagination` ·
`pricing` · `progress` · `sidebar` · `skeleton` · `stats` · `table` · `tabs` ·
`testimonial` · `text` · `text_section` · `timeline` · `tooltip`

其中两种是 store 产出的、而非手工输入的：`text` 来自 `promoteElementToComponent`，
`container` 来自 `groupComponents`。

所有带列表的类型都以 `items` 为规范键（`links` / `plans` / `tabs` / `slides` 为
可接受的别名）。当列表缺失或不是数组时，`design_add_component` 会**给出警告**，
而不是静默渲染出一个空组件。

`html_fragment` 是导入 HTML 的表示方式：导入的页面会变成忠实还原的区域
（header / nav / main / footer / section-N / content），保留原有 CSS；改动通过
`applyHtmlFragmentsToDocument` 写回，`<head>` 与脚本保持不变。

---

## 配置

| 环境变量 | 默认值 | 作用 |
|---|---|---|
| `PRISM_PROJECT_DIR` | `~/.prism/projects` | `design_save_project` / 自动保存的写入位置 |
| `PRISM_AUTOSAVE` | 开（设 `off` 关闭） | 会话滚动自动保存 |
| `PRISM_AUTOLOAD` | 开（设 `off` 关闭） | 启动时恢复自动保存的检查点 |
| `PRISM_PREVIEW_FILE` | `<cwd>/.prism-preview/design.html` | `design_preview_sync` 写入的实时预览产物 |
| `PRISM_PREVIEWS_DIR` | `<cwd>/.prism-previews` | `design_render_preview` 写 PNG 截图的位置 |

LLM API key 从不参与：Prism 没有内建 AI 通道——驱动这个 MCP server 的 agent
**本身就是**智能来源。除了你要求导出的文件之外，没有任何数据离开你的机器。

---

## 架构

```
┌──────────────┐   stdio (MCP)   ┌────────────────────────────────────────┐
│  MCP client  │ ◄─────────────► │  src/index.ts                          │
│  (agent)     │                 │   ├─ McpServer：42 个工具               │
└──────────────┘                 │   ├─ 4 个 resource · 3 个 prompt        │
                                 │   └─ DesignStateStore（内存 + 磁盘）     │
                                 └────────────────────────────────────────┘
```

**单一变更路径**：每个工具都调用 `design-service`，由它调用 `DesignStateStore`。
撤销/重做、活动日志、冲突检测与导出流水线都挂在这唯一的 store 上，因此不存在两个
工具对状态理解不一致的可能。这一点是被强制的：只要某个工具绕过 service 直接调用
store 的变更方法，`tests/mutation-path.test.ts` 就会失败——正是它保证了组件类型
白名单、props schema 与令牌分类检查无法被绕过。

```
src/
├── index.ts              # MCP 注册 + stdio 启动
├── state.ts              # DesignStateStore：状态、撤销/重做、变更方法
├── service/design-service.ts  # 唯一的变更路径 + 输入校验
├── component-schemas.ts  # 各类型的 Zod props schema + 列表 props 契约
├── tools/                # 按领域划分，一个领域一个模块
├── tokens.ts + tokens/dtcgi.ts # 令牌生成与互操作
├── layout/snap.ts        # snapComponentsToGrid 使用的网格吸附
├── import-project.ts     # HTML → html_fragment 区域 → 再写回
├── semantics.ts          # 形容词 → 令牌增量
├── project-store.ts      # .prism.json 持久化 + 自动保存
└── resources/, prompts/  # MCP 上下文表面

dsh-plugin/               # DeepSeek Harness bundle（MCP 连接 + 预览面板）
```

几何层（一个布局引擎、一个整理 pass、一个自动布局 pass）已被删除：导出是 CSS 流式
布局，从不读取 `layout` 坐标，因此没有任何消费者。

---

## 开发

```bash
npm run dev      # tsx watch src/index.ts
npm run build    # tsc
npm test         # build + 编译测试 + node --test（对 .test-build/tests 做 glob）
npm run lint     # eslint
npm run check    # lint + test
```

测试共 **166 个用例、18 个套件**，覆盖状态存储、服务层、全部 42 个工具契约、
组件 schema、导出格式、令牌互操作与 HTML 导入保真度。有三个契约测试值得了解：

- `tests/tools.test.ts` —— 注册的工具集合必须等于 `design_list_capabilities`
  清单；每个工具都必须接受其文档化的参数并作出响应。
- `tests/mutation-path.test.ts` —— 任何工具都不得直接调用 `DesignStateStore`
  的变更方法；service 的校验不可被绕过。
- `tests/component-schemas.test.ts` —— props schema 映射与组件目录必须列出完全
  相同的类型。

`.githooks/pre-push` 会跑 `npm run lint && npm test && npm run smoke`；用
`npm run hooks:install` 安装。CI 跑同样的内容，另加一次依赖审计。

### 可复现的审计脚本

这些脚本检查单元测试无法覆盖的性质，各自会自行重新生成所需的输入：

| 脚本 | 它能证明什么 |
|---|---|
| `npm run smoke` | 服务器能通过真实 stdio 启动、完成握手，并注册出预期的表面 |
| `node verify-dsh-bundle.mjs` | Harness bundle 结构正确：manifest 与导出路径、patch 行、JS 语法，以及 Client 半区的那些契约（guide thunk、Remote 结果信封、iframe sandbox、服务注入清单） |
| `node verify-preview.mjs` | 实时预览产物确实被写出、自包含（无远程引用）且带 revision 戳 |
| `node audit-rendered-css.mjs` | 导出时发出的每个变体类，在浏览器里都确有生效的 CSS 规则 |
| `node verify-components.mjs` | 重做过的组件真的能用（标签页会切换、提示框 hover 前隐藏、跑马灯在动、轮播可滚动） |

`verify-dsh-bundle.mjs` 与 `npm run smoke` 在任何环境都能跑；CSS 与组件审计需要
`playwright`（devDependency）与本机缓存的 Chromium。

---

## 历史

本仓库曾经包含一个大得多的产品：一个 Electron 桌面应用、一个原生 JS 面板、
一个 React 19 客户端、Yjs 实时协同、JSX 双向同步、一个抓取来的设计库目录，
以及一条内建 LLM 通道——合计 82 个工具。这些表面在**路线 B 重构**中被移除，
原因是它们从 MCP server 出发不可达、无法验证，或已与代码实际脱节（大量文档
描述的是已被删除的功能，而能力清单还在宣传从未注册过的工具）。

描述那个已移除产品形态的文档全部被删除，而不是留着误导人：`DESIGN.md`、`PRD.md`、
`prism-product-definition-v2.md`、`docs/archive/*`、三个带日期的 V2.0 计划，以及
——出于同样的理由——**那份重构计划本身**：它记录的目标工具面（22 个）实现时从未
存在，其中的数字又被此后每一次改动推翻，留着只会变成第二份错误的描述。

那次重构之后还有两轮清理：组件目录从 45 种裁剪到 **38 种**（移除了那些在静态导出里
做不到任何有意义之事、或与另一类型重复的条目），以及删除了已死的布局几何层。再之后
是 [DeepSeek Harness 集成](./docs/dsh-integration.zh-CN.md)——一个 MCP 连接加上它的
预览面板，也是本仓库唯一与另一个应用对话的部分。

现在留下的文档是：本文件、[英文版](./README.md)，以及集成指南的
[中文版](./docs/dsh-integration.zh-CN.md)与[英文版](./docs/dsh-integration.md)；
`src/` 是唯一的事实来源。

## 许可

MIT。
