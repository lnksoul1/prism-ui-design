# Prism 功能升级方案设计（网络调研验证版）

> 版本：v2.0 · 日期：2026-08-12
> 任务：5EAB62BDA239-4「功能升级方案设计」
> 范围：基于 2026-08-12 联网核实的 UI/UX 设计网站、设计工具平台与开源项目调研，为 `prism-ui-design-mcp`（MCP 服务端 + Dashboard）与 `prism-studio-v2-prototype` 提出功能升级方案
> 配套文档：[`prism-improvement-plan.md`](prism-improvement-plan.md)（工程底座 / 能力增强 / 产品化）、[`prism-design-plan.html`](prism-design-plan.html)、[`ui-intent-expression-analysis.html`](ui-intent-expression-analysis.html)

**v2.0 变更说明（相对 v1.0）**

- 全部关键调研对象经联网核实（GitHub / 官网 / 评测，2026-08-12 实际访问），修正部分项目日期与 star 量级；
- 新增调研对象：Open Design 0.8.0-preview、Penpot 官方 MCP Server、Astryx 上线一个月数据、Claude Design 2026-06「品牌一致性」更新、Mobbin 官方 Agent Skills、OpenCoworkAI/open-codesign、design-token-bridge-mcp；
- 新增功能项 **F10 品牌导入与设计系统库**——Claude Design 的品牌内置、Open Design 的 129 套设计系统、better-design 的 31 套主题是 2026 年最明确的差异化信号；
- F1–F9 结论不变，证据、功能细节与验收标准更新；里程碑与优先级表同步调整。

---

## 一、结论摘要

2026 年设计工具赛道出现四个结构性变化，直接决定 Prism 的功能升级方向：

1. **AI 原生设计工具开源化**：OpenPencil（Rust + MCP + 并发 Agent Teams）、Open Design（40k+ star，31 Skills + 129 套设计系统）、Meta Astryx（MIT + MCP Server + CLI）证明「设计文件 + MCP + Agent」是标准形态；Prism 已占位 MCP，但缺画布原生编辑、分层生成工作流、并发协作三大能力。
2. **设计系统格式收敛**：W3C DTCG（2025-10 Stable）与 Google DESIGN.md（2026-04 开源，Apache-2.0）形成「结构化 tokens + 自然语言说明」双格式；`npx @google/design.md lint/diff/export` 把「设计系统可校验」变成工具链事实。Prism 需同时支持 DTCG 导入导出与 DESIGN.md 导入，才能融入主流 Agent 工作流。
3. **视觉验证成为 Agent 闭环标配**：framesmith、vrt-mcp（Odiff）、Argos/Percy 类工具把「生成 → 截图 → 视觉 diff → 修复」变成标准链路；Prism 目前 AI 改完设计后自己看不到渲染结果，这是与 2026 年主流工具差距最大的功能缺口。
4. **品牌一致性成为新护城河**：Claude Design 在 onboarding 时读取代码库/设计文件自动构建品牌系统，之后每个项目自动套用；Open Design 内置 129 套品牌级 DESIGN.md 系统；better-design 提供 31 套 shadcn/ui 品牌主题。Prism 应把令牌面板升级为「品牌引擎」：品牌导入 → 令牌化 → 全局应用 + 一致性审计。

据此提出 **10 项功能升级**（F1–F10）：F1 参考/灵感导入、F2 分层生成与并发 Agent 团队、F5 视觉验证闭环、F7 反同质化风格库、F10 品牌导入与设计系统库为差异化优先项；F3 格式互操作、F4 画布编辑增强、F6 实时协作、F8 多模型适配与 i18n、F9 演示与多平台导出为跟进项。总体可并入现有三阶段路线（v1.2.0 → v1.3.0 → v2.0.0）执行。

---

## 二、调研范围与方法

- **来源类型**：UI/UX 设计灵感网站、设计工具平台、开源设计项目与 MCP 生态、设计系统标准与格式。
- **方法**：搜索引擎检索 + 直接访问 GitHub / 官网 / 评测页面（2026-08-12），逐项提炼「亮点 → 对 Prism 的可借鉴点」，再对照 Prism 现有 28 个 MCP 工具、Dashboard 客户端、v2 交互原型做差距分析。
- **核实说明**：本文项目名、功能描述均来自调研当日实际访问的页面；标注「官网/仓库」的结论可直接点击第九节来源复核。

---

## 三、网络调研成果

### 3.1 UI/UX 设计灵感网站与平台（借鉴「内容 / 导入」能力）

