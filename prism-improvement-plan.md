# Prism 平台改进方案

> 版本：v1.0 · 日期：2026-08-12
> 范围：`prism-ui-design-mcp`（服务端 + Dashboard）、`prism-studio-v2-prototype`、三份设计文档
> 依据：源码审计（28 个 MCP 工具、REST/WS 双通道、客户端渲染引擎）+ 2026-08 外部调研

> **实施进度（2026-08-12 更新）**
> - ✅ Phase A1 测试体系：255 项测试全绿 + Playwright e2e 冒烟 2/2
> - ✅ Phase A2 持久化：`design_save_project` / `design_load_project` / `design_list_projects` + REST 端点 + 自动保存/启动恢复 + Dashboard 保存/加载按钮
> - ✅ Phase A3 双通道收敛：`src/service/design-service.ts` 共享服务层 + WS 消息 zod 严格校验（拒绝未知类型/非法字段）
> - ✅ Phase A4 修复：`getState()` 返回 canUndo/canRedo；阴影令牌纳入风格预设与客户端阴影 Tab；组件选中机制（动效应用目标）；新增缩放/图层面板/属性检查器
> - ✅ Phase A5 文档：README 工具清单 68 个；对比报告追加 v1.2 勘误；已提交 Git（48cc8fe、fc7bde7、510a64b）
> - ✅ Phase B2 无障碍审计：`design_audit_accessibility`（9 条 WCAG 规则，AA/AAA，评分 0–100）
> - ✅ Phase B3 令牌互通：`design_export_tokens`（dtcg/css/style-dictionary/figma_tokens）+ `design_import_tokens`（replace/merge-overwrite/merge-keep）
> - ✅ Phase B4 MCP 上下文：4 个 Resources（tokens/components/patterns/audit checklist）+ 3 个 Prompts（build_page/design_review/import_project）
> - ✅ Phase B1 渲染预览：`design_render_preview`（HTML 恒可用，Playwright 可选装后输出 PNG）
> - ✅ 客户端增强（B6 子集）：组件选中、属性检查器（文本/颜色/动效/删除）、图层面板、缩放 25–200%、动画目标选择
> - ✅ C3 模板系统：`design_save_template` / `design_load_template` / `design_list_templates`（.prism-template.json）
> - ✅ C4 版本管理：`design_create_version` / `design_list_versions` / `design_restore_version` / `design_diff_versions`
> - ✅ F3 互操作扩展：`design_export_tokens(format="design_md")` + `design_import_design_md` + `design_list_capabilities` 自描述 manifest
> - ✅ F1 网页导入：`design_import_webpage`（URL 抓取或 HTML 直传 → navbar/hero/sections/footer 组件）
> - ✅ F7 风格指南库：6 种风格指南（glassmorphism/brutalist/retro/neumorphism/cyberpunk/editorial）+ 模糊匹配 + 应用工具
> - ✅ C1 语义中间层：`design_semantic_style`（中英文形容词 → 色相/饱和度/明度/圆角/阴影/字体风格，逐令牌记录 reason）
> - ✅ 设计方案（prism-design-spec.html）升级：
>   - 14 种风格预设（新增 Glassmorphism/Neumorphism/Claymorphism/Aurora/Brutalism/Cyberpunk/Organic/Luxury，并按规格校准原 6 种）
>   - 20 种动效（新增 bounceIn/flipIn/cinematic/shimmer/glitch/morphBlob 入场 + ripple/spotlight/magnetic/tilt 悬停，支持 stagger）
>   - 41 种组件类型（新增 input/grid/table/alert/tooltip/bento_grid/skeleton/command_palette/glass_card/fab/marquee/feature_grid/cookie_banner/toggle）
>   - Button danger 变体、Card elevated/outlined 变体
>   - 规格 §8.2 工具对齐：`design_list_style_presets` / `design_list_components` / `design_list_pages` / `design_set_project_name` / `design_get_tokens` / `design_set_token_batch` / `design_delete_token`
>   - 语义词库扩展（舒适/奢侈/易读/有趣/简洁/未来感等）
> - ✅ C6 子集（设计评审）：`design_suggest_improvements`（结构完整性/密度/动效/无障碍/令牌启发式评分 + 工具提示）
> - ✅ 品牌风格学习（规格 Phase 3 子集）：`design_create_brand_style`（品牌色 → 主色/强调色/色相/圆角策略，逐令牌 reason）
> - ✅ B6 子集（自动排布）：`design_reflow`（规范章节顺序，可 Undo）
> - ✅ F9 子集（演示与多格式导出）：`design_export` 新增 presentation（HTML 幻灯片）/ react-ts / css；`design_init` 支持 14 预设
> - ✅ 审计增强：新增 target-size（WCAG 2.2）与 focus-ring 规则；客户端焦点环样式 + Delete 键删除选中组件
> - ✅ C6 子集（自动改进）：`design_auto_improve`（缺令牌/导航/首屏/页脚时一键补齐，确定性可测）
> - ✅ C5 子集（在线状态）：WS 在线人数广播 + 客户端"N 人在线"指示
> - ✅ C2 种子（平台感知）：`activePlatform` 状态 + `design_set_platform` 工具 + WS set_platform + 客户端平台双向同步
> - ✅ F9 子集（多框架）：`design_export` 新增 flutter（MaterialApp + 令牌主题）与 swiftui（Color(hex:) 主题）
> - ✅ B6 自由定位与自动布局：组件 `layout/visible/locked` 字段 + `design_update_component` 布局参数 + 客户端流式/自由双模式（拖拽移动、8 向缩放手柄、检查器 X/Y/W/H、自动排列）
> - ✅ C2 多平台设计状态：`design_save_platform` / `design_load_platform` / `design_list_platforms`（每平台独立页面快照，共享风格与令牌）
> - ✅ C5 评论批注：`design_add_comment` / `design_list_comments` / `design_remove_comment`（组件级评论，不改变设计）
> - ✅ C6 子集（一键生成）：`design_generate_page`（brief → 模板识别 + 语义形容词风格 + 页面组装）
> - ✅ C6 子集（评审循环）：`design_review_and_improve`（评分 → 自动修复 → 复评 + 无障碍审计）
> - ✅ F3 扩展：`design_export_tokens(format="tailwind")`（Tailwind v4 @theme）
> - ✅ F9 扩展：`design_export(format="svelte")`（Svelte SFC）
> - ✅ F8 基础：Dashboard 中英双语（顶栏切换 + localStorage 记忆，覆盖界面外壳/空状态/状态栏/检查器标签）
> - ✅ C5 实时光标：WS `cursor`/`cursor_leave` 协议 + 客户端远程光标渲染（节流 100ms、客户端标签）
> - ✅ C5 冲突解决：`revision` 乐观并发控制——变更携带 base_revision，过期修订被拒绝并返回 `conflict`，客户端自动重同步
> - ✅ 客户端视觉升级（规格 §5.1–5.3 + 顶尖网站参照）：Premium 浅色体系（紫罗兰 #7C3AED、白底、8/12/16 三级圆角、克制阴影、系统无衬线 + JetBrains Mono、Vercel 式双层焦点环、六态微交互）、画布点阵背景、空状态三入口引导卡（AI 生成/设计库拖拽/模板创建 + `/api/template`）、活动日志时钟空状态、冲突通过绿卡（实时 WCAG 比值）
> - ✅ P0-1 真实截图：Playwright 安装完成，`/api/render?format=png` 返回真实 PNG（无浏览器时 501 降级），客户端截图按钮下载 PNG（失败回退 HTML）
> - ✅ P0-2 AI 指令闭环：指令写入活动日志（user_prompt）+ WS `prompt_queued` 广播 + `design_get_state` 摘要含 pending prompt + README Agent 轮询工作流
> - ✅ P0-3 客户端四面板：模板/版本/评论 REST 端点 + 左侧二级 Tab（设计库/版本/评论）+ 模板子 Tab（内置/已存/保存当前）+ 顶栏项目弹窗（列表/保存/加载）
> - ✅ P0-4 工程基线：ESLint flat config + Prettier + EditorConfig + GitHub Actions CI（Node 20）+ 跨平台 clean + 版本升至 1.1.0（含一致性测试）
> - ✅ P1-5 搜索筛选：活动日志（关键词 + AI/用户来源）、令牌面板、设计库
> - ✅ P1-6 冲突 UI（横幅 + 重新加载按钮 + 8s 自动重同步）+ `PRISM_AUTOIMPORT=off` 启动可配置 + README 配置表
> - ✅ P1-7 浏览器冒烟：`tests/e2e/dashboard.spec.ts`（空状态渲染 + 模板创建 + 无 console 错误），`npm run test:e2e`
> - ✅ 服务可打开客户端界面文件：`parseClientShell` 解析 `client/index.html` 外壳（顶栏/侧栏/标签/画布/指令栏/令牌），`POST /api/import-client` + 空状态"打开客户端界面"入口，导入后套用品牌令牌
> - ✅ 画布滚动修复：移除嵌套 `flex:1 + overflow:hidden` 压缩，滚动容器随内容增高（流式与自由模式均可滚动）
> - ✅ 自由调整修复：自由模式拖拽不再被 `.comp-overlay` 拦截（整块组件可拖动），切换时给出操作提示
> - ✅ 实际界面参照：`POST /api/capture-client` 用 Playwright 自截图真实 Dashboard，`/previews` 静态服务，截图以 image 组件落入画布作为参考
> - 🔄 待办：C6 完整智能体、F9 更多框架、规格 Phase 2 截图转 UI（依赖视觉模型）、数据库/多项目工作区

