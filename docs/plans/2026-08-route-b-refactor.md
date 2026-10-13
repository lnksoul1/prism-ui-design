# Prism 重构方案（路线 B：开发者工具 / 干净 MCP server）

> **状态：已完成并验证（2026-08）。**
>
> | 指标 | 重构前 | 重构后 |
> |---|---|---|
> | MCP 工具 | 82 | **41**（注册集合 == `design_list_capabilities` 清单，测试强制） |
> | REST 端点 | 93 | **0** |
> | WebSocket 通道 | 2（`/ws`、`/collab`） | **0** |
> | 前端 / 桌面 | `client/`（12 文件）、`client-v2/`（React 19）、`electron/` | **全部移除** |
> | 生产依赖 | 11（express、ws、yjs、recast、@babel/parser、lib0、y-protocols、fast-json-patch …） | **3**（`@modelcontextprotocol/sdk`、`zod`、`js-yaml`） |
> | `src/` 行数 | ~30.4k | **~12.7k** |
> | 测试文件 / 用例 | 46 个文件（571 用例） | **20 个文件（176 用例，全绿）** |
>
> 验证方式：`npm run build` ✅、`npm run lint` ✅、`npm test` ✅ 176/176、
> `npm run smoke`（真实 stdio 握手：41 工具 / 4 resource / 3 prompt）✅。
>
> 与本节下方原始计划的差异（计划 → 实际）：
> - 工具数由 22 变为 **41**：实现时保留了五套页面模板（`design_apply_template`）、
>   18 个会话工具、3 个持久化工具与 `design_semantic_style`；
>   删除 `design_list_components` / `design_list_pages`（`design_get_state` 已覆盖）。
> - 组件类型由 55 收敛到 **45**：移除了 6 个画布绘制残留类型
>   （`rect`/`ellipse`/`arrow`/`line`/`note`/`connector`）与 4 个盒子模式类型
>   （`chart`/`echarts`/`rich_text`/`editor`）——两者都无法被导出器有意义地渲染。
> - `design_render_preview` 的 PNG 路径改为**可选**：Playwright 不再是依赖。
> - 额外删除：整个 `src/llm/`（含 `prompt-executor`）——agent 本身就是智能来源；
>   `src/action-flow.ts`；`src/import-project.ts` 中约 850 行项目文件夹/JSX/Vue
>   语义解析器；6 个过期启动脚本与残留目录 `prism-ui-design-mcp/`；
>   `state.ts` 中已无任何读取方的 `scroll` / `vantaBackgrounds` / `reactBits` /
>   `exportRuntime` 状态与访问器；`constants.ts` 中整套风格预设/动效类型
>   （StylePreset 及其派生类型、STYLE_MOTION_PROFILES、MOTION_TOKENS）；
>   `renderHtmlToPng` / `captureUrlPng` / `autoLayoutPages` / `exportComponentCode` /
>   `generateTints` / `generateShades` / `adjustSaturation` / `sampleToken` /
>   `isAlignMode` / `isZOrderMode` / `isLayoutIntent` / `truncateIfNeeded` 等无引用导出。
>
> **文档清理（同一轮）**：`DESIGN.md`、`PRD.md`、`prism-product-definition-v2.md`、
> `docs/archive/*`（7 份）与三个 V2.0 计划全部删除——它们描述的是已移除的形态、
> 且与代码脱节。现在仓库只保留 `README.md` 与本文件两份文档。

> 原始基线：`npm run build` 通过，`npm test` **571 通过 / 0 失败**（重构前）。

## 1. 定位（重写）

> **Prism 是一个 MCP server：让 AI agent 生成设计令牌、组装页面、审阅可访问性、导出代码。**

不再是"非设计专业用户的可视化调整台"。没有 Dashboard、没有 Electron、没有实时协同。
产品是**一个 stdio MCP server + 一份清晰的工具契约 + 一页文档**。

## 2. 目标工具面（22 个，从 82 个裁剪而来）

### 基础生成（10，纯函数，无状态）
| 工具 | 说明 |
|---|---|
| `ui_generate_color_palette` | 6 种配色和谐方案 |
| `ui_suggest_typography` | 字体配对 |
| `ui_generate_type_scale` | 模块化字号阶梯 |
| `ui_generate_spacing_scale` | 间距系统 |
| `ui_generate_shadow_system` | 阴影层级 |
| `ui_generate_border_radius_scale` | 圆角阶梯 |
| `ui_check_color_contrast` | WCAG 对比度 |
| `ui_generate_gradient` | 渐变生成 |
| `ui_suggest_breakpoints` | 断点系统 |
| `ui_generate_design_tokens` | 一次性输出完整令牌系统 |

