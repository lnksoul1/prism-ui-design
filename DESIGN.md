# Prism v1.1 完整设计方案

| 项目 | 内容 |
|---|---|
| 方案版本 | v1.0 |
| 对应 PRD | `PRD.md` v1.1 |
| 更新日期 | 2026-08-16 |
| 状态 | 可进入开发实施 |

---

## 1. 方案概述

Prism v1.1 是面向非设计专业用户的 UI/UX 调整台。本方案在 PRD v1.1 基础上，对已确认的产品范围给出完整、可落地的设计，包括：信息架构、核心交互、智能画布、设计库、导入与一键应用、数据模型、接口、核心模块、测试与实施计划。

**已确认的三个关键决策：**

1. **流式预览 = 单一智能画布**：组件默认按真实高度自动纵向流式排布（不重叠），同时每个元素（顶层组件与内部元素）均可自由拖动/缩放；不再有"流式/自由"二元切换。
2. **设计库为唯一内容面板**：统一承载 24 个设计风格、117 个组件模板及其变体，支持拖拽添加与就地替换，并内置术语模板。
3. **接口统一到设计库**：REST 采用 `/api/design-library` 系列；画布绘制与交互模板相关 MCP 工具随功能裁剪下架。
4. **组件可任意组合，内部元素可独立组件化**：组件树支持任意层级嵌套，可拖拽加入其他组件；组件内部元素可独立设置组件类型/属性/外观。

---

## 2. 设计目标与原则

| 原则 | 说明 |
|---|---|
| 单一编辑视图 | 只保留一个编辑视图（流式预览），降低理解成本；播放模式仅用于查看与体验 |
| 每个元素可编辑 | 顶层组件与组件内部元素具备同等编辑能力：选中、移动、缩放、精确数值、多选、对齐/分布、Z 轴、重命名、文本/属性/CSS 编辑 |
| 设计库即内容 | 设计库是用户寻找风格与组件的唯一入口；命名/描述遵循术语模板 |
| 一键应用闭环 | 导入 → 编辑/换装 → 应用 → 回滚，全程可回溯、可撤销 |
| 不破坏原始产物 | 导入源保留完整原始文档；应用时从原始文档重建，`<head>`、脚本与原生交互不丢失 |
| 本地优先与安全 | API Key 与项目数据仅存本机；不上传、不入库、不记录日志 |

---

## 3. 产品形态与信息架构

### 3.1 工作台布局

```
┌──────────────────────────────────────────────────────────────────┐
│ 顶栏：项目名 / 页面切换 / 视图切换（编辑·播放）/ AI 设置 / 解读 / 导入 / 一键应用 │
├───────────────┬──────────────────────────────────┬───────────────┤
│ 左：设计库      │ 中：流式预览 / 播放视图             │ 右：检查器      │
│               │                                  │               │
│ [搜索]         │  ┌────────────────────────────┐  │ 属性           │
│ 风格（24）     │  │ 智能画布（自动纵向流式排布，      │  │ 布局 X/Y/W/H   │
│ 组件（117）    │  │ 每个元素可拖动/缩放/多选/对齐）    │  │ 文本 / CSS     │
│ 布局/变体      │  │                              │  │ 图层           │
│ 术语模板       │  └────────────────────────────┘  │ 令牌           │
│               │                                  │ 版本/评论/日志   │
└───────────────┴──────────────────────────────────┴───────────────┘
```

### 3.2 视图模式

| 视图 | 用途 | 编辑能力 |
|---|---|---|
| 流式预览（默认） | 主编辑与预览视图 | 全元素编辑（见第 5 章） |
| 播放模式 | 无编辑态预览，验证最终效果 | 只读；触发导入页面原始交互（由原始文档在沙箱 iframe 中运行还原） |

### 3.3 设计库（左侧）

设计库是唯一内容面板，包含三类条目：

1. **设计风格（24）**：一键换装，覆盖设计令牌。
2. **组件模板及变体（117）**：可拖拽添加，或开启「替换选中」后点击就地替换。
3. **术语模板**：为设计库条目提供统一的命名、描述、标签、使用建议，帮助非专业用户检索和理解。

### 3.4 检查器（右侧）

- 属性区：当前选中元素的 type/variant/props。
- 布局区：X/Y/W/H、缩放预设。
- 元素编辑区：文本、属性（href/src/class/id 等）、15 项 CSS。
- 图层区：图层树、重命名、排序、可见性/锁定。
- 令牌/版本/评论/日志：折叠式面板。