---

## 一、结论摘要

Prism 已完成"从想法到原型"的第一阶段：MCP 工具体系（28 个工具）、双通道实时协作（stdio + HTTP/WebSocket）、27 种组件、6 种风格预设、4 种导出格式、多页面管理、Undo/Redo、设计库拖拽与悬停预览均已落地，整体完成度约 87%。但从工程质量和产品竞争力两个维度看，存在四类关键问题：

1. **工程地基薄弱**：仓库内没有任何测试，尽管文档声称"54/54 项测试验证"；状态仅存内存，重启即丢；REST 与 WebSocket 两套操作逻辑重复实现，存在漂移风险。
2. **能力对标落后**：2026 年主流设计类 MCP（Figma MCP、ui-toolkit-mcp、better-design 等）已标配**可视化截图渲染、无障碍审计、设计令牌互通（W3C DTCG）、MCP Resources/Prompts、组件注册表**；Prism 目前只有"对比度检查"一项质量能力。
3. **客户端编辑能力弱于自身 v2 原型**：`prism-studio-v2-prototype` 已有属性检查器、缩放、拖拽定位、图层面板，但 MCP Dashboard 尚未迁移这些能力；且存在 Undo/Redo 按钮状态 bug、多平台切换仅改视口等半成品问题。
4. **文档与实现漂移**：对比报告称"设计库缺失"，实际代码已实现；README 声称 17 个工具，实际 28 个；工具名（`design_apply_style` vs `design_apply_template` 等）对不上。