| 站点 | 定位 | 可借鉴点 |
|---|---|---|
| Awwwards / Framer Gallery / Godly / Land-book / One Page Love | 精品网页 / 站点灵感库 | 分类标签 + 评分体系；可沉淀为 Prism 的「灵感浏览」数据模型（标签、评分、来源） |
| **Mobbin**（60 万+ 截图、1100+ App，2026-04 发布官方 Agent Skills）/ Page Flows / Refero / Scrnshts | 真实 App 流程与页面截图库 | 按 App × 页面 × 流程组织截图；Mobbin 已把「检索真实截图 → 视觉分析 → 回答设计问题」做成 agent skills，是 Prism「参考图检索」最直接的接入参照 |
| Dribbble / Behance / Figma Community | 视觉稿与设计系统分享 | 社区上传/复用模型；Figma Community 直接分发设计系统文件，Prism 可借鉴「模板 / 组件包」分发形态 |
| uiguides / lazyweb 等聚合导航 | 灵感站点聚合 | 「分类 + 可检索」的元数据组织方式 |

**对 Prism 的启示**：不自建灵感社区，做「导入与借鉴」能力——参考图分析、网页抓取、截图库检索、DESIGN.md/模板导入，让用户把外部灵感直接变成 Prism 设计资产。

### 3.2 设计工具平台（借鉴「功能面」）

| 平台 | 2026 关键动态 | 可借鉴功能 |
|---|---|---|
| Figma | MCP Server 扩展（2026-06：`use_figma` + MCP Skills + Slides + 本地上传字体）；Codex 双向生成（2026-02） | 生态级 MCP（资源 + 技能 + 工具组合）；dev handoff；插件市场 |
| Penpot（开源） | 官方 MCP Server（`@penpot/mcp`，2.15「Master of Puppets」起支持内置托管远程访问；社区服务器 66–68 个工具）；原生设计令牌；CSS Grid/Flexbox 布局引擎；SVG/CSS/HTML 开放标准；自托管 | 「设计即代码」文件格式、多向 AI 工作流（design→code / code→design / design→design）、inspect mode |
| Framer | 模板市场 + 站点发布；Agent 参与构建的组件/模板生态 | 「设计 → 静态站点/HTML 发布」链路；模板 = 资产分发形态 |
| v0 / Bolt / Lovable | v0 官方 MCP（`@vercel/v0-mcp`），四模式（Agent/Chat/Visual Edits/Code/Plan）；Lovable Visual Edits 画布直接改、不耗 AI 额度；Bolt 动画时间轴与微交互配置 | 动画时间轴面板、响应式预览、Visual Edits（画布直接改）；「可视化操作免费、AI 额度留给生成」的体验策略 |
| **Claude Design**（Anthropic Labs，2026-04-17 发布，基于 Opus 4.7） | 对话 + 画布；内联批注 + 直接编辑 + **Claude 生成的调节滑块**；**onboarding 读取代码库/设计文件自动构建品牌系统并全局套用**；Web Capture 抓取页面元素；导出 Canva/PDF/PPTX/HTML；**Handoff Bundle 一键交给 Claude Code**；2026-06 更新：跨项目保持品牌、富布局控件（拖拽/缩放/对齐）、与 Claude Code 协同 | 品牌内置（F10）、可视化滑块精调（F4）、Web Capture（F1）、Handoff Bundle（F3）、跨项目品牌一致性（F10） |
| Google Stitch | Google Labs 免费（350 标准 / 200 Pro 次每月）；多屏同步生成；DESIGN.md 上下文；形容词驱动风格系统 | 多屏幕一致性生成、design.md 作为每次生成上下文、风格语义映射（与 Prism 意图分析报告结论一致） |

### 3.3 开源项目（借鉴「架构与工具面」）