---

## 4. 核心用户流程

### 4.1 导入流程（4 类来源）

```
导入 → 选择来源（项目文件夹 / 网页 URL / HTML 代码或文件 / 实际界面截图）
      → 服务端抓取/解析 → 拆分可编辑元素 → 保存原始文档快照
      → 记录 ImportRecord（provenance）→ 进入流式预览并显示导入横幅
```

- URL/HTML/文件来源：可切换「◎ 原页面 / ✎ 编辑」。
- 截图来源：作为参考图进入画布，不生成可编辑片段。

### 4.2 编辑流程（智能画布）

```
选中任意元素 → 拖拽/缩放/多选/对齐/Z 轴/图层重命名/文本·属性·CSS 编辑
             → 每次变更走 stateStore → WS 广播 → 自动保存防抖
             → 撤销/重做（50 步）
```

### 4.3 快速换装流程（设计库）

```
打开设计库 → 搜索/筛选
  ├─ 点击「风格」→ POST /api/design-library/style → 令牌覆盖 → 即时生效
  ├─ 拖拽「组件」到画布 → 添加到当前页
  └─ 开启「替换选中」后点击「组件」→ 就地替换选中元素（同 id 同布局位置）
```

### 4.4 播放验收流程

```
点击「播放」→ 隐藏编辑控件与选中态 → 沙箱 iframe 运行原始文档
             → 原始脚本与交互（页面内跳转、表单提交等）可正常触发
             → 返回流式预览继续编辑
```

### 4.5 一键应用流程

```
点击「一键应用」→ POST /api/apply
  ├─ 无来源：写 prism-adjusted-<页面>.html + prism-adjustments.css
  ├─ URL/HTML：从原始文档重建产物，保留 <head> 与脚本，注入 base 与 CSS
  └─ 纯 HTML 文件：原位写回，.prism-backups 备份
      → 结果弹窗（路径 + CSS 引入指引 + 就地回滚）
```

### 4.6 AI 辅助流程

```
输入自然语言 → 本地指令引擎 v2 优先
  ├─ 命中：直接执行
  └─ 未命中且已配置 LLM：REST/WS 回退内置 AI → 结构化 JSON → 同一 service/state 路径
「解读」→ /api/explain → 大白话 + 可点击后续指令
```

---

## 5. 智能画布设计

### 5.1 自动流式排布算法

- 容器：编辑区内容宽度（响应式，默认桌面宽度，随设备预设变化）。
- 初始坐标：`x = 16`，`y = cursor`；`w = 容器宽 - 32`；`h = 实测高度 || 类型估算高度`。
- 游标推进：`cursor += h + 16`（间距 16px）。
- 触发时机：进入编辑视图时对缺失 `layout` 的顶层组件补齐；点击「自动排列」时全量重排。
- 用户拖动/缩放后：更新 `layout.x/y/w/h`，不再自动重排，直到用户再次点击「自动排列」。
- 子组件：相对父容器流式排列，不参与画布级坐标；但子元素可被选中并进行全元素编辑（见 5.2）。

### 5.2 全元素编辑模型

- 选择模型：
  - 顶层组件：`selectedIds` 支持 Shift 累加、框选。
  - 内部元素：通过 `selectedElementPath` 定位到组件内元素（如 `items.0.title`）。
  - 内部元素被选中后显示独立高亮与选中框，可执行与顶层组件相同的编辑操作。
- 拖拽/缩放：
  - 8 向缩放手柄；拖拽/缩放时实时预览。
  - 内部元素被拖动后，落点根据命中的父容器或组件决定归属；跨组件拖动需在目标父组件上高亮放置区。
- 多选与对齐/分布：
  - 8 种模式：左/水平居中/右/顶/垂直居中/底/水平分布/垂直分布。
  - 单步撤销：`alignComponents` 内部一次 commit。
- Z 轴：
  - 顶层组件间置顶/置底/上移/下移；内部元素在父容器内调整渲染顺序。
- 图层重命名：
  - 图层面板双击行内编辑；`ComponentNode.name`；可撤销。
- 元素级编辑：
  - 文本：双击进入行内编辑。
  - 属性：`href`/`src`/`class`/`id` 等。
  - CSS：15 项常用 CSS（颜色、字号、行高、间距、圆角、阴影等）。
