# Prism 平台升级方案：集成 Lenis / GSAP / Vanta.js / React Bits

> 版本：v1.0 · 日期：2026-08-12
> 范围：`prism-ui-design-mcp`（MCP 服务端 + REST/WS）+ `client/`（Dashboard + tldraw 画布）+ 导出产物
> 依据：四个 GitHub 仓库源码深度阅读（darkroomengineering/lenis、greensock/GSAP、tengbao/vanta、DavidHDev/react-bits）+ Prism 当前源码审计（28+ MCP 工具文件、`constants.ts`、`design-tools.ts` 13 入场 + 7 悬停动画预设、14 风格预设、41 组件类型、tldraw 画布 v3）

---

## 1. 背景与目标

Prism 已经具备完整的 MCP 工具链、tldraw 画布、设计令牌系统、多平台设计状态、实时协作与多框架导出。当前动效层为 **CSS keyframes 驱动的 20 种预设**（13 入场 + 7 悬停），导出页面为静态 HTML，滚动体验为浏览器原生滚动。

本次升级引入四个业界一流开源库，目标：

| 维度 | 现状 | 升级目标 |
|---|---|---|
| 滚动 | 原生滚动，导出页无平滑感 | Lenis 驱动的平滑滚动 + 锚点 + 嵌套滚动 + reduced-motion |
| 动画 | 20 种 CSS keyframes 预设 | GSAP 引擎 + ScrollTrigger + SplitText + MorphSVG，预设扩至 40+ |
| 背景 | 纯色/渐变令牌 | Vanta.js 14 种 WebGL 3D 动态背景，可作为组件/Section 背景 |
| 组件库 | 41 种基础组件类型 | 移植 React Bits 165+ 动画组件（Text/Animations/Components/Backgrounds） |
| 导出 | HTML/React/Vue/Svelte/Flutter/SwiftUI/Tailwind | 导出页面可选注入 Lenis + GSAP CDN，开箱即用的"活页面" |

非目标：不替换 tldraw 画布内核；不重写 MCP 服务端 TypeScript 架构；不动现有 268 项测试基线（仅增量）。

---

## 2. 四个仓库核心能力分析

### 2.1 Lenis（darkroomengineering/lenis）

**仓库结构**：monorepo，`packages/{core,react,vue,snap}`，零运行时依赖，MIT。

**核心能力**：
- 基于 `requestAnimationFrame` 的轻量平滑滚动（几 KB），不劫持原生 scroll → `position: sticky`、锚点、无障碍全部保留。
- 单实例支持垂直/水平/嵌套滚动，`allowNestedScroll` 自动识别嵌套可滚动容器。
- **与 GSAP ScrollTrigger 一等公民集成**：`lenis.on('scroll', ScrollTrigger.update)` + `gsap.ticker.add(time => lenis.raf(time*1000))` + `gsap.ticker.lagSmoothing(0)`。
- 关键 API：`new Lenis(options)`、`lenis.scrollTo(target, {offset, duration, easing, onComplete, lock})`、`lenis.on('scroll'|'virtual-scroll')`、`lenis.raf(time)`、`lenis.start()/stop()/destroy()/resize()`。
- HTML 属性钩子：`data-lenis-prevent` / `-wheel` / `-touch` / `-vertical` / `-horizontal` 精细控制嵌套滚动。
- `respectReducedMotion: true`（默认）自动 honor `prefers-reduced-motion`，平滑关闭但同步保留。
- 框架适配：`lenis/react`（`useLenis` hook + `<ReactLenis root>`）、`lenis/vue`、`lenis/snap`（CSS scroll-snap 替代）。
- No-code 一行接入：`<script src="https://unpkg.com/lenis@1.3.26/dist/lenis.min.js"></script>` + `new Lenis({autoRaf:true, autoToggle:true, anchors:true, allowNestedScroll:true})`。

**对 Prism 价值**：导出页面与"预览模式"的滚动质感跃升；ScrollTrigger 联动为 GSAP 集成铺路；嵌套滚动解决 Prism 画布/侧栏/检查器多层 overflow 的滚动穿透问题。

### 2.2 GSAP（greensock/GSAP）

**仓库结构**：`src/` 含 26 个插件文件，`gsap-core.js`（151KB）为核心，`ScrollTrigger.js`（100KB）为最重磅插件。**已 100% 免费**（Webflow 收购后，包括 SplitText、MorphSVG 等 Club 插件）。

**核心能力**：
- 框架无关、零依赖、比 jQuery 快 20x 的高速属性插值引擎。
- 关键插件：
  - **ScrollTrigger**：滚动驱动动画（pin、scrub、snap、容器联动、batch、horizontal）。
  - **ScrollSmoother**：ScrollTrigger 的平滑滚动伴侣（与 Lenis 功能重叠，Lenis 更轻量，本方案不采用）。
  - **SplitText**：把文字拆为字符/单词/行，做入场/错落/打字机效果。
  - **MorphSVG**：SVG 路径形变动画。
  - **Flip**：First-Last-Invert-Play，状态切换零闪烁过渡（列表重排、布局切换）。
  - **Draggable**：拖拽 + InertiaPlugin 抛物惯性。
  - **MotionPathPlugin**：沿任意 SVG 路径运动。
  - **Observer**：跨浏览器统一指针/滚轮/触摸事件。
  - **CustomEase / CustomBounce / CustomWiggle**：自定义缓动曲线。
  - **TextPlugin**：打字机文本替换。
  - **ScrambleTextPlugin**：乱码到目标文本的解码效果。