建议按三阶段推进：**Phase A（v1.2.0）补地基** → **Phase B（v1.3.0）追平能力标杆** → **Phase C（v2.0.0）构建差异化**（语义中间层 + 多平台设计 + AI 设计智能体）。

---

## 二、现状分析

### 2.1 资产盘点

| 资产 | 位置 | 状态 |
|---|---|---|
| MCP 服务端（TypeScript） | `prism-ui-design-mcp/src/` | 28 个工具，双通道已运行 |
| Dashboard 客户端（原生 JS） | `prism-ui-design-mcp/client/` | 三栏布局，功能较全 |
| v2 交互原型（本地模拟） | `prism-studio-v2-prototype/` | 多平台 + 属性检查器，无后端 |
| 设计方案文档 | `prism-design-plan.html` | v1.1.0，路线图到 v3.0 |
| 意图表达调研报告 | `ui-intent-expression-analysis.html` | 语义中间层方向 |
| 方案对比报告 | `prism-design-comparison/` | 已过时（见 2.4） |

### 2.2 服务端审计（`prism-ui-design-mcp/src/`）

**优点**
- 工具命名清晰、每个工具都有 description/example/annotations，利于 Agent 调用。
- 令牌生成已收敛到 `tokens.ts` 单一入口（`applyStyleTokenSet`），避免了三处拷贝漂移。
- 状态存储（`state.ts`）为单例 + EventEmitter，Undo/Redo 深拷贝快照（上限 50 步）、活动日志上限 100 条。
- `design_check_prompts` + 客户端指令栏构成了"用户 → AI"的回传通道。
- 项目导入（`import-project.ts`）支持 HTML/JSX/TSX/Vue 扫描，且正确忽略 `node_modules` 等目录。

**问题（按严重度排序）**

| # | 问题 | 证据 | 影响 |
|---|---|---|---|
| S1 | **仓库零测试**，与文档"54/54 测试验证"严重不符 | 全仓无 `*.test.*` / `*.spec.*` 文件 | 回归无保障，文档可信度受损 |
| S2 | **状态无持久化**：全部内存态，重启丢失 | `state.ts` 单例无文件/DB 落盘 | 设计成果无法保存，无法做项目化 |
| S3 | **REST 与 WS 操作逻辑重复**，同一语义两套代码 | `index.ts` 中 `/api/component/:id` 与 WS `update_component` 各自调用 `stateStore` | 逻辑漂移，维护成本翻倍 |
| S4 | 令牌生成遗漏 **shadows 类别** | `tokens.ts` 仅生成 colors/typography/spacing/radii/transitions | 阴影令牌只能手工设置，风格预设不完整 |
| S5 | 组件 props **无 schema 校验** | `addComponent(type, variant, props)` 接受任意 props | 任意 type 任意 props 都进入状态，客户端只能降级渲染 |
| S6 | 令牌冲突检测覆盖过窄 | `state.ts` 仅检查 text/bg 与 primary/text 对比度 | 缺少标题对比、AAA 级、焦点可见性等 WCAG 检查 |
| S7 | WS 消息无类型白名单校验 | `handleClientMessage` 的 `add_component` 接受任意 `component_type` | 非法类型产生脏数据 |
| S8 | 仅 stdio 传输 | `index.ts` 使用 `StdioServerTransport` | 无法远程/浏览器内调用；MCP SDK 已支持 streamable HTTP |
| S9 | 无 MCP **Resources/Prompts** | 全部工具只有 `registerTool` | 缺少"设计令牌/组件注册表/审计清单"等上下文资源 |
| S10 | `design_get_state` 返回摘要不含 pendingPrompt | `design-tools.ts` getState 摘要字段 | AI 需另调 `design_check_prompts`，链路割裂 |