- 内部元素组件化：
  - 选中内部元素后，检查器提供「组件化」操作：将元素提升为独立组件节点（child ComponentNode），可设置组件类型/变体/props/外观。
  - 组件化后保留原位渲染路径，但元素获得独立组件身份，可被独立选中、编辑、参与组合。
- 组件任意组合：
  - 组件树支持任意层级嵌套（`ComponentNode.children`）。
  - 拖拽设计库组件或画布现有组件到另一个组件内部 → 成为其子组件；命中父组件时高亮放置区。
  - 支持拖出父级、改变父级、调整子组件顺序；所有组合变更走撤销/重做。

### 5.3 编辑辅助

- 标尺：沿编辑区边缘显示，刻度跟随缩放/滚动。
- 参考线：从标尺拖出、可移动、拖回或双击删除；会话级，不进导出。
- 吸附：拖拽/缩放时吸附参考线、画布中心/边缘、其他元素边缘/中心；阈值 5px，紫色指示线。

---

## 6. 设计库设计

### 6.1 目录数据结构

```ts
interface DesignLibraryCatalog {
  styles: DesignLibraryStyle[];
  components: DesignLibraryComponent[];
  termTemplates: TermTemplate[];
  version: number;
}

interface DesignLibraryStyle {
  id: string;
  name: string;
  description: string;
  tags: string[];
  tokenOverrides: {
    colors?: Record<string, string>;
    typography?: Record<string, string>;
    spacing?: Record<string, string>;
    shadows?: Record<string, string>;
    radii?: Record<string, string>;
    transitions?: Record<string, string>;
  };
  motion?: {
    entry: string;
    hover: string;
    duration: number;
    easing: string;
    stagger: number;
    engine: "css" | "gsap";
  };
}

interface DesignLibraryComponent {
  id: string;
  name: string;
  description: string;
  tags: string[];
  type: string;
  variant?: string;
  props: Record<string, unknown>;
  /** 变体族：同一组件的不同形态，共用一个 base id */
  baseId?: string;
  variantName?: string;
  thumbnail?: string;
}

interface TermTemplate {
  id: string;
  target: "style" | "component";
  fields: { name: string; pattern: string; example: string }[];
  description: string;
}
```

### 6.2 24 个设计风格

- 来源：新设计库。
- 应用方式：将 `tokenOverrides` 合并到 `state.tokens`（覆盖式），并写入 `state.style` 与 `STYLE_MOTION_PROFILES` 动效配置。
- 可撤销；重复应用幂等。

### 6.3 117 个组件模板及变体

- 来源：新设计库（含布局模板）。
- 添加：拖拽到流式预览空白处，生成新组件并自动保存；拖拽到已有组件内部，生成子组件（组件任意组合）。
- 替换：开启「替换选中」后点击，`state.replaceComponent` 同 id 同布局位置换装，可撤销。
- 变体：同一 baseId 下不同 variant 展开显示，可切换。

### 6.4 术语模板

- 用途：设计库条目的命名、描述、标签、使用建议均遵循模板，保证一致性与可检索性。
- 应用：设计库面板展示条目时套用模板渲染名称/描述/标签；AI 生成条目时也按模板输出。

### 6.5 拖拽交互

- HTML5 Drag & Drop：`dragstart` 携带 `{kind, id}`。
- 画布监听 `dragover`（高亮放置区）与 `drop`（命中坐标）。
- 命中检测：`x/y` 命中组件内部区域 → 添加为该组件的子组件；命中顶层组件间隙 → 添加到其后；未命中任何组件 → 添加到页面末尾；开启替换时命中选中组件则替换。
- 画布内拖拽组合：拖拽现有组件到另一组件内部 → 重设父级（re-parent）；拖到组件间隙 → 调整顺序。

---

## 7. 导入与一键应用设计

### 7.1 四类来源解析

| 来源 | 解析方式 | provenance |
|---|---|---|
| 项目文件夹 | 扫描 HTML 文件，逐页解析片段并记录 `source_file` | `kind: file` |
| 网页 URL | 抓取 HTML，保留完整原始文档与 `base_url` | `kind: url` |
| HTML 代码/文件 | 粘贴或上传 HTML，保留原始文档 | `kind: html` |
| 实际界面截图 | 作为参考图进入画布 | `kind: capture` |

### 7.2 原始文档保留与还原