- React 适配：`@gsap/react` 的 `useGSAP()` hook（`useLayoutEffect` 替代 + 自动 cleanup）。
- CDN：`https://cdn.jsdelivr.net/npm/gsap@3.15/dist/gsap.min.js`，按需引入 `gsap/ScrollTrigger`。
- `gsap.matchMedia()` 响应式动画 + 无障碍断点。

**对 Prism 价值**：替换 CSS keyframes 引擎 → 时间线编排、ScrollTrigger 入场、SplitText 标题特效、Flip 列表重排、MorphSVG 图标变形、CustomEase 自定义曲线；动画预设从 20 扩到 40+，且每条预设可带参数（duration/delay/stagger/ease/scrollTrigger 配置）。

### 2.3 Vanta.js（tengbao/vanta）

**仓库结构**：`src/` 14 个 effect 文件 + `_base.js` + `_shaderBase.js` + `_p5Base.js` + `gallery.js`，依赖 three.js（r134）或 p5.js。

**核心能力**：
- 一行代码为任意 HTML 元素注入 3D 动态背景：`VANTA.WAVES({el, color, ...})`。
- 14 种内置效果：`BIRDS、CELLS、CLOUDS、CLOUDS2、DOTS、FOG、GLOBE、HALO、NET、RINGS、RIPPLE、TOPOLOGY、TRUNK、WAVES`。
- 鼠标/触摸交互（`mouseControls`/`touchControls`/`gyroControls`）。
- 参数可热更新：`effect.setOptions({color: 0xff88cc})`、`effect.resize()`、`effect.destroy()`。
- 支持自定义 THREE/p5 实例（`BIRDS({el, THREE})`），可与项目既有 three.js 共享。
- 体积 ~120KB gzipped（主要是 three.js），小于可比背景图/视频。
- React/Vue/Angular 均有官方示例（`useRef` + `useEffect` + `destroy()` cleanup）。

**对 Prism 价值**：新增"3D 动态背景"组件类型与 Section 背景属性；14 种效果参数化为设计令牌（color/waveHeight/shininess/zoom 等）；为 Hero/CTA/Empty State 提供高端视觉；导出页面注入 three.js + vanta CDN 即可用。

### 2.4 React Bits（DavidHDev/react-bits）

**仓库结构**：`src/components/{code,common,context,landingnew,layout,navs,setup}` + `src/{ts-default,ts-tailwind}` 变体目录，165+ 组件，MIT + Commons Clause（个人/商用免费）。

**核心能力**：
- 165+ 动画 React 组件，4 大类：Text Animations、Animations、Components、Backgrounds。
- 每个组件 4 个变体：`JS-CSS / JS-TW / TS-CSS / TS-TW`，覆盖所有主流技术栈。
- shadcn 风格 CLI 安装：`npx shadcn@latest add @react-bits/BlurText-TS-TW`，或 jsrepo。
- 配套创意工具：Background Studio、Shape Magic（内圆角 SVG）、Texture Lab（噪点/抖动/ASCII 滤镜）。
- 文件可直拷贝、可深度定制（不打包成依赖，源码即组件）。
- 官方 Vue/Svelte 移植（vue-bits.dev、sveltebits.xyz）。

**对 Prism 价值**：组件库从 41 扩到 200+，每个组件天然带高级动画（BlurText、DecryptText、ScrambledText、Splitchar、ShinyText、GradientText；AnimatedContent、ScrollFloat、TextPressure 等）；可直接作为 Prism 画布组件类型的"动画版本"集合，令牌驱动其颜色/字号/速度。

---

## 3. Prism 当前状态评估与差距

### 3.1 动画层（`src/tools/design-tools.ts` L1340-1361）

当前 `design_set_animation` 接受 13 入场 + 7 悬停预设（`fadeUp, fadeIn, scaleIn, slideLeft, slideRight, slideUp, spring, bounceIn, flipIn, cinematic, shimmer, glitch, morphBlob` / `scaleUp, lift, glow, ripple, spotlight, magnetic, tilt`），实现为 CSS keyframes 字符串注入到组件 `style` 字段。

**差距**：
- 无时间线编排（无法 A 完成后再 B）。
- 无 ScrollTrigger（无滚动触发）。
- 无文字拆分特效（SplitText 缺位）。
- 无 SVG 形变（MorphSVG 缺位）。
- 无自定义缓动（固定 cubic-bezier）。
- stagger 仅按同辈索引线性，无 from 中心/edges 等高级分布。
- 导出 HTML 时动画为内联 CSS，无 JS 引擎，离场动画/交互触发不可实现。

### 3.2 滚动层（`client/index.html` + 导出 HTML）