### 2.3 客户端审计（`prism-ui-design-mcp/client/`）

**优点**
- 原生 HTML/CSS/JS 零依赖，三栏布局：页面切换 + 设计库 + 活动日志 / 画布 / 令牌面板。
- 设计库（风格/动效/组件三标签）已实现悬停预览、拖拽到画布、点击应用。
- 内联编辑、组件拖拽排序、删除、Undo/Redo 快捷键、主题切换、导出弹窗、截图、冲突轮询、断线重连齐全。

**问题**

| # | 问题 | 证据 | 影响 |
|---|---|---|---|
| C1 | **Undo/Redo 按钮恒可用**（bug） | `app.js` 读 `currentState.canUndo`，但服务端状态从不含该字段 | 用户误点无反馈 |
| C2 | **无属性检查器**：不能改尺寸/间距/颜色/动画参数 | v2 原型有 inspector，MCP 客户端没有 | 只能改文字和令牌，无法精修组件 |
| C3 | **无画布缩放/拖拽定位/图层面板/复制粘贴/多选** | `renderCanvas` 仅支持排序与删除 | 编辑体验远低于 Figma 类工具 |
| C4 | **多平台切换只是改视口宽度**（未提交改动） | `PLATFORMS` 仅含 frame/device/url | 与 v2 原型"每平台独立设计"不符，无平台专属状态 |
| C5 | 动效应用只能作用于"最后一个组件" | `handleLibraryItemClick` 取 `components[length-1]` | 交互粗糙，用户无法选择目标 |
| C6 | 截图依赖 `window.open + print/下载 HTML` | `takeScreenshot()` | 无真实 PNG；依赖弹窗权限 |
| C7 | 部分渲染器使用内联 style 而非令牌变量 | `renderStats/renderPricing` 等硬编码 px | 令牌更新后组件不完全响应 |
| C8 | 冲突提示每 30s 轮询，且仅显示在固定位置 | `setupConflictCheck` | 反馈不及时、无解除操作指引 |

### 2.4 原型与文档

- `prism-studio-v2-prototype` 是**能力领先但无后端**的模拟版：7 平台画布（Web/macOS/Windows/iOS/Android）、图层面板、属性检查器（滑块+数值）、8 方向缩放、拖拽定位、缩放 25–200%、键盘快捷键。它定义了 MCP 客户端下一迭代的明确目标。
- 文档漂移：
  - 对比报告称"设计库功能完全未实现"，但 `client/app.js` 已完整实现（`setupDesignLibrary`、`showLibraryPreview`、`setupCanvasDropZone`）。
  - README 声称 17 个工具，实际注册 28 个；对比报告中的 `design_apply_style`/`design_check_dependencies`/`design_detect_token_conflicts` 与代码中的 `design_apply_template`/`design_check_prompts`/`design_get_conflicts` 名称不一致。
  - 设计方案声称"54/54 测试验证"，仓库无测试。
  - README 中的树形结构未反映 `import-project.ts`、`tools/design-tokens.ts` 等新模块。

---

## 三、外部调研（2026-08 时点）

### 3.1 市场与竞品动态

| 产品 | 2026 年关键进展 | 对 Prism 的启示 |
|---|---|---|
| Claude Design（Anthropic Labs） | 对话 + 内联批注 + 直接编辑 + **自定义滑块**实时调间距/颜色/布局 | "AI 生成 + 可视化滑块精修"范式已被验证；Prism 的令牌面板正对应此范式，应强化为组件级滑块 |
| Figma MCP Server | 开放画布写入（`use_figma`）、**MCP Skills**、`download_assets`、Figma Slides/FigJam 支持 | 生态级 MCP 以"资源 + 技能 + 工具"组合提供上下文；Prism 缺 Resources/Prompts |
| v0.app（Vercel） | `@vercel/v0-mcp` 将生成能力暴露为 MCP 工具；v0.dev 更名 v0.app | 生成式 MCP 需与 Agent 工作流深度绑定，单次生成不构成竞争力 |
| Lovable | **Visual Edits 不消耗 AI 额度**，画布直接拖拽/改色 | "可视化操作免费、AI 额度留给生成"是重要定价/体验策略 |
| Google Stitch | 形容词驱动风格系统（"活泼/工业风"） | 验证了"形容词 → 风格"的语义映射方向（与意图分析报告结论一致） |
| Better Design（开源） | 设计 MCP + shadcn/ui 注册表，31 套品牌主题、设计令牌、UI 原则、WCAG 规则 | 主题化 + 组件注册表 + 审计规则是开源设计 MCP 的标准配置 |
| ui-toolkit-mcp（开源） | **13 工具 + 5 Resources + 3 Prompts**：生成即审计（29 条规则）、令牌导入导出、Storybook 生成、视觉回归、Playwright 截图 | 目前最接近"完整 UI 工程 MCP"的标杆，Prism 应逐项对标 |
| framesmith / claude-design-mcp（开源） | 用 headless Chromium 将 HTML 场景图渲染为 PNG；设计版本化与截图 | "生成 → 截图回显"是 Agent 闭环的关键缺失能力 |