| 项目 | 亮点（2026-08 核实） | 可借鉴点 |
|---|---|---|
| **OpenPencil**（ZSeven-W/openpencil，2026-07） | Rust 单二进制 + Web/桌面；并发 Agent Teams（orchestrator 空间分解 + 每成员画布指示器）；分层工作流 `design_skeleton → design_content → design_refine`；50+ 风格指南 tag 模糊匹配 + anti-slop 多样性追踪；内置 MCP Server（stdio + HTTP）；`.op` JSON 文件 Git 友好；CLI `op`（op design / insert / import:figma）；多框架导出（React/Vue/Svelte/Flutter/SwiftUI/Compose/RN）；P2P 协作（10 位配对码 + 远程光标 + 冲突面板逐编辑回放）；15 语言 i18n；Deck 导出 PDF/PPTX/HTML/视频；58 个场景模板 + Chrome 网页抓取扩展；可嵌入 SDK | F2/F4/F6/F7/F8/F9 的直接对标；「分层设计工作流 + MCP 工具命名 + CLI」是 Prism 最该学的组合 |
| **Open Design**（kvksatish/open-design，0.8.0-preview，40k+ star） | 开源 agent-native 的 Claude Design/Figma 替代：本地 daemon 扫描 16 种 coding-agent CLI 作为设计引擎（BYOK）；**31 个 Skills（27 原型 + 4 演示）+ 129 套品牌级 DESIGN.md 设计系统**；5 大视觉方向（确定性 OKLch 色板 + 字体栈）；生成前「发现表单」锁定简报；五维自批判 + anti-AI-slop 清单；沙箱 iframe 预览；设备框（iPhone 15 Pro 等）；**支持导入 Claude Design 导出 ZIP**；SQLite 持久化；HTML/PDF/PPTX/ZIP 导出；Apache-2.0 | F2（发现表单 + 计划流）、F7（确定性色板防同质化）、F10（129 套设计系统）、F9（设备框）、持久化（并入既有 A2）、「导入竞品导出文件」的互操作思路 |
| **Meta Astryx**（2026-06 开源，Beta） | agent-ready React 设计系统（React + StyleX）；内置 MCP Server + `astryx` CLI（`--dense` 去掉人话、输出 token 高效载荷）；agent 可 scaffold 项目 / 浏览模板 / 生成主题；上线一个月：core 190K、cli 126K、themes 480K（7 套主题） | F3「CLI/manifest 自描述」：Prism 提供 `prism` CLI 或 MCP 工具清单 manifest，让 Agent 免 help 调用；「代码即文档、文档可被 LLM 消费」的产品形态 |
| **shadcn/ui + Base UI**（2026-07 起默认 Base UI）+ ReUI | 组件注册表 registry.json、代码归用户所有；ReUI 966+ 免费 patterns | F3「组件注册表」：Prism 组件库以 registry 形式分发，React 导出按注册表语义组织 |
| **ui-toolkit-mcp**（@elsahafy/ui-toolkit-mcp） | 13 工具 + 5 Resources + 3 Prompts：组件生成、令牌管理、a11y 审计、页面检查、截图对比、Storybook 生成；支持 React/Vue/Svelte/Angular/Web Components；Playwright 截图 | 当前最接近「完整 UI 工程 MCP」的标杆，逐项对标（Resources/Prompts 清单、审计规则集） |
| **better-design**（marvkr/better-design） | 31 套品牌级 shadcn/ui 主题（Linear/Stripe/Vercel/Notion/Apple/Supabase/Figma…）+ 设计令牌 + UI 原则 + WCAG 规则 | F10 主题库形态；设计 MCP 与组件注册表结合 |
| **framesmith**（vicmaster/framesmith） | headless Chromium 把 HTML/CSS 场景图渲染为 PNG；canvas viewer 断点预览；`canvas_import_html` 反向导入（HTML → 可编辑场景图）；1.9 支持图表节点；字体离线确定性渲染 | F5 截图渲染 + 反向导入的参考实现；「渲染结果有 viewer 可看」的体验 |
| **vrt-mcp**（NoirJ0e/vrt-mcp） | Odiff 视觉回归；Figma API 取设计稿；本地 PNG 参考图；智能视口匹配 | F5 视觉 diff 的直接参考：side-by-side + diff 叠加图 |
| **design-token-bridge-mcp**（kenneives/design-token-bridge-mcp） | DTCG 提取器；生成 Material 3（Kotlin）/SwiftUI（Liquid Glass）/Tailwind/CSS Variables 原生主题；面向 v0 → Figma → Claude Code 管线 | F3 多平台令牌生成的直接参考 |
| **OpenCoworkAI/open-codesign** | 最早的开源 Claude Design 替代：流式 artifact 循环、沙箱 iframe、live agent 面板（todos + 工具调用 + 可中断）、五格式导出（HTML/PDF/PPTX/ZIP/Markdown） | F2 生成编排 + F9 导出形态；「生成过程对用户可见可中断」的交互 |
| **Mobbin Skills**（mobbin/skills） | 官方 agent skills：搜索真实 App 截图并视觉分析后回答设计问题 | F1「参考图检索」工具可参照其 prompt 组织方式 |

### 3.4 标准与规范