Dashboard 主滚动容器 + 侧栏/检查器/画布多层 `overflow`，导出页面为浏览器原生滚动。

**差距**：
- 无平滑滚动 → 导出页"硬切"感。
- 无锚点平滑跳转。
- 嵌套滚动穿透未系统化处理（依赖 `overflow:auto` 兜底）。
- 无 `prefers-reduced-motion` 显式降级。

### 3.3 背景层（`src/tokens.ts` 颜色/渐变令牌）

背景只能纯色或 CSS 渐变，无动态/3D 背景。

**差距**：Hero/CTA/Empty State 缺乏高端视觉锚点；与 v0/Lovable/Framer 等竞品相比视觉冲击力不足。

### 3.4 组件层（`src/constants.ts` 41 类型）

41 种基础组件类型（button/card/hero/navbar/feature_grid/bento_grid/glass_card 等）。

**差距**：无"自带高级动画的组件"集合；要实现 BlurText 标题需用户手工叠加 animation 预设，无法一键获得 React Bits 级别的成熟动效组件。

### 3.5 导出层（`src/tools/design-tools.ts` design_export）

支持 html/react-ts/vue/svelte/flutter/swiftui/css/tailwind/presentation，但导出 HTML 为静态 + 内联 CSS 动画。

**差距**：导出页面无运行时动画引擎 → 离场/触发型动效失效；无 Lenis 平滑滚动；无 GSAP ScrollTrigger 触发；无 Vanta 3D 背景。

---

## 4. 升级总策略与架构

### 4.1 三层叠加策略