### 3.2 标准与规范

- **W3C Design Tokens（DTCG）** 已于 2025-10 进入 Stable，`$value`/`$type`/`$description` JSON 格式成为工具间互通的基线。Prism 当前令牌格式为私有 `{value, source}`，导出 Figma Tokens JSON 时需转换。
- **MCP 规范演进**：除 stdio 外，streamable HTTP 传输、Resources/Prompts/Skills 已成为主流设计类服务器的标配；扁平化参数、小工具集、lazy discovery 是 Agent 可用性最佳实践。
- **WCAG 2.2** 对焦点可见性、目标尺寸、拖拽替代操作等有新要求；当前实现只覆盖对比度。

### 3.3 对 Prism 的启示（差距定位）

1. **Agent 闭环缺口**：Prism 的 AI 改完设计，用户只能看 HTML 预览，AI 自己"看不到"渲染结果。补上 **服务端截图（Playwright）** 可让 Agent 自检，这是与 2026 年主流工具对齐的第一优先级能力。
2. **质量能力缺口**：无障碍审计（a11y audit）、视觉回归、响应式截图是 ui-toolkit-mcp 的卖点，也是 Prism 可低成本补齐的差异化。
3. **生态与上下文缺口**：MCP Resources（令牌、组件注册表、审计清单）+ Prompts（页面构建、设计评审）能显著提升 Agent 首次使用的成功率。
4. **语义中间层是真正的差异化**（来自意图分析报告）：形容词 → 令牌映射、语义追溯、多模态输入，目前没有任何竞品完整覆盖，且与 Prism 的"语义驱动"定位天然契合。

---

## 四、改进方案总览

### 4.1 三阶段路线

| 阶段 | 版本 | 目标 | 关键交付 |
|---|---|---|---|
| Phase A | v1.2.0 | 补工程地基，修 bug，止文档漂移 | 测试体系、持久化、双通道收敛、schema 校验、文档同步 |
| Phase B | v1.3.0 | 追平 2026 设计 MCP 能力标杆 | 截图渲染、a11y 审计、DTCG 令牌、Resources/Prompts、导出升级、画布编辑器增强 |
| Phase C | v2.0.0 | 构建差异化与产品化 | 语义中间层、多平台设计状态、模板市场、版本管理、多人协作、AI 设计智能体 |

### 4.2 优先级矩阵

| 优先级 | 改进项 | 工作量 | 影响 |
|---|---|---|---|
| P0 | 测试体系 + 持久化 + 双通道收敛 | 中 | 工程质量根基，后续一切的前提 |
| P0 | 服务端截图渲染（Playwright） | 中 | 补齐 Agent 闭环，直接对齐主流 |
| P0 | a11y 审计工具（WCAG 规则集） | 中 | 差异化 + 质量护城河 |
| P0 | 组件属性检查器 + 画布缩放/定位 | 中 | 用户体验最大短板 |
| P1 | DTCG 令牌互通 + 导出升级 | 中 | 生态集成能力 |
| P1 | MCP Resources/Prompts | 小 | Agent 可用性显著提升 |
| P1 | 文档/测试声明同步 | 小 | 可信度与可维护性 |
| P1 | 组件 schema 校验 + 令牌冲突扩展 | 小 | 数据质量与 a11y 正确性 |
| P2 | 多平台设计状态模型 | 大 | 差异化（对齐 v2 原型） |
| P2 | 模板系统 / 版本管理 | 大 | 路线图 Phase 2 兑现 |
| P2 | 语义中间层（形容词→令牌） | 大 | 核心差异化，需算法与数据投入 |
| P3 | 多人协作 / Figma 双向同步 / AI 智能体 | 特大 | 路线图 Phase 3/4，可后置 |

---

## 五、Phase A：工程质量（v1.2.0）

### A1. 建立测试体系

- 用 `node:test` + `tsx`（零新增依赖即可）为以下模块建立单元测试：
  - `state.ts`：Undo/Redo 边界（空历史、50 步截断）、页面增删切、令牌冲突检测、组件树查找/删除。
  - `tokens.ts`：6 种风格预设的令牌完整性（含补齐 shadows 后）、非法 baseColor 回退。
  - 每个 `tools/*.ts`：输入 schema 拒绝非法参数、返回值 `structuredContent` 结构。