- **W3C DTCG（2025-10 Stable）**：`$value/$type/$description` 已成工具间互操作基线，被 Style Dictionary、Tokens Studio、Figma 采纳；Prism 当前私有 `{value, source}` 需升级。
- **DESIGN.md（google-labs-code/design.md，2026-04，Apache-2.0）**：YAML front matter（tokens）+ Markdown prose；`{colors.primary}` 引用语法；CLI lint/diff/export（Tailwind v3/v4、DTCG JSON）。Open Design 采用 9 节扩展 schema（color / typography / spacing / layout / components / motion / voice / brand / anti-patterns）。
- **MCP 规范演进**：streamable HTTP、Resources / Prompts / Skills 成为主流设计类 server 标配；小工具集 + 懒发现 + 扁平参数是 Agent 可用性最佳实践。
- **WCAG 2.2**：焦点可见性、目标尺寸、拖拽替代操作（前次调研已覆盖，保持为审计规则来源）。

---

## 四、差距分析（对照 Prism 现状）

Prism 现有能力：28 个 MCP 工具（design_* 画布/令牌/主题 + ui_* 生成器）、REST + WebSocket 双通道、状态内存储 + Undo/Redo、令牌冲突检测、多页面、Dashboard 三栏布局 + 设计库拖拽、7 平台按钮、v2 原型（属性检查器/图层面板/缩放定位）。

| 维度 | 2026 主流（OpenPencil / Open Design / Penpot / Claude Design 等） | Prism 现状 | 差距 |
|---|---|---|---|
| 画布编辑 | 无限画布、对齐/吸附、自动布局、图层面板、多选、自由定位、布尔运算 | 仅顺序/删除，v2 原型有检查器但未迁入 Dashboard | 大（F4） |
| Agent 生成 | 分层工作流 + 并发 Agent 团队 + 生成前发现表单 + 计划流 | 单次全量生成，无分层、无并发、无简报 | 大（F2） |
| 视觉闭环 | 截图渲染 + 视觉 diff + a11y 审计 + HTML 反向导入 | 无（截图依赖 window.open/print） | 大（F5） |
| 参考输入 | Web 抓取、参考图分析、截图库检索、DESIGN.md/模板导入 | 仅 HTML/JSX/Vue 项目导入 | 大（F1） |
| 品牌与设计系统 | 品牌自动内置（Claude Design）、129 套系统（Open Design）、31 套主题（better-design） | 6 种风格预设，无品牌导入与系统库 | 大（F10） |
| 格式互操作 | DTCG + DESIGN.md + registry + CLI manifest + Handoff Bundle | 私有 `{value,source}` + figma_tokens 导出 | 中（F3） |
| 协作 | P2P 实时光标 + 冲突面板 + 逐编辑回放 | 仅 WS 全量状态广播 | 中（F6） |
| 风格与多样性 | 50+ 风格 tag 模糊匹配 + 确定性色板 + anti-slop | 6 种风格预设，无标签匹配 | 中（F7） |
| 模型适配 | 按模型 tier 适配 prompt/thinking | 单一提示模板 | 中（F8） |
| 演示与导出 | Deck（PDF/PPTX/HTML/视频）、设备框、多框架代码导出 | HTML 导出为主 | 中（F9） |

---

## 五、功能升级方案

> 每条均给出：借鉴来源、具体功能、落点、验收标准、工作量（S/M/L）。落点均限定在 `prism-ui-design-mcp/src/` 新模块，避免与并行执行的其他线程冲突。

### F1. 参考与灵感导入（差异化入口）

- **借鉴**：OpenPencil/Claude Design Web 抓取、Mobbin 官方 Agent Skills 与参考图语料、Figma Community 模板分发、DESIGN.md 导入。
- **功能**：
  1. `design_import_reference_image`：上传截图/设计稿 → 提取主色/字体/布局结构 → 生成和谐色板与风格建议（复用 `ui_generate_color_palette`）。
  2. `design_import_webpage`：输入 URL 或粘贴 HTML → 提取布局骨架与组件 → 生成 Prism 页面初稿（参照 OpenPencil Chrome 抓取扩展的「忠实 HTML/布局捕获」标准）。
  3. `design_search_references`（可选）：接入 Mobbin 类截图库检索「App × 页面 × 流程」参考图，返回截图 + 元数据供分析与导入（预留 API 适配层，先支持本地语料/URL）。
  4. `design_import_design_md`：解析 DESIGN.md（YAML tokens + prose）→ 映射为 Prism 令牌集与语义规则；支持 `npx @google/design.md lint` 结果展示。
  5. 模板中心：内置模板按场景（Landing/Dashboard/Portfolio/Blog/电商/设置/登录）分类，模板 = 组件树 + 预设令牌 + 语义标签（并入 C3）。
- **落点**：`src/tools/` 新增 3–4 个工具 + `src/import-reference.ts`；客户端「导入」菜单。
- **验收**：一张电商页面截图可导入生成 1:1 色板与 5+ 组件初稿；一个 URL 可生成可编辑页面；一份 DESIGN.md 可完整还原令牌并 lint 通过。
- **工作量**：M（参考图分析 + Web 抓取各 S/M，共 M）。