- 导入时：原始 HTML 存 `imports/<pageId>.html`，元数据存 `ImportRecord`。
- 编辑态：页面拆分为 `html_fragment` 组件（语义片段）。
- 原页面视图：沙箱 iframe 完整还原 CSS/脚本/表单等原生交互。
- 播放模式：同样走沙箱 iframe，触发原始交互。

### 7.3 一键应用

- 有 `ImportRecord` 且可写回（URL/HTML/纯 HTML 文件）：
  - 从原始文档重建：`applyHtmlFragmentsToDocument` 用编辑后的片段替换原文对应区域。
  - 注入 `<base href>`（URL 来源）与 `<link rel="stylesheet" href="prism-adjustments.css">`。
  - 纯 HTML 文件原位写回，备份到 `.prism-backups`。
- 无来源：导出所见即所得 HTML + `prism-adjustments.css`。
- 覆盖前自动时间戳备份。

### 7.4 回滚

- 文件来源：恢复源文件旁 `.prism-backups` 中最新的 `原文件名.bak-<timestamp>`。
- 其他：恢复产物目录 `.backups` 中最新的备份。

---

## 8. 数据模型设计

```ts
interface ComponentNode {
  id: string;
  type: string;
  variant?: string;
  name?: string;
  props: Record<string, unknown>;
  layout?: { x: number; y: number; w: number; h: number };
  visible?: boolean;
  locked?: boolean;
  children: ComponentNode[]; // 任意层级嵌套组合
  animation?: AnimationDef;
}

interface PageDef {
  id: string;
  name: string;
  components: ComponentNode[];
}

interface ImportRecord {
  kind: "url" | "html" | "file" | "capture";
  source: string;
  url?: string;
  html_file: string;
  imported_at: string;
  component_count: number;
  base_url?: string;
  source_file?: string;
  source_is_html?: boolean;
}

interface DesignState {
  projectName: string;
  style: string;
  tokens: DesignTokens;
  pages: PageDef[];
  currentPageId: string | null;
  themeMode: "light" | "dark";
  activePlatform: string;
  platforms: Record<string, PlatformSnapshot>;
  comments: DesignComment[];
  pageLinks: PageLink[];
  revision: number;
  imports: Record<string, ImportRecord>;
  scroll?: ScrollConfig;
  vantaBackgrounds?: Record<string, VantaBackgroundConfig>;
  reactBits?: Record<string, { name: string; variant: string; props?: Record<string, unknown> }>;
  exportRuntime?: "minimal" | "standard" | "full";
  pageBackground?: PageBackground;
}
```

---

## 9. 接口设计