```
┌─────────────────────────────────────────────────────────────┐
│  L3 组件层  ← React Bits 移植（165+ 动画组件，4 变体）       │
│  L2 背景层  ← Vanta.js（14 种 WebGL 3D 背景）                │
│  L1 动效层  ← GSAP 引擎（ScrollTrigger + SplitText + Flip）  │
│  L0 滚动层  ← Lenis（平滑滚动 + GSAP ticker 联动）           │
└─────────────────────────────────────────────────────────────┘
        ↓ 令牌驱动                       ↑ 运行时
┌─────────────────────────────────────────────────────────────┐
│  Prism MCP 服务端（design_* 工具，TypeScript，零运行时侵入） │
│  Prism Dashboard（client/app.js，零构建原生 JS，按需加载）   │
│  Prism 画布（tldraw，不变）                                  │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 双通道部署原则

- **MCP 服务端**（`src/`）：只新增工具、扩展 `constants.ts`、扩展 `tokens.ts`、扩展导出器；不引入运行时依赖（GSAP/Lenis/Vanta 仅作为 CDN URL 或 npm 依赖字符串写入导出产物）。
- **Dashboard / 画布 / 预览**（`client/`）：通过 `<script>` CDN 按需加载，`app.js` 用动态 `import()` 或 `<script>` 注入；不进入 esbuild bundle（保持 `prism-canvas.js` 体积稳定）。
- **导出产物**：HTML 导出新增 `runtime` 选项（`minimal | standard | full`），分别对应"纯 CSS 动画 / +Lenis+GSAP / +Vanta+React Bits CDN"。

### 4.3 与现有 20 种预设的兼容

保留现有 13+7 预设名作为"CSS 兼容层"（导出 `runtime=minimal` 时仍可用），新增的 GSAP 预设名为 `gsap.*` 命名空间（如 `gsap.splitBlur`、`gsap.scrollReveal`、`gsap.flipGrid`），避免冲突且向后兼容。

---

## 5. 模块一：Lenis 集成（平滑滚动引擎）

### 5.1 新增 MCP 工具

| 工具 | 入参 | 行为 |
|---|---|---|
| `design_set_scroll` | `mode: "native"\|"smooth"\|"lenis-gsap"`, `options?: {lerp, duration, wheelMultiplier, syncTouch, anchors, allowNestedScroll, respectReducedMotion}` | 写入项目状态 `scroll.mode/options`，WS 广播 `scroll_changed` |
| `design_get_scroll` | — | 返回当前滚动配置 |
| `design_scroll_to` | `target: component_id\|"selector"\|{x,y}`, `offset?, duration?, easing?, onComplete?` | 仅在预览/导出运行时生效，记录到 `scroll.scrollToTargets` 供导出注入 |

### 5.2 服务端改动

- `src/state.ts`：`ProjectState` 新增 `scroll?: { mode: 'native'|'smooth'|'lenis-gsap'; options: LenisOptions; scrollToTargets: ScrollToTarget[] }`，纳入 `revision` 乐观并发。
- `src/tools/scroll-tools.ts`（新建）：三个工具的 zod schema + handler，注册到 `src/index.ts` 的工具数组。
- `src/tokens.ts`：新增 token 命名空间 `scroll.*`（`scroll.smooth.lerp`、`scroll.smooth.duration`、`scroll.smooth.wheelMultiplier`），纳入 `design_export_tokens` 的 css/dtcg/tailwind 输出（输出为 CSS 变量 `--scroll-lerp` 等，供导出页面读取）。
- `src/service/design-service.ts`：共享服务层新增 `setScroll/getScroll`，供 WS 与 REST 共用。

### 5.3 客户端改动（`client/app.js` + `client/index.html`）

- 顶栏新增"滚动"下拉（原生 / 平滑 / Lenis+GSAP），切换调用 `POST /api/scroll`。
- 预览模式（`mode=preview`）下，动态注入：
  ```html
  <link rel="stylesheet" href="https://unpkg.com/lenis@1.3.26/dist/lenis.css">
  <script src="https://unpkg.com/lenis@1.3.26/dist/lenis.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.15/dist/gsap.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.15/dist/ScrollTrigger.min.js"></script>
  ```
  初始化：
  ```js
  const lenis = new Lenis({ autoRaf:false, anchors:true, allowNestedScroll:true, ...project.scroll.options });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(t => lenis.raf(t*1000));
  gsap.ticker.lagSmoothing(0);
  ```
- 嵌套滚动容器（侧栏/检查器/画布属性面板）打 `data-lenis-prevent` 属性，避免被主平滑滚动拦截。
- `prefers-reduced-motion` 自动降级（Lenis 默认 honor）。

### 5.4 导出改动（`src/tools/design-tools.ts` design_export）

`runtime` 选项新增枚举值，HTML 导出按 `scroll.mode` 注入对应 CDN 与初始化脚本；React/Vue/Svelte 导出在依赖中追加 `lenis` + `@gsap/react`（仅 `mode=lenis-gsap` 时）。

### 5.5 测试

- `tests/scroll.test.ts`（新建）：状态变更、并发 revision、token 导出格式。
- e2e：`tests/e2e/dashboard.spec.ts` 新增"切换滚动模式 → 预览页 window.Lenis 存在 → 嵌套容器 data-lenis-prevent 存在"。

---

## 6. 模块二：GSAP 集成（专业动画引擎）

### 6.1 动画引擎抽象层

`src/animations/`（新建目录）：

```
src/animations/
├── index.ts            # 公共注册表 + 类型
├── css-presets.ts      # 迁移现有 13+7 CSS 预设（保留兼容）
├── gsap-presets.ts     # 新增 GSAP 预设（ScrollTrigger/SplitText/Flip/MorphSVG）
├── registry.ts         # preset → {engine, code, params, defaults}
└── serializer.ts       # 预设 → 导出代码（HTML inline / React hook / CSS class）
```

### 6.2 新增 GSAP 预设（共 27 个，命名空间 `gsap.*`）

**入场（12）**：
- `gsap.splitBlur`：SplitText 拆字 + 模糊入场（hero 标题首选）
- `gsap.splitLines`：SplitText 按行 stagger 上移
- `gsap.scrambleText`：乱码解码到目标文本
- `gsap.fadeUpStagger`：子元素 stagger 上移淡入（grid/card list）
- `gsap.flipGrid`：Flip 布局重排过渡（bento grid 切换）
- `gsap.morphIcon`：MorphSVG 图标形变（hover 时 logo→箭头）
- `gsap.scrollReveal`：ScrollTrigger 触发入场（进入视口 80%）
- `gsap.scrollPin`：ScrollTrigger pin（section 固定 + scrub 进度）
- `gsap.horizontalScroll`：ScrollTrigger horizontal（垂直滚动转水平移动）
- `gsap.parallaxBg`：ScrollTrigger 视差背景（背景速度 < 前景）
- `gsap.counter`：数字从 0 滚动到目标值（stats 区域）
- `gsap.drawSvg`：DrawSVG 描边路径动画（icon/illustration）

**悬停（8）**：
- `gsap.magnetic`：磁吸效果（按钮被指针吸引）
- `gsap.tilt3d`：3D 倾斜跟随指针
- `gsap.scrubImage`：悬停时图片缩放 + 位移
- `gsap.textScrambleHover`：悬停文字乱码解码
- `gsap.iconMorphHover`：悬停图标 MorphSVG 形变
- `gsap.glowPulse`：发光呼吸
- `gsap.flipCard`：Flip 卡片正反面切换
- `gsap.draggable`：Draggable 自由拖拽 + InertiaPlugin 惯性

**时间线（4）**：
- `gsap.timelineIntro`：Hero 入场时间线（eyebrow → title → sub → CTA，可配 delay/overlap）
- `gsap.scrollStory`：ScrollTrigger pin + timeline，整页叙事
- `gsap.batchReveal`：ScrollTrigger.batch 批量入场（性能优化）
- `gsap.matchMediaResponsive`：matchMedia 断点不同动画（桌面/移动差异化）

**循环（3）**：
- `gsap.floatingY`：浮动循环（Y 轴 ±10px）
- `gsap.shimmerBar`：高光扫过（loading skeleton）
- `gsap.marqueeInfinite`：无缝跑马灯

### 6.3 新增 MCP 工具

| 工具 | 入参 | 行为 |
|---|---|---|
| `design_list_animation_engines` | — | 返回 `[{name:"css", presets:[...]}, {name:"gsap", presets:[...], deps:["gsap","ScrollTrigger","SplitText"]}]` |
| `design_set_animation`（扩展） | 新增 `engine?: "css"\|"gsap"`、`params?: {duration, delay, stagger, ease, scrollTrigger?: {start, end, scrub, pin, toggleActions}}` | 引擎不存在则回退 css；写入 component.animations[engine] |
| `design_preview_animation` | `component_id, engine, preset, params` | 返回该组件该预设的预览代码片段（HTML+JS）供画布临时注入播放 |
| `design_set_scroll_trigger` | `component_id, trigger:{start, end, scrub, pin, markers, toggleActions}` | 单组件 ScrollTrigger 配置 |

### 6.4 客户端改动

- 检查器"动效"Tab 增加"引擎"下拉（CSS / GSAP），切换后预设列表过滤。
- 选中组件时，"播放预览"按钮调用 `design_preview_animation` → 临时 `<script>` 注入画布 iframe → 1.5s 后清除。
- 画布内组件 `data-anim-engine="gsap"` `data-anim-preset="gsap.splitBlur"` 属性，便于导出时序列化。

### 6.5 导出改动

HTML 导出按组件的 `engine` 决定 CDN 注入：
- 任一组件 `engine=gsap` → 注入 gsap.min.js + 按需 ScrollTrigger/SplitText/MorphSVG/Flip/Draggable。
- 按组件 `data-anim-*` 属性生成 `gsap.context(() => {...})` 代码块，useGSAP 风格 cleanup。
- React 导出：`import gsap from 'gsap'; import { ScrollTrigger } from 'gsap/ScrollTrigger'; import { useGSAP } from '@gsap/react';`，组件内 `useGSAP(() => { gsap.from(...) }, { scope: ref })`。

### 6.6 测试

- `tests/animations/registry.test.ts`：注册表完整性、参数 schema 校验。
- `tests/animations/serializer.test.ts`：HTML/React 导出代码片段快照。
- 现有 `design_set_animation` 测试扩展为支持 `engine` 参数。

---

## 7. 模块三：Vanta.js 集成（3D 动态背景）

### 7.1 新增"3D 背景"组件类型与 Section 背景属性

两条接入路径：

**路径 A：作为新组件类型 `vanta_background`**
- 在 `src/constants.ts` 的 `COMPONENT_TYPES` 新增 `vanta_background`，归类为"装饰"。
- 组件 `props`：`effect: VantaEffect`（14 选 1）、`params: VantaParams`、`mouseControls`、`touchControls`、`gyroControls`、`foregroundContent?: ComponentId[]`。
- 画布渲染：占位卡片预览（避免在画布里跑 WebGL 影响性能），双击进入"效果预览"模式才实例化。

**路径 B：作为 Section/Hero/CTA 的 `background.type="vanta"` 属性**
- 现有 Section 类组件（hero、cta、feature_grid、footer）的 `background` 字段从 `{type:"color"|"gradient", ...}` 扩展为 `{type:"color"|"gradient"|"vanta", vanta?: {effect, params}}`。
- 渲染时 Vanta canvas 作为该 Section 的 `<div class="bg">` 子元素，前景内容置于其上。

### 7.2 新增 MCP 工具

| 工具 | 入参 | 行为 |
|---|---|---|
| `design_list_vanta_effects` | — | 返回 14 种效果 + 各自参数 schema（color/waveHeight/shininess/waveSpeed/zoom/birdCount 等） |
| `design_set_vanta_background` | `target: {component_id} \| {section_id}`, `effect, params, mouseControls, touchControls` | 写入 background.vanta；WS 广播 |
| `design_preview_vanta` | `effect, params` | 返回单页 HTML（CDN + 初始化脚本）供画布 iframe 预览 |

### 7.3 令牌化

Vanta 参数纳入设计令牌：
- `background.vanta.color` → 与 `color.brand.primary` 联动（令牌变化时 Vanta 颜色同步）。
- `background.vanta.waveHeight` / `shininess` / `waveSpeed` → 作为风格预设的"动效强度"维度（minimal=低、bold=高、tech=中、organic=中）。
- 14 风格预设各配置一套 Vanta 默认参数（如 `tech` 默认 NET 黑底青色线、`luxury` 默认 WAVES 深金、`cyberpunk` 默认 GLOBE 紫红）。

### 7.4 客户端改动

- 设计库新增"3D 背景"分类，14 个效果卡片缩略图（GIF 预览，复用 vanta 官方 gallery 资源或本地录制）。
- 拖拽到画布 → 创建 `vanta_background` 组件占位；属性检查器显示效果选择 + 参数滑块（color picker / waveHeight 0-30 / shininess 0-100 / waveSpeed 0-3 / zoom 0.5-2）。
- 双击占位 → 画布弹出 iframe 全屏预览，实例化 `VANTA.WAVES({el: iframe.body, THREE, ...params})`。

### 7.5 导出改动

HTML 导出：组件/Section `background.type="vanta"` 时注入：
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/vanta/dist/vanta.waves.min.js"></script>
<div id="vanta-<id>" class="vanta-bg"></div>
<script>VANTA.WAVES({el:"#vanta-<id>", THREE, ...params, mouseControls:true})</script>
```
React 导出：`import VANTA from 'vanta/dist/vanta.waves.min'; import * as THREE from 'three';` + `useEffect` 实例化 + `componentWillUnmount` destroy。