### F2. 分层生成与并发 Agent 团队

- **借鉴**：OpenPencil 的 `design_skeleton → design_content → design_refine` 与并发 Agent Teams；Open Design 的生成前「发现表单」+ 计划流 + 可中断 agent 面板；open-codesign 的流式 artifact 循环。
- **功能**：
  1. `design_generate(skeleton|content|refine)` 三阶段生成，后一阶段只见前一阶段产物（聚焦 prompt，提升保真度）。
  2. 生成前简报（discovery form）：一次问答锁定页面类型/受众/语气/品牌上下文，产出结构化简报作为生成上下文（对标 Open Design，30 秒收音胜过反复改稿）。
  3. 页面分解：复杂页面按空间区域（hero/features/footer）拆分为子任务，可并行生成；客户端以「区域指示器」展示每个区域状态（进行中/完成/失败），生成可中断。
  4. 生成结果先进入草稿层，用户/AI 确认后合入主状态（避免半成品污染画布，支持 Undo）。
- **落点**：`src/tools/design-generate.ts` + `state.ts` 增加 draft 层与简报字段 + 客户端区域指示器/计划卡片。
- **验收**：同一 prompt 三阶段生成的页面组件完整度高于单次生成；分解后 3 区域可并行且互不覆盖；draft 合入可 Undo；生成过程可中断且状态一致。
- **工作量**：L（状态层 + 生成编排；简报 S，串行分层 M，并发 L）。

### F3. 设计系统格式互操作与自描述

- **借鉴**：DTCG、DESIGN.md（含 9 节 schema）、Astryx CLI/MCP manifest（`--dense`）、shadcn registry、Penpot design-as-code、Claude Design Handoff Bundle、design-token-bridge-mcp。
- **功能**：
  1. `design_export_tokens(dtcg|design_md|css|style-dictionary|tailwind4|material3|swiftui)`；`design_import_tokens` 支持 DTCG 与 DESIGN.md（merge 策略）。
  2. `design_export_components(registry_json|react|html)`：按 registry 语义输出组件清单与代码；React 导出默认对齐 Base UI/shadcn 模式（代码归用户、可定制）。
  3. 工具清单 manifest：`design_list_capabilities` 返回自描述 JSON（工具名/参数/schema/示例），供任意 Agent 免 help 调用（对标 Astryx manifest）。
  4. 可选 `prism` CLI：`prism design file.json`、`prism export`，与 MCP 共用同一 service 层（对标 `op` CLI）。
  5. `design_export_handoff`：打包「HTML 预览 + DTCG/DESIGN.md 令牌 + 组件代码 + 实现说明」为 ZIP 交接包，供任意 coding-agent 直接开工（对标 Claude Design Handoff Bundle）。
- **落点**：`src/tokens/`（DTCG/DESIGN.md 模型 + 生成）、`src/tools/design-export.ts`、`cli/`。
- **验收**：导出 DTCG JSON 可被 Style Dictionary 直接消费；导出 DESIGN.md 可被 `@google/design.md lint` 零错误；`design_list_capabilities` 输出可直接驱动客户端工具面板；交接包可被 Claude Code/Codex 打开并按其说明生成页面。
- **工作量**：M（交接包 S）。

### F4. 画布编辑器增强（迁移 v2 原型能力）

- **借鉴**：Figma/Penpot/OpenPencil 画布标准能力；Claude Design 调节滑块；Prism v2 原型已实现其中一部分。
- **功能**：属性检查器（宽高/间距/颜色/动画参数滑块）、画布缩放（25–200%）与平移、组件自由定位（x/y）+ 对齐/吸附参考线、自动布局（水平/垂直 + gap/padding/justify/align）、图层面板（排序/显隐/重命名/锁定）、多选 + Ctrl+D 复制 + Delete/方向键微调。
- **落点**：`state.ts` 的 `ComponentNode` 增加 `layout/visible/locked`；`design_update_component` 支持布局属性；`client/` 迁移 v2 交互。
- **验收**：Dashboard 与 v2 原型交互能力对齐；所有布局操作可通过 MCP 工具执行并可被 AI 观察。
- **工作量**：L（属性检查器 + 布局字段 M，自由定位/自动布局 L）。

### F5. 视觉验证闭环（Agent 自检）