### 设计工作流（12，有状态会话）
| 工具 | 说明 |
|---|---|
| `design_init` | 初始化项目 + 中性令牌 |
| `design_add_component` | 添加组件（55 种类型 + 41 套 props schema） |
| `design_update_component` | 更新 props / 布局 / 可见性 |
| `design_remove_component` | 删除组件 |
| `design_rename_component` | 重命名图层 |
| `design_list_components` | 列出当前页组件 |
| `design_list_pages` | 列出页面 |
| `design_set_token` | 设置单个令牌 |
| `design_align_components` | 对齐/分布（单步撤销） |
| `design_get_state` | 读取完整状态（令牌 + 页面 + 组件 + 活动日志） |
| `design_get_conflicts` | 令牌对比度冲突 |
| `design_undo` / `design_redo` | 撤销 / 重做 |

### 审阅与交付（5）
| 工具 | 说明 |
|---|---|
| `design_audit_accessibility` | WCAG 审计 + 评分 |
| `design_suggest_improvements` | 启发式设计评审 |
| `design_render_preview` | 输出独立 HTML（可选 Playwright PNG） |
| `design_export` | 导出 10 种格式 + 令牌互操作 |
| `design_import_webpage` | 导入 URL / HTML 为组件 |
| `design_list_capabilities` | 自描述清单（必须与注册表一致） |

**外加**：4 个 resources、3 个 prompts。

## 3. 删除清单

### 前端 / 桌面 / 脚本
- `client/`（12 文件，零构建原生 JS Dashboard）
- `client-v2/`（React 19 客户端，含 node_modules）
- `electron/`（main.cjs、server-host.cjs）
- `scripts/validate-design-library.ts`

### Web 服务层
- `src/routes/`（9 文件，83 个 REST 端点）
- `src/collab/`（Yjs 房间 + 投影桥）
- `src/code-sync/`（JSX 双向同步）
- `src/llm/routes.ts`、`src/llm/candidates.ts`、`src/llm/session.ts`（保留 providers/config/agent 供 MCP 工具使用）
- `src/design-library.ts`、`src/resources/design-library/`（抓取的 24/33 风格目录）
- `src/component-library/react-bits-registry.ts`
- `src/animations/`、`src/vanta-effects.ts`

### 被砍工具的注册模块
`design-library-tools.ts`、`platform-tools.ts`、`collab-tools.ts`、`scroll-tools.ts`、
`animation-tools.ts`、`vanta-tools.ts`、`react-bits-tools.ts`、`template-tools.ts`、
`generate-tools.ts`、`explain-tools.ts`、`design-review.ts` 的 3 个（保留 suggest）、
`version-tools.ts`、`project-tools.ts`、`spec-tools.ts`（并入保留工具）

### 依赖（package.json）
删：`express`、`@types/express`、`ws`、`@types/ws`、`yjs`、`y-protocols`、`lib0`、
`electron`、`@playwright/test`（PNG 渲染改为可选动态导入）、`recast`、`@babel/parser`、`fast-json-patch`
保留：`@modelcontextprotocol/sdk`、`zod`、`js-yaml`

## 4. 执行顺序（每步后保持可编译）

1. 删除前端/桌面/脚本目录
2. 删除 Web 服务层目录
3. 删除被砍工具的注册模块
4. 重写 `src/index.ts`（stdio-only）
5. 精简 `capabilities.ts`，同步 resources/prompts
6. 清理 `state.ts` 中的设计库/协同残留
7. 重写 `package.json`（测试改 glob）
8. 删除对应测试，补保留工具的新测试
9. 重写 README（开发者文档）
10. `npm run build` + `npm run lint` + `npm test` 全绿

## 5. 验收标准

- `npm run build` 通过（tsc strict）
- `npm test` 全绿，且测试覆盖保留的 22 个工具
- `design_list_capabilities` 输出的工具名集合 **等于** 实际注册集合（当前存在偏差，必须修掉）
- 仓库无 `client/`、`client-v2/`、`electron/`、`express`、`ws`、`yjs` 引用
- README 描述的是真实工具面，且不含任何已删除能力的描述