### 7.6 性能与降级

- WebGL 不支持时（`window.WebGLRenderingContext` 缺失）→ 自动回退到 `background.type="gradient"` 同色渐变。
- `prefers-reduced-motion: reduce` → 不实例化 Vanta，仅显示静态首帧（截图占位）。
- 单页 Vanta 实例数 ≤ 2（性能护栏），超过则提示。

### 7.7 测试

- `tests/vanta.test.ts`：14 效果参数 schema、风格预设映射、降级逻辑。
- e2e：设计库拖拽 → 占位出现 → 属性面板参数可改 → 导出 HTML 含 vanta CDN。

---

## 8. 模块四：React Bits 集成（动画组件库扩展）

### 8.1 组件分类映射

React Bits 165+ 组件按 Prism 现有 41 类型做"动画增强版本"映射：

| React Bits 类别 | 映射到 Prism 组件类型 | 数量 |
|---|---|---|
| Text Animations | text、heading、hero.title、cta.title | ~40 |
| Animations | 通用（可附任意组件） | ~30 |
| Components | button、card、input、tooltip、alert、bento_grid、command_palette | ~60 |
| Backgrounds | section.background、hero.background、vanta_background | ~35 |

### 8.2 移植策略：源码拷贝而非依赖

React Bits 设计为"拷贝源码"模式（shadcn 风格），因此：
- 新建 `src/component-library/react-bits/` 目录，按 4 变体（JS-CSS / JS-TW / TS-CSS / TS-TW）拷贝组件源码。
- 每个组件附带 `meta.json`：`{name, category, prismType, propsSchema, deps, tags}`。
- `src/component-library/registry.ts` 自动扫描注册，生成 `design_list_react_bits` 工具的返回数据。