- **借鉴**：framesmith（含反向导入与 viewer）、vrt-mcp（Odiff）、Argos/Percy。
- **功能**：
  1. `design_render_preview`：当前设计 → HTML → headless Chromium → PNG（base64 或 `previews/` 落盘）。
  2. `design_visual_diff`：两张截图像素级 diff（Odiff 式），返回 diff 图 + 变更区域列表。
  3. `design_import_html`：粘贴 HTML 片段 → 渲染并反推可编辑组件树（framesmith `canvas_import_html` 思路，作为 F1 的补充）。
  4. `design_audit_accessibility` + 冲突检测扩展（对比度/焦点/目标尺寸，并入已有 B2）。
  5. 客户端「截图」按钮改为调用 `/api/render` 返回真实 PNG；提供简单 preview viewer（断点切换）。
- **落点**：`src/renderer/` + `src/audit/` + `design_render_preview`/`design_visual_diff`/`design_import_html` 工具。
- **验收**：AI 调用渲染后可看到自己生成的设计；改前/改后 diff 能定位到组件 ID；截图与画布像素一致。
- **工作量**：M（Playwright 为可选依赖，无截图需求可降级为 HTML 预览）。

### F6. 实时协作与冲突回放

- **借鉴**：OpenPencil P2P 会话（配对码 + 远程光标 + 冲突面板逐编辑回放）、Figma 协作。
- **功能**：加入码短链会话、实时远程光标、操作级广播（替代全量状态广播）、冲突面板（逐编辑 diff + 丢弃编辑回放）。
- **落点**：`src/service/collab.ts` + WS 消息协议扩展 + 客户端光标/冲突 UI。
- **验收**：双端同时编辑不互相覆盖；冲突可在面板中逐条回放与恢复。
- **工作量**：L。

### F7. 反同质化与风格指南库

- **借鉴**：OpenPencil 50+ 风格指南 tag 模糊匹配 + anti-slop 多样性追踪；Open Design 5 大视觉方向（确定性 OKLch 色板 + 字体栈）。
- **功能**：
  1. 风格标签库：glassmorphism/brutalist/retro/新拟态等，`design_get_style_guide` / `design_apply_style_guide` 按 tag 模糊匹配应用到生成结果。
  2. 确定性视觉方向：内置 5 组「方向 → OKLch 色板 + 字体栈」映射，用户无品牌时可一键选取，避免模型自由发挥导致同质化（并入 C1 语义层）。
  3. 多样性追踪：跨生成记录 token 分布与布局结构指纹，相似度过高时提示换风格（anti-slop）。
- **落点**：`src/semantics/style-guides.ts` + 2 个工具 + 客户端风格选择器。
- **验收**：同一 prompt 连续生成 5 次，布局指纹差异 > 阈值；风格指南应用后可一键回退。
- **工作量**：M。

### F8. 多模型能力适配与 i18n

- **借鉴**：OpenPencil model capability profiles（Claude 全 prompt、GPT-4o/Gemini 关 thinking、小模型简化 JSON prompt）；i18n 15 语言。
- **功能**：按模型 tier 生成 prompt 模板（thinking 开关、JSON 深度）；Dashboard 界面 i18n（至少 中/英，结构支持扩展）。
- **落点**：`src/llm-profiles.ts` + 客户端 i18n 字典。
- **验收**：同一任务在不同 tier 模型下输出结构稳定；切换语言后 UI 完整。
- **工作量**：S/M。

### F9. 演示与多平台代码导出

- **借鉴**：OpenPencil deck（PDF/PPTX/HTML 幻灯片、视频合成）+ 多框架导出；Open Design 设备框；Bolt 动画时间轴。
- **功能**：演示模式（画布 → 幻灯片，导出 PDF/PPTX/HTML）；设备框预览（iPhone 15 Pro/Pixel/iPad/MacBook/浏览器框，供导出图与演示使用）；代码导出扩展 React Native/Flutter/SwiftUI/Compose（现有 B5 基础上按组件类型映射）；动画参数可视化时间轴面板。
- **落点**：`src/tools/design-export.ts` + 客户端演示视图/设备框渲染。
- **验收**：设计稿可一键导出可播放的 HTML 演示与 PDF；新增 1–2 个目标框架的组件级导出模板；演示导出图带设备框。
- **工作量**：M/L（演示 M，多框架 L）。

### F10. 品牌导入与设计系统库（新增，差异化）