- 集成测试：启动 HTTP 服务，覆盖 `/api/init → /api/component → /api/export` 全链路 + WS 广播。
- 验收：`npm test` 一键通过；测试数量 ≥ 60；README 顶部加测试徽章，替换"54/54"的不可验证声明。

### A2. 状态持久化与项目化

- 设计 `ProjectStore`：将单例 `DesignStateStore` 与磁盘解耦，状态序列化为 JSON 文件（默认 `~/.prism/projects/<project-id>.json` 或工作区 `.prism/`），支持：
  - 自动保存（变更防抖 1s）+ 手动保存；
  - 启动时加载最近项目；`design_init` 创建新项目；
  - 导出/导入项目文件（`.prism.json`）。
- 新增 MCP 工具：`design_save_project` / `design_load_project` / `design_list_projects`。
- 验收：重启服务后设计不丢失；可切换多个项目。

### A3. 收敛双通道逻辑

- 抽 `service/` 层：`applyToken(category,key,value)`、`upsertComponent(...)`、`removeComponent(...)`、`reorderComponent(...)` 等纯函数，REST 路由与 WS `handleClientMessage` 都只做参数解析后调用 service。
- 为 WS 消息补充 zod schema 校验（复用工具 schema），拒绝未知 type / 非法组件类型。
- 验收：REST 与 WS 对同一操作的副作用完全一致（用同一集成测试覆盖）。

### A4. 修复已知缺陷

- 服务端在 `getState()` 返回 `canUndo`/`canRedo`（或客户端改为用活动日志推导），修复按钮恒可用 bug。
- `applyStyleTokenSet` 补齐 shadows 令牌（按 `STYLE_PRESETS.shadow_style` 生成 4–5 级阴影），并纳入令牌面板阴影 Tab（当前面板无 shadows 分类）。
- 客户端渲染器统一改用 CSS 变量（`var(--space-md)` 等），清理 `renderStats`、`renderPricing` 等内联硬编码。
- 动效应用支持选择目标组件（点击画布组件后再应用，或库项拖到具体组件上）。

### A5. 文档同步（止漂移）

- 生成"工具清单"为单一事实来源：以 `src/tools/*.ts` 的注册为准自动生成 Markdown 表格（README 的 28 个工具 + 参数摘要）。
- 更新对比报告：标注设计库已实现，工具名与实现一致，删去"54/54 测试"的不可验证声明或改为真实测试数量。
- 补全 README 项目结构（`import-project.ts`、`tokens.ts`、`tools/design-tokens.ts`、`service/`）。

---

## 六、Phase B：能力增强（v1.3.0）

### B1. 服务端截图渲染（Agent 闭环）

- 引入 Playwright（按需安装，作为可选依赖），新增工具：
  - `design_render_preview`：将当前设计渲染为 HTML → headless Chromium 截图 → 返回 PNG（base64 或保存到 `previews/`）。
  - `design_render_multi_platform`：按 web/tablet/mobile/ios/android 多视口截图（对齐 v2 原型 7 平台）。
- 客户端"截图"按钮改为调用 `/api/render` 返回真实 PNG 下载。
- 验收：AI 调 `design_render_preview` 能看到自己生成的设计；截图与画布像素一致。

### B2. 无障碍与质量审计

- 新增 `design_audit_accessibility`（对标 ui-toolkit-mcp 的 29 条规则，先实现核心 12 条）：
  - 对比度（复用现有）、alt 缺失、lang 缺失、表单 label、焦点顺序、非文本对比度、目标尺寸（WCAG 2.2）、动效偏好（`prefers-reduced-motion`）。
  - 返回 `{score, findings[], suggestions[]}`，发现项可定位到组件 ID。
- 扩展 `getTokenConflicts`：加入标题/正文对比、AAA 级检查、主色前景/背景双向检查。
- 新增 `design_visual_diff`（可选）：两张截图像素级对比，供回归使用。
- 验收：审计规则可单测；每条规则有通过/失败样例。

### B3. 令牌体系升级为 W3C DTCG

- 内部令牌结构扩展为 `{ $value, $type, $description, source }`（兼容读取旧 `{value, source}`），同时维护 CSS 变量输出。
- 新增工具：
  - `design_export_tokens(format: dtcg|css|style-dictionary)`；
  - `design_import_tokens(dtcg_json)`（支持 merge 策略）；
  - 替换现有 `figma_tokens` 导出为符合 Figma Tokens 插件规范的 DTCG JSON。
- 验收：导出 DTCG JSON 可被 Style Dictionary / Figma Tokens 插件直接消费。

### B4. MCP Resources 与 Prompts

- Resources：
  - `prism://tokens/active`：当前全部令牌（DTCG 格式）；
  - `prism://components/registry`：组件目录（27 种 + 变体 + 默认 props + schema）；
  - `prism://patterns`：页面模板清单；
  - `prism://audit/checklist`：审计规则引用。