### 8.3 新增 MCP 工具

| 工具 | 入参 | 行为 |
|---|---|---|
| `design_list_react_bits` | `category?: "text"\|"animations"\|"components"\|"backgrounds"`, `variant?: "JS-CSS"\|"JS-TW"\|"TS-CSS"\|"TS-TW"` | 返回组件清单（name/category/prismType/propsSchema/preview） |
| `design_add_react_bits_component` | `component_name, variant, target_page?, position?, props?` | 在画布添加该组件，关联到 prismType，props 令牌驱动 |
| `design_get_react_bits_code` | `component_name, variant, props?` | 返回该组件源码（用于导出/拷贝） |

### 8.4 令牌驱动改造

React Bits 组件源码中的硬编码颜色/字号/速度，改造为读取 Prism 令牌：
- `color: "#fff"` → `color: var(--color-text-primary)`
- `fontSize: 32` → `fontSize: var(--font-size-display)`
- `duration: 1.5` → `duration: var(--motion-duration-lg)`
- 新增 token 命名空间 `motion.*`（`motion.duration.{sm,md,lg}`、`motion.stagger.{sm,md,lg}`、`motion.ease.{standard,emphasis,decelerate}`）。

### 8.5 客户端改动

- 设计库左侧新增"动画组件"二级 Tab（与"设计库/版本/评论"并列），下分 4 子分类（Text/Animations/Components/Backgrounds）。
- 拖拽到画布 → 创建 prismType 组件 + 标记 `source="react-bits"` + 记录 `reactBitsName/variant`。
- 属性检查器：除常规属性外，显示该组件专属 propsSchema（如 BlurText 的 `text/delay/blurAmount/iterations`）。

### 8.6 导出改动

- HTML 导出：组件源码内联 + 必要时追加 React + ReactDOM CDN（若页面含任一 React Bits 组件）。
- React 导出：直接拷贝组件源码到目标项目 `src/components/react-bits/`，`import` 路径化。
- Tailwind 变体：导出 `format=react-ts` 且项目 `tailwind=true` 时优先选 `TS-TW` 变体。

### 8.7 测试

- `tests/react-bits/registry.test.ts`：所有组件 meta 完整、propsSchema 合法。
- `tests/react-bits/token-binding.test.ts`：源码中无硬编码颜色/字号（lint 规则）。
- e2e：设计库切到"动画组件"→ 拖拽 BlurText 到画布 → 检查器显示 props → 导出 HTML 含 React CDN。

---

## 9. 横切关注点：令牌、风格预设、导出统一

### 9.1 新增令牌命名空间

| 命名空间 | 示例 | 用途 |
|---|---|---|
| `scroll.*` | `scroll.smooth.lerp=0.1` | Lenis 平滑参数 |
| `motion.*` | `motion.duration.lg=1.2s`、`motion.ease.emphasis="power3.out"` | GSAP 动效通用参数 |
| `background.vanta.*` | `background.vanta.color=0x005588` | Vanta 默认参数 |
| `reactbits.*` | `reactbits.blurtext.iterations=20` | React Bits 组件默认 props |

### 9.2 风格预设扩展（14 种 → 注入动效强度）

每条风格预设新增 `motionProfile` 字段：