- **借鉴**：Claude Design 品牌内置（onboarding 读取代码库/设计文件构建品牌系统并全局套用）、Open Design 129 套品牌级 DESIGN.md 系统、better-design 31 套 shadcn/ui 主题。
- **功能**：
  1. `design_import_brand`：上传品牌资产（logo/色板截图/字体/设计稿）→ 提取品牌色、字重、圆角、间距倾向 → 生成 Prism 品牌令牌集与语义规则（复用 F1 图像分析）。
  2. 设计系统库：内置 10+ 套参考系统（Linear/Stripe/Notion 等风格的令牌级复刻，注意许可证与品牌使用规范），以 DTCG JSON/DESIGN.md 分发，可一键应用、混搭与回退。
  3. `design_apply_design_system`：整库切换令牌 + 语义规则；与 F7 风格库区分——风格 = 视觉方向，设计系统 = 完整令牌体系 + 组件语义。
  4. `design_audit_brand_consistency`：检测偏离品牌令牌的组件（颜色越界、字体漂移），返回偏离列表与一键修正建议，形成「品牌 → 生成 → 审计 → 修正」闭环。
  5. 客户端「品牌导入向导」：拖拽资产 → 预览提取结果 → 确认令牌 → 全局生效。
- **落点**：`src/tokens/brand.ts` + `src/tools/design-brand.ts` + 客户端品牌导入向导。
- **验收**：导入品牌后新生成页面全程使用品牌令牌；切换设计系统一键生效且可回退；一致性审计能定位到具体组件并一键修正。
- **工作量**：M（品牌提取 S/M + 系统库 M）。

---

## 六、优先级与里程碑

| 优先级 | 功能 | 工作量 | 理由 |
|---|---|---|---|
| P0 | F5 视觉验证闭环（渲染 + diff 基础版） | M | 补齐 Agent 自检，直接对齐 2026 主流 |
| P0 | F2 分层生成（skeleton/content/refine + 简报） | M（先做串行） | 生成质量提升最快、改动可控 |
| P0 | F1 参考图/URL/DESIGN.md 导入 | M | 差异化入口，低成本高感知 |
| P1 | F3 格式互操作 + manifest + 交接包 | M | 生态集成，Agent 可用性 |
| P1 | F4 属性检查器 + 图层面板（v2 迁移子集） | M | 用户体验短板 |
| P1 | F7 风格库 + 确定性方向 + anti-slop | M | 差异化，与 C1 语义层天然衔接 |
| P1 | F10 品牌导入 + 设计系统库基础版 | M | 2026 年最明确的差异化信号，与 F1/F3 复用 |
| P2 | F4 自由定位/自动布局、F6 协作、F9 多框架导出、F8 i18n | L | 工作量大的跟进项 |

里程碑建议：

- **M1（≈2 周）**：F5 渲染 + F2 串行分层 + F1 参考图/URL 导入（P0 三件套）。
- **M2（≈4 周）**：F3 互操作 + F4 检查器/图层 + F7 风格库 + F10 品牌导入基础版。
- **M3（≈8 周）**：F6 协作 + F4 自由布局 + F9 演示/多框架导出 + F8 i18n + F10 设计系统库扩充。

---

## 七、与现有改进计划的关系

- 本方案是 `prism-improvement-plan.md` 的**功能补充**：其 Phase A/B/C 覆盖工程底座（测试/持久化/双通道）、能力增强（截图/a11y/DTCG/Resources/Prompts）、产品化（语义层/多平台/模板/版本），本方案聚焦「从外部调研吸收的功能点」，不重复实现细节。
- 直接衔接点：F5 复用其 B1（截图渲染）；F3 复用其 B3（DTCG）并新增 DESIGN.md/CLI manifest/交接包；F4 复用其 B6（画布编辑增强）并给出更细的 v2 迁移清单；F7 并入其 C1 语义层；F10 的品牌令牌溯源并入 C1（语义来源），设计系统库并入其 C3（模板/组件市场）；F6 并入其 C5 协作；F9 并入其 B5 导出升级。
- 建议将两份文档合并为 `docs/` 下的「改进总纲 + 功能升级分册」，避免后续执行时两份清单漂移。

---

## 八、风险与依赖

| 风险 | 等级 | 缓解 |
|---|---|---|
| 并发 Agent 团队复杂度高（F2 并发部分） | 高 | 先做串行分层 + 简报（P0），并发作为 P2；草稿层隔离 |
| Playwright/Chromium 体积与安装 | 中 | 可选依赖；无截图需求时降级为 HTML 预览 |
| DESIGN.md alpha 规范（SRGB-only）与 9 节扩展 schema 的兼容 | 低 | 以官方 spec 为导出目标，9 节 schema 仅用于内部导入映射；DTCG 仍为主格式 |
| 品牌/设计系统库的商标与许可风险 | 中 | 只复刻「令牌级风格特征」，不复制商标资产；内置系统注明来源与许可（Apache/MIT 优先） |
| 多框架导出模板维护成本 | 中 | 先做 1–2 个高需求框架，模板由组件 schema 驱动 |
| 竞品（Claude Design/Figma/Open Design）快速迭代 | 中 | 差异化聚焦「语义中间层 + 多平台 + 可审计」，不与通用生成正面竞争 |
| 与其它线程（按计划执行）工作目录冲突 | 中 | 功能落点均限定在 `prism-ui-design-mcp/src/` 新模块；涉及共享文件的改动并入既有改进计划评审 |