- Prompts：
  - `build_page`：按意图描述组装页面（模板 + 组件 + 令牌）；
  - `design_review`：对当前设计执行审计并给出改进清单；
  - `import_project`：从文件夹导入并生成规范化设计。
- 验收：Claude Code / Cursor 中可直接看到 Resources，无需提示即可获取令牌上下文。

### B5. 导出能力升级

- 新增格式：`tailwind`（Tailwind v4 CSS-first 配置 + 组件）、`react-ts`（带 props 接口）、`dctg`（见 B3）。
- 用真正的 JSX 序列化替换正则 `htmlToJSX`（当前对 27 种组件的转换易碎），改为按组件类型映射到 AST/字符串模板。
- 图片/图标资源内联或产出 `assets/` 目录。
- 验收：导出的 React 代码可 `tsc --noEmit` 通过、可实际渲染；每种组件类型都有导出快照测试。

### B6. 画布编辑器增强（迁移 v2 原型能力）

- 属性检查器（右侧面板新增 Tab）：选中组件后显示布局（宽高滑块）、内容（文本）、外观（颜色/背景）、动效（入场/悬停/时长/缓动）。
- 画布：缩放（25–200%）、组件自由拖拽定位（x/y）、8 方向缩放手柄、图层面板（顶部/底部排序、显隐、重命名）。
- 快捷键：Delete 删除、Ctrl+D 复制、方向键微调。
- 服务端对应：`ComponentNode` 增加 `x/y/w/h/visible/locked` 字段，工具 `design_update_component` 支持布局属性，WS/REST 同步。
- 验收：MCP Dashboard 与 v2 原型交互能力对齐；所有操作可被 AI 通过工具观察。

---

## 七、Phase C：产品化与差异化（v2.0.0）

### C1. 语义中间层（核心差异化）

依据 `ui-intent-expression-analysis.html` 的战略建议，将"形容词 → 设计令牌"映射落地：
- **风格语义库**：为 6 种预设扩展形容词标签（"现代/温暖/专业/活泼/科技感/高级"），建立形容词 → 令牌区间映射表（如"温暖"→ 色相偏暖、圆角偏大）。
- 新工具 `design_semantic_style(description, adjectives)`：输入自然语言描述 + 形容词，输出完整令牌集并解释每个决策（`reason` 字段）。
- **语义追溯面板**（客户端）：每个令牌显示"来源：AI 生成 / 用户调整 / 语义映射"，以及映射依据。
- **多模态输入**：支持上传参考图（提取主色 → 生成和谐色板），作为 `ui_generate_color_palette` 的补充。
- 验收：同一形容词在不同预设下产生稳定且可解释的令牌；追溯面板可回答"为什么是这个颜色"。

### C2. 多平台设计状态模型

- 将当前"一套组件 + 视口切换"升级为 v2 原型模型：**共享令牌/风格 + 每平台独立页面布局**。
- `DesignState` 增加 `platforms: { [platform]: { pages: PageDef[] } }`；`design_set_platform`、`design_add_component(platform)` 等工具支持平台维度。
- 新增 `design_sync_platform`：将某平台的组件结构同步到其他平台（智能适配视口宽度与密度）。
- 验收：同一项目可维护 Web/桌面/移动三套布局，令牌修改全局生效，布局修改按平台隔离。

### C3. 模板系统与组件市场（路线图 Phase 2）

- 模板库：将现有 5 个模板扩充为 Landing/Dashboard/Portfolio/Blog/电商/设置页/登录页等 10+ 模板，模板 = 组件树 + 预设令牌 + 语义标签。
- 用户自定义模板：保存当前设计为模板（`design_save_template`），加载后保留占位符。
- 组件市场（可选）：JSON 清单形式分享组件/模板，不做账号体系。

### C4. 版本管理与历史回溯（路线图 Phase 2）

- 在持久化之上加版本：`design_create_version`、`design_list_versions`、`design_restore_version`、`design_diff_versions`（组件树 diff）。
- 客户端：版本时间线面板 + 一键对比（文本 diff 视图）。

### C5. 多人协作与生态（路线图 Phase 3，可后置）

- 多会话：WS 连接加用户身份、实时光标、操作级广播（替换当前全量状态广播）。
- 评论批注：组件 ID 上挂评论。
- Figma 双向同步：Figma 插件 + REST API 映射（令牌、组件 → Figma variables/components）。

### C6. AI 设计智能体（路线图 Phase 4）

- 自动评分：复用审计工具输出"设计健康分"（对比度、密度、一致性、语义匹配）。
- 优化建议：`design_suggest_improvements` 返回按影响排序的修改项，AI 可直接执行。
- 品牌学习：从导入的项目/设计稿中提取品牌令牌并复用。

---