```ts
// src/constants.ts STYLE_PRESETS 扩展
minimal:    { ..., motionProfile: { duration: '0.4s', ease: 'power2.out', stagger: 0.05, vantaIntensity: 'low' } }
bold:       { ..., motionProfile: { duration: '0.8s', ease: 'back.out(1.7)', stagger: 0.12, vantaIntensity: 'high' } }
tech:       { ..., motionProfile: { duration: '0.6s', ease: 'power3.inOut', stagger: 0.08, vantaIntensity: 'medium' } }
cyberpunk:  { ..., motionProfile: { duration: '0.5s', ease: 'steps(8)', stagger: 0.04, vantaIntensity: 'high' } }
// ... 其余 10 种
```

### 9.3 导出 runtime 选项统一

`design_export(format="html", runtime?)` 的 `runtime` 枚举：

| runtime | 包含 | 体积影响 | 适用 |
|---|---|---|---|
| `minimal` | 仅内联 CSS 动画（现有 13+7 预设） | 0 额外 KB | 纯静态、邮件、低带宽 |
| `standard` | + Lenis + GSAP + ScrollTrigger + SplitText | +60KB gz | 默认，大多数落地页 |
| `full` | + Vanta（three.js）+ React Bits（React） | +400KB+ | Hero 主页、演示 Demo |

默认 `standard`，UI 上提供三选一单选。

### 9.4 design_list_capabilities 自描述

`src/tools/capabilities.ts` 的 manifest 新增：
```json
{
  "animations": { "engines": ["css", "gsap"], "presets": { "css": 20, "gsap": 27 } },
  "scroll": { "modes": ["native", "smooth", "lenis-gsap"] },
  "backgrounds": { "types": ["color", "gradient", "vanta"], "vantaEffects": 14 },
  "componentSources": ["prism-native", "react-bits"],
  "reactBitsComponents": 165
}
```

---

## 10. 实施阶段与里程碑

### Phase U1 — Lenis + GSAP 引擎底座（1-2 周）

- 新建 `src/animations/` 抽象层 + 迁移现有 20 预设
- 实现 27 个 GSAP 预设（registry + serializer）
- `design_set_scroll` / `design_list_animation_engines` / `design_set_animation(engine)` / `design_preview_animation` / `design_set_scroll_trigger`
- 客户端检查器引擎下拉 + 预览播放
- 导出 `runtime=standard` 注入逻辑
- 测试：30+ 单测 + 2 e2e

### Phase U2 — Vanta.js 3D 背景（1 周）

- `vanta_background` 组件类型 + Section background.vanta 属性
- `design_list_vanta_effects` / `design_set_vanta_background` / `design_preview_vanta`
- 设计库 3D 背景分类 + 14 缩略图
- 风格预设 motionProfile + 14 Vanta 默认参数
- WebGL 降级 + reduced-motion 降级
- 测试：14 效果参数 schema + 降级单测 + 1 e2e

### Phase U3 — React Bits 移植（2-3 周）

- 拷贝 165+ 组件源码到 `src/component-library/react-bits/`，4 变体
- 自动注册 registry + propsSchema 提取
- `design_list_react_bits` / `design_add_react_bits_component` / `design_get_react_bits_code`
- 客户端设计库"动画组件"Tab + 拖拽 + props 检查器
- 令牌驱动改造（去硬编码）+ motion.* 令牌
- 导出：HTML 内联 / React 源码拷贝
- 测试：registry 完整性 + 硬编码 lint + 1 e2e

### Phase U4 — 风格预设 motionProfile + 导出 runtime 统一（3-5 天）

- 14 风格预设注入 motionProfile
- `design_export` runtime 三档
- `design_list_capabilities` manifest 更新
- 文档：README 工具清单更新到 ~75 工具

### Phase U5 — 打磨与性能（3-5 天）

- 性能护栏：单页 Vanta ≤ 2、GSAP context 自动 cleanup、Lenis raf 暂停于不可见 tab
- e2e：完整流程"创建 Hero → 设 BlurText 标题 → 设 WAVES 背景 → 切 Lenis+GSAP → 导出 full runtime HTML"
- 浏览器实测：Chrome/Edge/Safari 三浏览器跑导出页面

---

## 11. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| three.js 体积大（~600KB） | 导出 full 体积膨胀 | runtime 分档；Vanta 仅在显式选择时注入；WebGL 检测降级 |
| React Bits 源码硬编码值 | 令牌驱动失效 | U3 阶段 lint 规则强制 `var(--*)`；硬编码值改 props 默认值 |
| GSAP + Lenis 双 raf 循环冲突 | 滚动卡顿 | 统一接入 `gsap.ticker`（Lenis 不用 `autoRaf`，由 GSAP ticker 驱动） |
| tldraw 画布内实例化 Vanta | 画布卡顿 | 画布内仅显示占位卡片，双击才在 iframe 预览；不在主画布跑 WebGL |
| 现有 268 测试回归 | 升级破坏现有功能 | `engine` 参数默认 `css`；新增不删旧；`design_set_animation` 向后兼容 |
| CDN 不可达（离线环境） | 预览/导出失效 | Prism Dashboard 启动时检测网络；离线模式自动回退到 `runtime=minimal` + 本地缓存的 gsap/lenis 副本（`client/vendor/`） |
| React 19 与 React Bits 旧版本兼容 | 组件运行异常 | U3 阶段对每个组件跑 React 19 冒烟测试；不兼容的标记 `legacy` 并禁用 |
| Commons Clause 许可 | 商业限制 | React Bits 许可为 MIT + Commons Clause，禁止将组件本身作为产品转售；Prism 作为工具不触发 |