---

## 九、调研来源（2026-08-12 访问）

**开源项目 / GitHub**

- ZSeven-W/openpencil（2026-07）：https://github.com/ZSeven-W/openpencil
- open-pencil/open-pencil（Figma 兼容 AI 编辑器，MIT）：https://github.com/open-pencil/open-pencil
- kvksatish/open-design（0.8.0-preview，40k+ star）：https://github.com/kvksatish/open-design
- OpenCoworkAI/open-codesign：https://github.com/OpenCoworkAI/open-codesign
- marvkr/better-design（31 套主题）：https://github.com/marvkr/better-design
- vicmaster/framesmith：https://github.com/vicmaster/framesmith
- NoirJ0e/vrt-mcp：https://github.com/NoirJ0e/vrt-mcp
- penpot/penpot-mcp（官方 MCP）：https://github.com/penpot/penpot-mcp
- kenneives/design-token-bridge-mcp：https://github.com/kenneives/design-token-bridge-mcp
- google-labs-code/design.md（spec + CLI）：https://github.com/google-labs-code/design.md
- mobbin/skills（官方 Agent Skills）：https://github.com/mobbin/skills
- @elsahafy/ui-toolkit-mcp（13 工具 / 5 Resources / 3 Prompts）：https://www.npmjs.com/package/@elsahafy/ui-toolkit-mcp
- @google/design.md（CLI）：https://www.npmjs.com/package/@google/design.md

**官方博客 / 产品页**

- Anthropic：Introducing Claude Design（2026-04-17）：https://www.anthropic.com/news/claude-design-anthropic-labs
- Claude：Claude Design stays on brand（2026-06）：https://claude.com/blog/claude-design-stays-on-brand-for-daily-work
- Figma：4 Ways We're Using Our MCP Server at Figma（2026-06）：https://www.figma.com/blog/4-ways-were-using-our-mcp-server-at-figma/
- OpenAI：Building frontend UIs with Codex and Figma（2026-02）：https://developers.openai.com/blog/building-frontend-uis-with-codex-and-figma
- Penpot：Multi-directional AI workflows（2026-06）：https://penpot.app/blog/guide-to-multi-directional-ai-workflows/
- Penpot：2.15 Release Notes（2026-04）：https://penpot.app/release-notes/2-15-master-of-puppets
- Astryx 官网：https://astryx.atmeta.com/ ；One Month of Astryx：https://astryx.atmeta.com/blog/one-month-of-astryx
- Vercel：v0 vs Lovable（2026-07）：https://vercel.com/i/v0-vs-lovable
- W3C DTCG（2025.10 Stable）：https://www.designtokens.org/ ；https://www.w3.org/community/design-tokens/

**评测与文章**

- DataScienceDojo：Claude Design vs Google Stitch（2026-04）：https://datasciencedojo.com/blog/claude-design-vs-google-stitch-ai-design-wars-2026/
- Muzli：15 AI Design Tools That Actually Change How You Work in 2026：https://feed.muz.li/best-ai-design-tools-for-ui-ux-designers-in-2026/
- zpedu：v0 / Lovable / Bolt 横评（2026-05）：https://www.zpedu.com/it/cpsj/37106.html
- EPAM：Best Vibe Coding Tools 2026 实测：https://www.epam.com/insights/ai/blogs/best-vibe-coding-tools-v0-lovable-bolt-replit-and-figma-make
- xda-developers：Penpot 自托管体验：https://www.xda-developers.com/self-hosted-figma-alternative-is-great-but-not-for-everyone-penpot/
- Open Source For You：Meta Astryx：https://www.opensourceforu.com/2026/06/meta-open-sources-astryx/
- MarkTechPost：Astryx CLI/MCP：https://www.marktechpost.com/2026/06/27/metas-astryx-brings-a-cli-and-mcp-server-to-an-open-source-react-design-system-agents-can-read/
- UIGuides：Awwwards Review 2026：https://www.uiguides.com/tools/awwwards-review
- Bookmarkify：15 Best Branding Inspiration Websites 2026：https://www.bookmarkify.io/blog/best-branding-inspiration-websites
- Toimi：Web Design Trends 2026：https://toimi.pro/blog/web-design-trends-what-works/
- The AI Agent Index：v0 vs Lovable 对比：https://theaiagentindex.com/compare/v0-vercel-vs-lovable