## 八、关键架构设计建议

### 8.1 目录结构（目标态）

```
prism-ui-design-mcp/
  src/
    index.ts            # 入口：stdio/HTTP 选择 + 装配
    service/            # 双通道共享业务层（Phase A3）
    project-store.ts    # 持久化（Phase A2）
    state.ts            # 内存状态 + 事件
    tokens/             # DTCG 令牌模型 + 生成 + 导入导出（Phase B3）
    semantics/          # 形容词→令牌映射（Phase C1）
    renderer/           # HTML 序列化 + Playwright 截图（Phase B1）
    audit/              # WCAG 规则集（Phase B2）
    tools/              # 工具注册（薄壳，只做参数绑定）
    resources/          # MCP Resources（Phase B4）
    prompts/            # MCP Prompts（Phase B4）
  client/               # Dashboard
  tests/                # 单元 + 集成（Phase A1）
```

### 8.2 组件 Schema 化（贯穿全局）

- 为 27 种组件各定义 zod schema（`src/components/definitions.ts`）：`type/variant/props/layout 字段`。
- `addComponent`/`updateComponent` 在入参处校验，错误信息返回给 AI（"card 不支持 variant=split"）。
- 客户端渲染器与导出器都基于同一 schema 驱动，消除"渲染器不知道字段"的降级路径。

### 8.3 数据模型演进

```ts
interface DesignToken {
  $value: string;
  $type: "color" | "typography" | "dimension" | "shadow" | "transition" | "borderRadius";
  $description?: string;
  source: "ai" | "user" | "preset" | "semantic";
  semanticReason?: string; // Phase C1 追溯
}

interface ComponentNode {
  id: string;
  type: string;            // 受 schema 约束
  variant?: string;
  props: Record<string, unknown>; // 校验后写入
  layout?: { x: number; y: number; w: number; h: number }; // Phase B6
  visible?: boolean;
  locked?: boolean;
  animation?: AnimationDef;
  children: ComponentNode[];
}
```

### 8.4 渲染闭环

`AI 工具调用 → 状态变更 → 广播 → 画布渲染 → (截图回显给 AI) → 审计 → 迭代`，使 AI 具备"设计-看-改"的自检回路，这是 2026 年设计 MCP 与纯代码生成器的分水岭。

---

## 九、验收标准与里程碑

| 里程碑 | 时间建议 | 完成标准 |
|---|---|---|
| M1（v1.2.0） | 2 周 | `npm test` 全绿（≥60 用例）；重启不丢数据；REST/WS 单一实现；README 工具清单与代码一致 |
| M2（v1.3.0） | 4 周 | `design_render_preview` 可截图；a11y 审计 ≥12 条规则；DTCG 导出可被 Style Dictionary 消费；画布编辑器对齐 v2 原型 |
| M3（v2.0.0） | 8 周 | 形容词→令牌映射可用且可追溯；多平台设计状态上线；模板/版本管理可用；AI 智能体完成"设计→截图→审计→改进"闭环演示 |

---

## 十、风险与依赖

| 风险 | 等级 | 缓解 |
|---|---|---|
| Playwright 增加体积与安装复杂度 | 中 | 作为可选依赖（`npm i -D playwright`），无截图需求可跳过；提供 HTTP 降级 |
| DTCG 迁移可能破坏旧数据 | 中 | 兼容读取旧格式；写迁移脚本；导出/导入全链路测试 |
| 语义映射质量难以量化 | 高 | 从 6 预设 × 20 形容词的受控语料起步，建立人工评分集；先做"可解释"，再追求"全自动" |
| 画布自由定位（x/y）与现有流式布局冲突 | 中 | 双模式：`flow`（现状）与 `freeform`（v2 定位）；默认 flow，避免破坏 AI 生成布局 |
| 文档漂移复发 | 低 | 工具清单由注册代码生成；新增工具必须同步测试与文档（纳入 PR 检查） |
| 竞品（Claude Design/Figma）快速迭代 | 中 | 差异化聚焦"语义中间层 + 多平台 + 可审计"，不与通用生成正面竞争 |

---

## 附：调研来源

- Anthropic：Introducing Claude Design（2026-04）
- Figma：4 Ways We're Using Our MCP Server at Figma（2026-06）
- Vercel：v0.app / @vercel/v0-mcp
- Lovable：Visual Edits 指南（2026-03）
- GitHub：marvkr/better-design、teyepe/systembridge-mcp、kenneives/design-token-bridge-mcp、vicmaster/framesmith、evilander/claude-design-mcp
- npm：@elsahafy/ui-toolkit-mcp（13 工具 / 5 Resources / 3 Prompts）、v0-platform-mcp
- W3C Design Tokens Community Group（DTCG，2025-10 Stable）
- 内部文档：`prism-design-plan.html`、`ui-intent-expression-analysis.html`、`prism-design-comparison/`