---

## 12. 测试策略

### 12.1 单元测试（目标新增 80+）

- `tests/animations/registry.test.ts`：47 预设（20 css + 27 gsap）注册完整 + 参数 schema
- `tests/animations/serializer.test.ts`：HTML/React/Vue/Svelte 导出代码快照
- `tests/scroll.test.ts`：Lenis 状态、token 输出、嵌套属性
- `tests/vanta.test.ts`：14 效果 + 14 风格映射 + 降级
- `tests/react-bits/registry.test.ts`：165+ 组件 meta + propsSchema
- `tests/react-bits/token-binding.test.ts`：硬编码 lint

### 12.2 集成测试

- `design_export` runtime 三档端到端：minimal 不含 CDN、standard 含 gsap+lenis、full 含 vanta+react
- WS `scroll_changed` / `animation_changed` / `vanta_changed` 广播
- 乐观并发：scroll / animation / vanta 各自 revision

### 12.3 e2e（Playwright，目标新增 5+）

1. Lenis 模式切换 → 预览页 `window.Lenis` 存在 + 嵌套 `data-lenis-prevent`
2. 设 GSAP 预设 → 导出 HTML 含 `gsap.context` + ScrollTrigger
3. 拖 Vanta NET 到画布 → 占位 + 属性面板 + 导出含 vanta CDN
4. 拖 React Bits BlurText → 检查器 props → 导出含 React CDN
5. 完整流程：Hero + BlurText + WAVES + Lenis+GSAP → 导出 full HTML → 三浏览器截图比对

### 12.4 性能基线

- 导出 standard runtime 页面 Lighthouse 性能分 ≥ 85（桌面）
- 导出 full runtime 页面 Lighthouse ≥ 70（桌面，Vanta 单实例）
- Prism Dashboard 在 Vanta 预览开启时 FPS ≥ 30

---

## 13. 验收标准

- ✅ MCP 工具数从 68 增至 ~78（新增 10 个：3 scroll + 4 animation + 3 vanta + 3 react-bits，部分为扩展）
- ✅ 动画预设从 20 增至 47（20 css + 27 gsap）
- ✅ 组件库从 41 类型扩到 200+（41 native + 165 react-bits）
- ✅ 背景从 2 类（color/gradient）扩到 3 类（+vanta，14 效果）
- ✅ 滚动从 1 模式（native）扩到 3 模式（+smooth / lenis-gsap）
- ✅ 导出 runtime 三档可选
- ✅ 268 项现有测试全绿，新增 80+ 单测 + 5+ e2e
- ✅ 三浏览器（Chrome/Edge/Safari）实测导出页面动画/滚动/背景正常运行

---

## 附录 A：仓库引用

- Lenis: https://github.com/darkroomengineering/lenis（v1.3.26，MIT）
- GSAP: https://github.com/greensock/GSAP（v3.15，免费含全部插件）
- Vanta.js: https://github.com/tengbao/vanta（依赖 three.js r134，MIT）
- React Bits: https://github.com/DavidHDev/react-bits（MIT + Commons Clause，165+ 组件）

## 附录 B：CDN 清单

```html
<!-- Lenis -->
<link rel="stylesheet" href="https://unpkg.com/lenis@1.3.26/dist/lenis.css">
<script src="https://unpkg.com/lenis@1.3.26/dist/lenis.min.js"></script>

<!-- GSAP core + ScrollTrigger + SplitText + MorphSVG + Flip + Draggable -->
<script src="https://cdn.jsdelivr.net/npm/gsap@3.15/dist/gsap.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.15/dist/ScrollTrigger.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.15/dist/SplitText.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.15/dist/MorphSVGPlugin.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.15/dist/Flip.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.15/dist/Draggable.min.js"></script>

<!-- Vanta + three.js -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/vanta/dist/vanta.waves.min.js"></script>
<!-- 其余 13 效果：vanta.birds.min.js / vanta.net.min.js / vanta.globe.min.js / ... -->

<!-- React Bits（仅 full runtime） -->
<script src="https://unpkg.com/react@19/umd/react.development.js"></script>
<script src="https://unpkg.com/react-dom@19/umd/react-dom.development.js"></script>
```

## 附录 C：与现有方案的差异

本方案与 [prism-improvement-plan.md](file:///d:/Prism/prism-improvement-plan.md) 互补：
- 既有的"方案 A（tldraw 画布）"已完成，本方案不动 tldraw 内核。
- 既有的 14 风格预设 / 20 动效 / 41 组件类型作为兼容基线，本方案在其上叠加引擎升级与组件扩展。
- 既有的 design_export 多框架导出保持，本方案新增 runtime 维度（minimal/standard/full）。