### 9.1 REST

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/import/product` | 导入项目文件夹 / URL / HTML |
| POST | `/api/capture-client` | 导入实际界面截图 |
| GET | `/api/imports` | 查询导入记录 |
| POST | `/api/apply` | 一键应用 |
| POST | `/api/apply/rollback` | 回滚最近备份 |
| POST | `/api/prompt` | 提交自然语言指令 |
| GET | `/api/explain` | 设计解读 |
| GET | `/api/design-library` | 设计库目录（风格/组件模板及变体/术语模板） |
| POST | `/api/design-library/style` | 应用设计风格 |
| POST | `/api/design-library/component` | 添加或就地替换组件模板 |
| PUT | `/api/component/:id/replace` | 就地替换组件（保留 id 与布局） |
| PUT | `/api/component/:id/name` | 组件重命名 |
| GET | `/api/state` | 获取完整设计状态（现有） |
| POST | `/api/component` | 添加/更新组件（现有，保留） |

### 9.2 WebSocket

| 消息 | 方向 | 说明 |
|---|---|---|
| `prompt` | C→S | 提交自然语言指令 |
| `prompt_result` | S→C | 指令执行回执（含 AI 回退状态） |
| `update_component` | C→S | 更新组件 props/layout |
| `rename_component` | C→S | 重命名 |
| `apply_design_style` | C→S | 应用设计风格 |
| `apply_component_template` | C→S | 添加/替换组件模板 |
| `change` | S→C | 状态变更广播（全量/增量） |

### 9.3 MCP

- 传输：stdio（默认）/ Streamable HTTP（`TRANSPORT=http`）。
- 唯一清单：`design_list_capabilities`。
- v1.1 裁剪：
  - 下架：`design_get_canvas`、`design_apply_canvas`、`design_draw_canvas`、`design_set_behavior`、`design_apply_behavior_template`。
  - 保留并强化：设计生成、精确编辑、审计、导入/一键应用、项目/版本/评论、设计库应用。

---

## 10. 核心模块设计

| 模块 | 文件 | 职责 |
|---|---|---|
| 状态与撤销 | `src/state.ts` | `DesignStateStore`、undo/redo（50 步快照）、活动日志、导入记录、项目分桶 |
| 设计服务 | `src/service/design-service.ts` | 统一变更入口（组件/令牌/页面/对齐/Z 轴/替换/设计库应用），供 REST/WS/MCP/LLM 共用 |
| 设计库 | 新增 `src/design-library.ts` | 目录读取、风格应用、组件模板解析、术语模板渲染 |
| 导入解析 | `src/import-project.ts` | 四类来源解析、原始文档快照、`html_fragment` 生成 |
| 一键应用 | `src/apply.ts` | 产物重建、备份、回滚 |
| 写回 | `src/writeback.ts` | token → CSS 变量映射 |
| 指令引擎 | `src/prompt-executor.ts` | 本地指令 v2、未匹配回退建议 |
| LLM 通道 | `src/llm/*` | 三厂商适配、结构化 JSON、同一 service/state 路径 |
| 路由 | `src/routes/*` | REST 路由（新增 design-library 路由） |
| 工具 | `src/tools/*` | MCP 工具（裁剪后） |
| 客户端 | `client/*` | 工作台、智能画布、设计库、检查器、播放模式 |

---

## 11. 性能与安全设计

| 类别 | 设计 |
|---|---|
| 性能 | WS 广播节流；画布自动保存防抖（≥500ms）；大页面的图层树虚拟化；导入解析限制单页组件数 |
| 安全 | Key 仅存 `~/.prism/projects/llm-config.json`；API 返回掩码；日志脱敏；沙箱 iframe 禁止顶层导航 |
| 可访问性 | WCAG AA 对比度检查；可见焦点态；`prefers-reduced-motion`；点击目标 ≥ 44px |
| 兼容性 | Node ≥ 18（推荐 20+）；Chrome 110+；响应式 375/768/1024/1440 |

---

## 12. 测试方案

| 层级 | 内容 |
|---|---|
| 单元 | state、service、design-library、import、apply、writeback、prompt-executor、llm、tokens |
| 集成 | server 路由、WS 消息、MCP 工具清单与裁剪 |
| e2e | 导入→编辑→应用→回滚；设计库拖拽/替换/拖入其他组件；内部元素组件化与嵌套组合；播放模式原始交互触发；AI 指令回退 |
| 基线 | 功能裁剪后重新统计单测/e2e 数量，保持 `npm run check` 全绿 |

---

## 13. 实施计划

| 阶段 | 内容 | 验收 |
|---|---|---|
| P0.1 | 基线确认：跑通 `npm test` / `npm run check` | 现有测试全绿 |
| P0.2 | 裁剪：移除自由画布/绘制、交互模板、组件库/设计系统库入口，下架相关 MCP/WS/REST | 界面无旧入口，工具清单更新 |
| P0.3 | 设计库：24 风格 + 117 组件/变体 + 术语模板；拖拽/替换/换装 | e2e 拖拽与替换通过 |
| P0.4 | 智能画布：全元素编辑（含内部元素拖拽/缩放/多选/对齐/Z 轴） + 内部元素组件化 + 组件任意组合嵌套 | e2e 全元素编辑/组件化/嵌套通过 |
| P0.5 | 播放模式：原始交互触发（沙箱 iframe） | e2e 播放交互通过 |
| P0.6 | 回归与文档：更新 README/PRD/测试基线 | `npm run check` 全绿 |

---

## 14. 风险与回滚预案

| 风险 | 预案 |
|---|---|
| 内部元素拖拽/缩放实现复杂 | 先支持顶层组件全编辑，内部元素先支持文本/属性/CSS 编辑，再增量补齐拖拽/缩放 |
| 设计库数据迁移 | 保留旧 `template-catalog.ts` 数据为只读，新设计库通过适配器读取，避免数据丢失 |
| 原始文档还原不稳定 | 保留原始文档快照与 `.prism-backups`，应用失败可回滚 |
| 播放模式沙箱安全 | iframe `sandbox` 属性最小权限，禁止顶层导航与弹窗 |
| 功能裁剪后测试数量下降 | 以 `design_list_capabilities` 和 `npm test` 实际输出为新基线 |