# Prism 风格预设替换升级方案

> 基于 GitHub 调研：[VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md)（108K★，73 个真实品牌 DESIGN.md）、[bergside/awesome-design-skills](https://github.com/bergside/awesome-design-skills)（67 个通用风格 SKILL.md）、[VoltAgent/awesome-claude-design](https://github.com/VoltAgent/awesome-claude-design)（68 个设计系统）。
> 分析样本：`bergside/.../minimal/SKILL.md`、`bergside/.../bento/SKILL.md`、`VoltAgent/.../design-md/linear.app/DESIGN.md`。

---

## 一、现状诊断

### 1.1 当前 StylePreset 字段（`src/constants.ts`，共 12 字段）

| 字段 | 含义 | 粒度 |
|------|------|------|
| `base_hue` / `saturation` / `lightness` | HSL 主色 | 单值 |
| `shadow_style` | 阴影风格 | subtle/medium/sharp 三选一 |
| `radius_style` | 圆角风格 | none/sharp/subtle/rounded/pill 五选一 |
| `spacing_base` | 间距基准 | 单值 px |
| `bg_light` / `bg_dark` | 背景 | 双主题单值 |
| `text_light` / `text_dark` | 文字 | 双主题单值 |

### 1.2 与优秀项目的字段差距

调研三个样本后，按"至少 2 个样本包含、且 Prism 缺失"的标准，识别出 **15 个缺失字段维度**：

| 维度 | linear(DESIGN.md) | bergside(SKILL.md) | Prism 现状 |
|------|:-:|:-:|:-:|
| 字体系统（三族 + scale + lineHeight/letterSpacing） | 13 token ✅ | 三族✅ | 仅 FONT_PAIRINGS 旁路表，未进 StylePreset |
| 多语义色（success/warning/danger/info） | ✅ | ✅ | ❌ |
| 交互状态色（hover/focus/pressed） | ✅ token | 规则要求 | ❌ |
| 多级 surface 阶梯（surface-1/2/3/4） | ✅ 4 级 | 单 surface | ❌（仅 bg 二分） |
| 文本色层级（ink/muted/subtle/tertiary） | ✅ 4 级 | ✅ | ❌（仅 text 单值） |
| 边框 hairline（default/strong/tertiary） | ✅ 3 级 | — | ❌ |
| on-primary 前景对比色 | ✅ | — | ❌ |
| inverse 反色主题 | ✅ 完整 | — | ❌ |
| 圆角 token 阶梯（xs…full 8 级） | ✅ 8 级 | — | ❌（单值枚举） |
| elevation 阶梯（0…4 含 focus ring） | ✅ 5 级 | — | ❌（单值枚举） |
| spacing 完整阶梯（含 section 级） | ✅ 8 级 | ✅ | ❌（仅 base） |
| 组件级 token（button/card/input…） | ✅ 20+ | 规则 | ❌ |
| 响应式 breakpoint | ✅ 5 级 | 规则 | ❌（仅在 BREAKPOINT_PRESETS 全局表） |
| 触控目标最小值 | ✅ | — | ❌ |
| a11y / Do-Don't / Quality gates | 部分 | ✅ 完整 | ❌ |

### 1.3 当前 14 个风格的覆盖盲区

对照 `awesome-design-skills` 的 67 个风格，Prism 缺失约 **25 个高价值风格**，其中按热度/差异化优先级排序：

**高优先级缺失**：Bento、Material、Shadcn、Neobrutalism、Mono、Neon、Gradient、Vibrant、Doodle、Paper
**中优先级缺失**：Cosmic、Immersive、Perspective、Retro、Vintage、Sleek、Spacious、Storytelling、Geometric、Sketch
**特色补充**：Dithered、Riso、Skeumorphism、Terracotta、Matrix、Tetris

### 1.4 Prism 的差异化优势（应保留）

调研发现三个样本**均未定义动效 token 层**——而 Prism 已有 `STYLE_MOTION_PROFILES`（14 个风格的 entry/hover/duration/easing/stagger/engine）+ 完整动画引擎（CSS 27 + GSAP 27 预设）+ Vanta + React Bits。这是 Prism 相对两个 awesome 项目的核心优势，升级时应作为**差异化护城河**保留并强化。

---

## 二、升级目标

1. **字段层**：将 `StylePreset` 从 12 字段升级为"完整设计系统"——含字体系统、多级色板、状态色、surface/ink 阶梯、圆角/elevation 阶梯、组件 token、a11y。
2. **治理层**：为每个风格补充 Do/Don't、Quality Gates、Writing Tone（对齐 bergside SKILL.md 治理体系）。
3. **风格库**：新增约 16 个高价值风格，从 14 个扩展到 30 个，覆盖 awesome 生态主流品类。
4. **动效层**：保留并强化 `STYLE_MOTION_PROFILES` 作为差异化优势，token 化动效维度。
5. **集成层**：与现有动画引擎/Vanta/React Bits/FONT_PAIRINGS 无缝联动。

---

## 三、字段层升级（S1：扩展 StylePreset 接口）

### 3.1 新 StylePreset 数据结构

```typescript
export interface SemanticColor {
  primary: string;          // 主品牌色
  onPrimary: string;        // 主色上的前景色（对比保障）
  primaryHover: string;     // hover 态
  primaryFocus: string;     // focus 态（focus ring）
  primaryPressed: string;   // active/pressed 态
  secondary: string;        // 次品牌色
  accent: string;           // 强调色（CTA 高亮）
  success: string;          // 成功
  warning: string;          // 警告
  danger: string;           // 危险
  info: string;             // 信息
}

export interface SurfaceScale {
  canvas: string;       // 页面底色
  surface1: string;     // 卡片
  surface2: string;     // 浮层/弹层
  surface3: string;     // 对话框
  surface4: string;     // 最高层
}

export interface TextScale {
  ink: string;          // 主文字
  inkMuted: string;     // 次要文字
  inkSubtle: string;    // 辅助文字
  inkTertiary: string;  // 占位/禁用
}

export interface BorderScale {
  hairline: string;        // 默认边框
  hairlineStrong: string;  // 强调边框
  hairlineTertiary: string;// 分隔线
}

export interface FontSystem {
  display: FontDef;     // 标题字
  body: FontDef;        // 正文字
  mono: FontDef;        // 等宽字
  typeScale: TypeToken[];// display-xl/lg/md, headline, body-lg/body/sm, caption, button, eyebrow
}

export interface FontDef {
  name: string;
  family: string;       // 含 fallback 栈
  weights: number[];
  substitutes?: string[];// 开源替代建议（linear 风格）
}

export interface TypeToken {
  name: string;          // "display-lg" | "body" | "button" | ...
  fontSize: number;     // px
  fontWeight: number;
  lineHeight: number;
  letterSpacing: number;// px，display 负 tracking、eyebrow 正 tracking
}

export interface RadiusScale {
  xs: number; sm: number; md: number; lg: number;
  xl: number; xxl: number; pill: number; full: number;
}

export interface ElevationScale {
  e0: string;  // flat
  e1: string;  // subtle lift
  e2: string;  // surface-2 lift
  e3: string;  // surface-3 lift
  e4: string;  // focus ring（描边而非阴影）
}

export interface SpacingScale {
  xxs: number; xs: number; sm: number; md: number;
  lg: number; xl: number; xxl: number; section: number;
}

export interface BreakpointSet {
  mobile: number;       // 480
  mobileLg: number;    // 768
  tablet: number;       // 1024
  desktop: number;      // 1280
  desktopXL: number;   // 1440
}

export interface A11ySpec {
  wcagLevel: "AA" | "AAA";
  keyboardFirst: boolean;
  minTouchTarget: number; // px，默认 44
  focusRingSpec: string;  // 如 "2px primaryFocus @50%"
}

export interface StylePreset {
  // —— 元信息 ——
  name: string;
  slug: string;              // URL/CLI 友好的 key
  description: string;
  category: StyleCategory;   // 见 §3.2
  inspiration?: string;      // 参考（如 "Linear.app"）

  // —— 颜色系统（双主题） ——
  colors: {
    light: SemanticColor;
    dark: SemanticColor;
    surfaceLight: SurfaceScale;
    surfaceDark: SurfaceScale;
    textLight: TextScale;
    textDark: TextScale;
    borderLight: BorderScale;
    borderDark: BorderScale;
    inverse?: Partial<SemanticColor & SurfaceScale & TextScale>;
  };

  // —— 字体系统 ——
  font: FontSystem;

  // —— 间距 / 圆角 / 阴影 ——
  spacing: SpacingScale;
  radius: RadiusScale;
  elevation: ElevationScale;

  // —— 布局 ——
  breakpoints: BreakpointSet;
  maxContentWidth: number;   // px，默认 1280
  gridColumns: number;       // 默认 12

  // —— 无障碍 ——
  a11y: A11ySpec;

  // —— 治理（见 §四） ——
  doRules: string[];
  dontRules: string[];
  writingTone: string[];     // 如 ["concise","confident","helpful"]
  qualityGates: string[];

  // —— 向后兼容（旧字段保留为派生 getter，平滑迁移） ——
  /** @deprecated 用 colors.light.primary 反推 */
  base_hue: number;
  saturation: number;
  lightness: number;
  bg_light: string;
  bg_dark: string;
  text_light: string;
  text_dark: string;
}
```

### 3.2 风格分类（对齐 awesome-design-skills 的品类）

```typescript
export type StyleCategory =
  | "foundational"   // Minimal/Modern/Clean/Flat/Material
  | " expressive"    // Bold/Vibrant/Colorful/Gradient/Dramatic
  | "textured"       // Glassmorphism/Neumorphism/Claymorphism/Paper/Skeumorphism
  | "editorial"      // Editorial/Premium/Luxury/Storytelling/Spacious
  | "technical"      // Tech/Mono/Neon/Cyberpunk/Matrix/Shadcn
  | "retro"          // Brutalism/Neobrutalism/Vintage/Retro/Dithered/Riso
  | "playful"        // Playful/Doodle/Bento/Geometric
  | "immersive";     // Aurora/Cosmic/Immersive/Perspective
```

---

## 四、治理层升级（S2：每个风格补齐治理三件套）

对齐 bergside SKILL.md 的治理体系，每个风格补充：

### 4.1 Do / Don't 规则（成对，可执行）
```typescript
// 示例：minimal
doRules: [
  "保持大量留白，元素间距 ≥ spacing.md(16px)",
  "CTA 使用 primaryFocus 描边而非阴影表达焦点",
  "图标统一 1.5px 线宽，与字重 500 对齐",
],
dontRules: [
  "禁止使用 #000000 纯黑作为 canvas（用 surface1 的近黑）",
  "禁止 pill 圆角的 CTA（破坏锐利感）",
  "禁止超过 2 个强调色同时出现",
],
```

### 4.2 Quality Gates（可测试的验收标准）
```typescript
qualityGates: [
  "所有 text/surface 组合对比度 ≥ 4.5:1（WCAG AA）",
  "所有可交互元素 focus 可见且 ≥ 2px primaryFocus 描边",
  "触屏元素 ≥ 44×44px",
  "导出 HTML 在 480/768/1024/1280 四断点无横向滚动",
],
```

### 4.3 Writing Tone（内容语调约束）
```typescript
writingTone: ["concise", "confident", "helpful"],
```

---

## 五、风格库扩充（S3：新增 16 个高价值风格）

从 awesome-design-skills 的 67 个中精选 16 个，按差异化价值排序。每个附"参考品牌"（来自 awesome-design-md 真实站点）与"动效偏好"。

| # | slug | 名称 | category | 参考品牌/灵感 | 动效引擎 | Vanta 背景 |
|---|------|------|----------|--------------|----------|-----------|
| 1 | bento | Bento | playful | Apple 产品页 | css | — |
| 2 | material | Material | foundational | Google Material 3 | css | — |
| 3 | shadcn | Shadcn | technical | shadcn/ui | css | — |
| 4 | neobrutalism | Neobrutalism | retro | Gumroad 复古 | css | — |
| 5 | mono | Mono | technical | Vercel 文档 | css | — |
| 6 | neon | Neon | technical | ElevenLabs | gsap | dots |
| 7 | gradient | Gradient | expressive | Stripe | gsap | waves |
| 8 | vibrant | Vibrant | expressive | Figma | css | — |
| 9 | doodle | Doodle | playful | Excalidraw | css | — |
| 10 | paper | Paper | textured | Notion | css | — |
| 11 | cosmic | Cosmic | immersive | SpaceX | gsap | net |
| 12 | immersive | Immersive | immersive | Runway | gsap | birds |
| 13 | retro | Retro | retro | 复古印刷 | css | — |
| 14 | vintage | Vintage | retro | Dell(1996) | css | — |
| 15 | spacious | Spacious | editorial | Linear | css | — |
| 16 | storytelling | Storytelling | editorial | The Verge | gsap | — |

### 5.1 新增风格的 motion profile 模板
```typescript
bento:        { entry: "scaleIn",   hover: "lift",      duration: 0.4, easing: "power2.out",     stagger: 0.06, engine: "css",  scrollReveal: true  },
material:     { entry: "fadeUp",    hover: "ripple",    duration: 0.3, easing: "easeOut",        stagger: 0.05, engine: "css",  scrollReveal: true  },
shadcn:       { entry: "fadeIn",     hover: "lift",      duration: 0.2, easing: "easeOut",        stagger: 0.04, engine: "css",  scrollReveal: false },
neobrutalism: { entry: "scaleIn",   hover: "scaleUp",   duration: 0.15,easing: "steps(2)",       stagger: 0.02, engine: "css",  scrollReveal: false },
mono:         { entry: "fadeIn",     hover: "lift",      duration: 0.3, easing: "easeOut",        stagger: 0.05, engine: "css",  scrollReveal: true  },
neon:         { entry: "glow",      hover: "glow",      duration: 0.6, easing: "power2.out",     stagger: 0.04, engine: "gsap", scrollReveal: true  },
gradient:     { entry: "fadeUp",     hover: "scaleUp",   duration: 0.6, easing: "power2.out",     stagger: 0.07, engine: "gsap", scrollReveal: true  },
vibrant:      { entry: "spring",    hover: "scaleUp",   duration: 0.5, easing: "back.out(1.7)",  stagger: 0.08, engine: "css",  scrollReveal: true  },
doodle:       { entry: "fadeIn",    hover: "scaleUp",   duration: 0.5, easing: "easeOut",        stagger: 0.06, engine: "css",  scrollReveal: true  },
paper:        { entry: "fadeUp",    hover: "lift",      duration: 0.4, easing: "easeOut",        stagger: 0.05, engine: "css",  scrollReveal: true  },
cosmic:       { entry: "cinematic", hover: "glow",      duration: 1.0, easing: "power2.out",     stagger: 0.10, engine: "gsap", scrollReveal: true  },
immersive:    { entry: "cinematic", hover: "glow",      duration: 1.2, easing: "power3.out",     stagger: 0.12, engine: "gsap", scrollReveal: true  },
retro:        { entry: "fadeIn",    hover: "ripple",    duration: 0.2, easing: "steps(3)",       stagger: 0.03, engine: "css",  scrollReveal: false },
vintage:      { entry: "fadeUp",    hover: "lift",      duration: 0.3, easing: "steps(2)",       stagger: 0.04, engine: "css",  scrollReveal: false },
spacious:     { entry: "fadeUp",    hover: "lift",      duration: 0.7, easing: "power2.out",     stagger: 0.10, engine: "css",  scrollReveal: true  },
storytelling: { entry: "cinematic", hover: "lift",     duration: 0.9, easing: "power2.out",     stagger: 0.09, engine: "gsap", scrollReveal: true  },
```

### 5.2 与 Vanta 背景的默认映射
新增 `STYLE_TO_VANTA_DEFAULT` 条目：
```typescript
mono:         { effect: "dots",       params: { color: 0xffffff, backgroundColor: 0x000000, size: 1.5 } },
neon:         { effect: "dots",        params: { color: 0x00ffff, backgroundColor: 0x0a0a14, size: 2 } },
gradient:     { effect: "waves",       params: { color: 0x635bff, shininess: 40, waveHeight: 18 } },
cosmic:       { effect: "net",         params: { color: 0xffffff, backgroundColor: 0x000000, points: 10 } },
immersive:    { effect: "birds",       params: { backgroundColor: 0x0a0e14, quantity: 3 } },
storytelling: { effect: "fog",         params: { highlightColor: 0xffffff, midtoneColor: 0x886688, lowtoneColor: 0x333355 } },
```

---

## 六、动效层强化（S4：token 化动效，巩固差异化优势）

调研发现 awesome 生态普遍缺失动效层。将现有 `MotionProfile` 升级为完整动效 token：

```typescript
export interface MotionTokenSet {
  duration: { instant: number; fast: number; normal: number; slow: number; cinematic: number };
  //        { 0.1s,          0.2s,       0.4s,         0.7s,      1.2s         }
  easing: {
    standard: string;      // "cubic-bezier(0.4,0,0.2,1)"
    emphasized: string;    // "cubic-bezier(0.2,0,0,1)"
    exit: string;          // "cubic-bezier(0,0,0.2,1)"
    spring: string;        // gsap "back.out(1.7)"
    steps: string;         // brutalism "steps(2)"
  };
  stagger: { tight: number; normal: number; relaxed: number };
  //        { 0.03,            0.06,          0.10        }
  scrollTrigger?: { start: string; end: string; scrub: boolean };
}
```

每个风格的 `MotionProfile` 引用上述 token，而非硬编码数值，便于全局调参。

---

## 七、集成层升级（S5：与现有模块联动）

### 7.1 与 FONT_PAIRINGS 的整合
当前 `FONT_PAIRINGS` 是独立数组，升级后 `StylePreset.font` 成为字体系统的**权威来源**，`FONT_PAIRINGS` 退化为"备选字体组合"查询表（保留以兼容）。

### 7.2 与动画引擎的联动
`STYLE_MOTION_PROFILES` 的 `entry/hover` 字段必须指向已注册的动画预设（CSS 20 + GSAP 27）。新增 16 个风格的 entry/hover 名称需在 `css-presets.ts` / `gsap-presets.ts` 中存在，缺失则补充注册。

### 7.3 与 Vanta 的联动
新增风格的 `STYLE_TO_VANTA_DEFAULT` 必须使用 `VANTA_EFFECTS` 中已定义的 14 个 effect key。

### 7.4 与 React Bits 的联动
为每个风格新增 `recommendedReactBits` 字段，列出该风格适配的 React Bits 组件：
```typescript
minimal:    ["BlurText", "FadeContent", "SpotlightCard"],
cyberpunk:  ["GlitchText", "TerminalText", "AnimatedGrid"],
// ...
```

### 7.5 与导出运行时的联动
`buildRuntimeAssets()` 已根据 `motionProfile.engine` 决定是否注入 GSAP。升级后改用 `MotionTokenSet` 的引用，逻辑不变但数据来源统一。

---

## 八、实施步骤（S1–S6）

| 步骤 | 内容 | 影响文件 | 优先级 |
|------|------|---------|--------|
| **S1** | 扩展 `StylePreset` 接口 + 派生 getter（旧字段向后兼容） | `constants.ts` | 高 |
| **S2** | 为现有 14 个风格补齐 colors/font/spacing/radius/elevation/a11y/do-dont/qualityGates 全字段 | `constants.ts`（新增 `style-presets-v2.ts`） | 高 |
| **S3** | 新增 16 个风格（S3.1 数据 + S3.2 motion + S3.3 vanta 映射） | `constants.ts`、`style-presets-v2.ts` | 高 |
| **S4** | MotionProfile 升级为 MotionTokenSet，引用 token 而非硬编码 | `constants.ts` | 中 |
| **S5** | 集成层：字体系统进 StylePreset、React Bits 推荐映射 | `constants.ts`、`react-bits-registry.ts` | 中 |
| **S6** | 测试 + 文档：新增风格预设测试、更新 capabilities 清单 | `tests/`、`capabilities.ts` | 高 |

### 8.1 迁移策略（零破坏）
- 旧 `STYLE_PRESETS` 保留为 `STYLE_PRESETS_LEGACY`，新数据在 `STYLE_PRESETS_V2`。
- 提供 `getActiveStylePreset(slug)` 优先返回 V2，回退 LEGACY。
- `applyStyleTokenSet()` 内部改读 V2，对外接口不变。
- 现有 336 个测试在迁移期保持通过。

---

## 九、风格命名与 awesome 生态对齐

为保证 AI Agent 可直接引用 awesome-design-skills 的 slug（`npx typeui.sh pull <slug>`），Prism 新增风格的 `slug` 与 awesome 完全一致：`bento` / `material` / `shadcn` / `neobrutalism` / `mono` / `neon` / `gradient` / `vibrant` / `doodle` / `paper` / `cosmic` / `immersive` / `retro` / `vintage` / `spacious` / `storytelling`。

---

## 十、预期收益

1. **设计深度**：从 12 字段 → 50+ token，达到 linear.app DESIGN.md 的数据化水平。
2. **风格广度**：从 14 → 30 个风格，覆盖 awesome 生态主流品类。
3. **治理可执行**：Do/Don't + Quality Gates 让 AI 生成的 UI 有可测试的验收标准。
4. **差异化**：动效 token 层是 awesome 生态的空白，Prism 可作为唯一自带完整动效系统的设计 MCP。
5. **生态对齐**：slug 与 awesome-design-skills 一致，用户可直接 `pull` 兼容。

---

## 附录 A：调研样本来源

| 项目 | 样本 | 用途 |
|------|------|------|
| bergside/awesome-design-skills | `skills/minimal/SKILL.md` | 治理层模板（Do-Don't/Quality Gates/Constraint Language） |
| bergside/awesome-design-skills | `skills/bento/SKILL.md` | 同构模板 + bento 品牌叙事 |
| VoltAgent/awesome-design-md | `design-md/linear.app/DESIGN.md` | token 数据化标杆（25+色/13 type/8 radius/20+组件） |

## 附录 B：Prism 现有 14 风格的迁移映射

| 现有 slug | 新 category | 迁移动作 |
|-----------|------------|---------|
| minimal | foundational | 补全字段 + 治理三件套 |
| bold | expressive | 同上 |
| playful | playful | 同上 |
| dark | technical | 同上 |
| editorial | editorial | 同上 |
| tech | technical | 同上 |
| glassmorphism | textured | 同上 |
| neumorphism | textured | 同上 |
| claymorphism | textured | 同上 |
| aurora | immersive | 同上 |
| brutalism | retro | 同上 |
| cyberpunk | technical | 同上 |
| organic | editorial | 同上 |
| luxury | editorial | 同上 |
