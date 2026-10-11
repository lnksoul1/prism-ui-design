import { EventEmitter } from "events";
import { getContrastRatio } from "./utils/color.js";
import { isBreakpoint as isBreakpointSafe } from "./responsive.js";
import { runBatch } from "./commands/batch.js";
import { snapToGrid } from "./layout/snap.js";
import { smartLayout } from "./layout/smart.js";
import { isFlowActionType, type ActionFlow } from "./action-flow.js";

// ===== Design State Types =====

export interface DesignToken {
  value: string;
  source: "ai" | "user" | "preset";
  description?: string;
}

export interface DesignTokens {
  colors: Record<string, DesignToken>;
  typography: Record<string, DesignToken>;
  spacing: Record<string, DesignToken>;
  shadows: Record<string, DesignToken>;
  radii: Record<string, DesignToken>;
  transitions: Record<string, DesignToken>;
}

export interface ComponentNode {
  id: string;
  type: string;
  variant?: string;
  /** 精确编辑 P0: user-visible layer name (defaults to type/variant). */
  name?: string;
  props: Record<string, unknown>;
  layout?: ComponentLayout;
  visible?: boolean;
  locked?: boolean;
  children: ComponentNode[];
  animation?: AnimationDef;
  /** Product definition v2 — 行为模型: any component can carry an interaction. */
  behavior?: ComponentBehavior;
  /** V2.0 多断点编辑: 桌面基线样式（键为 camelCase CSS 属性名）。 */
  baseStyle?: Record<string, string>;
  /** V2.0 多断点编辑: 非 desktop 断点仅存与基线的差异值。 */
  breakpointOverrides?: Partial<Record<import("./responsive.js").Breakpoint, Record<string, string>>>;
  /** V2.0 动效时间线: 多轨道动效块（旧 animation 字段继续兼容，见 resolveAnimations）。 */
  animations?: TimelineAnimation[];
  /** M2 盒子模式: 复杂组件编辑态隔离（编辑器只控制外层容器）。 */
  boxMode?: import("./box-mode.js").BoxMode;
  /**
   * 元素级编辑 (P1): per-inner-element metadata keyed by the element's prop
   * path (e.g. "title", "button_text", "items.0.title"). Lets inner rendered
   * text/buttons of library components carry their own interaction behavior
   * and a promoted type (text → button / link) without being separate nodes.
   */
  elementMeta?: Record<string, ElementMeta>;
    /**
     * 内部元素组件化 (DESIGN.md v1.1 §5.2): 子组件来源路径（父组件内元素路径），
     * 由 `promoteElementToComponent` 写入，导出时优先渲染该子组件。
     */
    promotedElementPath?: string;
    /** 源组件内已组件化的元素路径 → 子组件 id 映射。 */
    promotedElements?: Record<string, string>;
}

/**
 * 元素级元数据 (P1): bound to an inner element of a rendered component via
 * its prop path, not to a separate child node.
 */
export interface ElementMeta {
  /** Interaction triggered in play mode when that exact element is clicked. */
  behavior?: ComponentBehavior;
  /** Type promotion: render the element as a button / link / plain text. */
  kind?: "text" | "button" | "link";
  /** 元素级 CSS 覆盖 (DESIGN.md v1.1 §5.2): width / fontSize / color 等。 */
  css?: Record<string, string>;
}

/** Safe CSS property whitelist for element-level overrides. */
const ELEMENT_CSS_PROPS = new Set([
  "width", "maxWidth", "height", "fontSize", "fontWeight", "color", "background",
  "borderRadius", "border", "margin", "padding", "textAlign", "lineHeight",
  "letterSpacing", "opacity", "textDecoration", "flex",
]);

export const ELEMENT_KINDS = ["text", "button", "link"] as const;
export type ElementKind = (typeof ELEMENT_KINDS)[number];

export function isElementKind(value: string): value is ElementKind {
  return (ELEMENT_KINDS as readonly string[]).includes(value);
}

/**
 * 行为模型 (P1): an interaction bound to any component/shape/image.
 * Triggered in play mode by clicking the element.
 */
export interface ComponentBehavior {
  type: "navigate" | "link" | "toggle" | "toast" | "submit" | "prompt";
  /** navigate: jump to a page */
  page_id?: string;
  /** link: open a URL (new tab by default) */
  url?: string;
  new_tab?: boolean;
  /** toggle: show/hide a target component */
  target_component_id?: string;
  /** toast: show a transient message */
  message?: string;
  /** submit: simulate a form submit */
  form_id?: string;
  /** prompt: trigger a natural-language instruction (built-in AI channel) */
  prompt?: string;
}

export const BEHAVIOR_TYPES = [
  "navigate",
  "link",
  "toggle",
  "toast",
  "submit",
  "prompt",
] as const;

export function isBehaviorType(value: string): value is ComponentBehavior["type"] {
  return (BEHAVIOR_TYPES as readonly string[]).includes(value);
}

/** Alignment / distribution modes for freeform multi-select (精确编辑 P0). */
export type AlignMode =
  | "left"
  | "center_x"
  | "right"
  | "top"
  | "center_y"
  | "bottom"
  | "distribute_x"
  | "distribute_y";

export const ALIGN_MODES: AlignMode[] = [
  "left",
  "center_x",
  "right",
  "top",
  "center_y",
  "bottom",
  "distribute_x",
  "distribute_y",
];

export function isAlignMode(value: string): value is AlignMode {
  return (ALIGN_MODES as string[]).includes(value);
}

/** Stacking order operations (精确编辑 P0). */
export type ZOrderMode = "front" | "back" | "forward" | "backward";

export const Z_ORDER_MODES: ZOrderMode[] = ["front", "back", "forward", "backward"];

export function isZOrderMode(value: string): value is ZOrderMode {
  return (Z_ORDER_MODES as string[]).includes(value);
}

/**
 * 导入记录 (product definition v3.1): provenance for the
 * "导入自己的产品 → 调整 → 一键应用" pipeline. Keyed by page id; the original
 * HTML is persisted next to the project store so apply/rollback can rebuild
 * artifacts without bloating the autosave.
 */
export interface ImportRecord {
  kind: "url" | "html" | "file" | "client" | "capture";
  /** Display name: hostname / "Pasted HTML" / file name. */
  source: string;
  url?: string;
  /** Saved original HTML under the project dir (imports/<pageId>.html). */
  html_file: string;
  imported_at: string;
  component_count: number;
  /**
   * Original absolute URL for url imports. Used by the client source view to
   * inject <base href="..."> so relative assets resolve like the live page.
   */
  base_url?: string;
  /**
   * Original file path for file imports. When set and the file is plain HTML,
   * one-click apply writes the adjusted document back to this file in place.
   */
  source_file?: string;
  /** True when source_file is plain HTML and can receive in-place writeback. */
  source_is_html?: boolean;
}

export interface AnimationDef {
  entry?: string;
  exit?: string;
  hover?: string;
  duration?: number;
  delay?: number;
  curve?: string;
  stagger?: number;
  /** Upgrade plan U1: animation engine ("css" default | "gsap"). */
  engine?: "css" | "gsap";
  /** Engine-specific parameters (gsap preset params). */
  params?: Record<string, number | string | boolean>;
  /** ScrollTrigger config for GSAP scroll-driven presets. */
  scrollTrigger?: {
    start?: string;
    end?: string;
    scrub?: boolean | number;
    pin?: boolean;
    markers?: boolean;
    toggleActions?: string;
  };
}

/** V2.0 动效时间线数据模型（M1 仅数据层，时间轴 UI 在 M4）。 */
export interface TimelineAnimation {
  id: string;
  trackId: string;
  startTime: number;
  duration: number;
  preset: string;
  engine?: "css" | "gsap";
  params?: Record<string, number | string | boolean>;
}

/** 归一化：旧的单 animation 字段映射为 track "main" 上的一个动效块。 */
export function resolveAnimations(node: ComponentNode): TimelineAnimation[] {
  const out: TimelineAnimation[] = [...(node.animations || [])];
  if (node.animation) {
    out.push({
      id: `${node.id}-legacy`,
      trackId: "main",
      startTime: node.animation.delay || 0,
      duration: node.animation.duration || 600,
      preset: node.animation.entry || node.animation.hover || node.animation.exit || "fadeIn",
      engine: node.animation.engine || "css",
    });
  }
  return out;
}

export interface ComponentLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ActivityLogEntry {
  timestamp: string;
  action: string;
  tool: string;
  detail: string;
  source: "ai" | "user";
}

export interface PageDef {
  id: string;
  name: string;
  components: ComponentNode[];
  /** R1 M2 修正记忆: 页面级布局约束（AI 重新生成时同类组件锁定这些矩形）。 */
  constraints?: PageConstraint[];
}

/**
 * R1 M2 修正记忆: 页面级布局约束。用户把某组件「记为约束」后，AI 下次生成
 * 该页时，按 component_type 匹配新生成的同类组件（首个未消费匹配），锁定其
 * 矩形——人工调整的精准布局在 AI 重生成后得以保留。
 */
export interface PageConstraint {
  id: string;
  /** 约束绑定的组件类型（生成匹配的依据，不依赖组件 id）。 */
  component_type: string;
  /** 锁定的布局矩形。 */
  layout: ComponentLayout;
  /** 创建约束时参考的组件 id（仅溯源，匹配不用它）。 */
  source_component_id?: string;
}

export interface DesignState {
  [key: string]: unknown;
  projectName: string;
  style: string;
  tokens: DesignTokens;
  components: ComponentNode[];
  activityLog: ActivityLogEntry[];
  pages: PageDef[];
  currentPageId: string | null;
  themeMode: "light" | "dark";
  activePlatform: string;
  platforms: Record<string, PlatformSnapshot>;
  comments: DesignComment[];
  actionFlows: Record<string, ActionFlow>;
  pageLinks: PageLink[];
  revision: number;
  /** 导入记录: pageId → provenance of the "导入 → 调整 → 一键应用" pipeline. */
  imports: Record<string, ImportRecord>;
  /** Upgrade plan U1: smooth scroll configuration (Lenis). */
  scroll?: ScrollConfig;
  /** Upgrade plan U2: Vanta 3D backgrounds keyed by component/section id. */
  vantaBackgrounds?: Record<string, VantaBackgroundConfig>;
  /** Upgrade plan U3: React Bits component registry (component_id → meta). */
  reactBits?: Record<string, { name: string; variant: string; props?: Record<string, unknown> }>;
  /** Upgrade plan U4: export runtime level (minimal | standard | full). */
  exportRuntime?: "minimal" | "standard" | "full";
  /** 背景编辑 (P1): 页面级背景（颜色/渐变/图片/图案/动画预设）。 */
  pageBackground?: PageBackground;
}

/**
 * 背景编辑 (P1): 页面级背景定义。`value` 是可直接用于 CSS `background` 的
 * 值（如 "#f3f4f6"、"linear-gradient(...)"、"url(...) center/cover"）。
 * `animation` 可携带额外的动画预设（如 aurora 流光 / grid 网格漂移）。
 */
export interface PageBackground {
  /** 类型: color | gradient | image | pattern | animation */
  type: "color" | "gradient" | "image" | "pattern" | "animation";
  /** CSS background 值 */
  value: string;
  /** 动画预设名（type === "animation" 时使用；否则用于导出时附加动效） */
  animation?: string;
  /** 附加参数（渐变角度、图片覆盖方式等），导出/预览时可选读取 */
  params?: Record<string, string | number>;
}

/** Lenis smooth scroll configuration (upgrade plan U1). */
export interface ScrollConfig {
  mode: "native" | "smooth" | "lenis-gsap";
  options: {
    lerp?: number;
    duration?: number;
    wheelMultiplier?: number;
    syncTouch?: boolean;
    anchors?: boolean;
    allowNestedScroll?: boolean;
    respectReducedMotion?: boolean;
  };
  /** ScrollTo targets recorded for export runtime injection. */
  scrollToTargets?: ScrollToTarget[];
}

export interface ScrollToTarget {
  id: string;
  target: string; // component_id or CSS selector
  offset?: number;
  duration?: number;
  label?: string;
}

/** Vanta 3D background configuration (upgrade plan U2). */
export interface VantaBackgroundConfig {
  effect: string; // one of VANTA_EFFECTS
  params: Record<string, number | string | boolean>;
  mouseControls?: boolean;
  touchControls?: boolean;
  gyroControls?: boolean;
}

export interface PlatformSnapshot {
  platform: string;
  savedAt: string;
  pages: PageDef[];
  currentPageId: string | null;
}

export interface DesignComment {
  id: string;
  component_id: string;
  author: string;
  text: string;
  createdAt: string;
  /** M3 打点评论: pin 相对组件左上角的偏移（px）。 */
  x?: number;
  y?: number;
  /** M3 打点评论: 已解决。 */
  resolved?: boolean;
  /** M3 打点评论: 指派处理人。 */
  assignee?: string;
  updatedAt?: string;
}

/** Play-mode navigation: clicking a component on one page jumps to another. */
export interface PageLink {
  id: string;
  from_page_id: string;
  to_page_id: string;
  label?: string;
  /** Optional component whose click triggers the navigation. */
  source_component_id?: string;
  /** M4 转场: enter animation of the target page in play mode (default "fade"). */
  transition?: PageLinkTransition;
}

/** M4 页面转场类型: play mode 进入目标页时的动画。 */
export const PAGE_LINK_TRANSITIONS = [
  "fade",
  "slide-left",
  "slide-right",
  "slide-up",
  "slide-down",
  "expand",
  "none",
] as const;
export type PageLinkTransition = (typeof PAGE_LINK_TRANSITIONS)[number];

export function isPageLinkTransition(value: string): value is PageLinkTransition {
  return (PAGE_LINK_TRANSITIONS as readonly string[]).includes(value);
}

// ===== State Store (Singleton) =====

/**
 * Internal stored state — the source of truth. Unlike the public `DesignState`
 * snapshot, it does NOT carry a `components` mirror field: components are always
 * derived from `pages[currentPageId].components` on read (see `getState()`).
 * This eliminates the historical `fixComponentsReference` sync compensation.
 *
 * Declared explicitly (rather than `Omit<DesignState, "components">`) because
 * `DesignState` carries a string index signature that absorbs literal keys
 * through `Omit`, degrading every field to `unknown`.
 */
type StoredState = {
  projectName: string;
  style: string;
  tokens: DesignTokens;
  activityLog: ActivityLogEntry[];
  pages: PageDef[];
  currentPageId: string | null;
  themeMode: "light" | "dark";
  activePlatform: string;
  platforms: Record<string, PlatformSnapshot>;
  comments: DesignComment[];
  actionFlows: Record<string, ActionFlow>;
  pageLinks: PageLink[];
  revision: number;
  /** 导入记录: pageId → provenance of the "导入 → 调整 → 一键应用" pipeline. */
  imports: Record<string, ImportRecord>;
  /** Upgrade plan U1: smooth scroll configuration (Lenis). */
  scroll?: ScrollConfig;
  /** Upgrade plan U2: Vanta 3D backgrounds keyed by component/section id. */
  vantaBackgrounds?: Record<string, VantaBackgroundConfig>;
  /** Upgrade plan U3: React Bits component registry (component_id → meta). */
  reactBits?: Record<string, { name: string; variant: string; props?: Record<string, unknown> }>;
  /** Upgrade plan U4: export runtime level (minimal | standard | full). */
  exportRuntime?: "minimal" | "standard" | "full";
  /** 背景编辑 (P1): 页面级背景（颜色/渐变/图片/图案/动画预设）。 */
  pageBackground?: PageBackground;
};

export class DesignStateStore extends EventEmitter {
  private state: StoredState;
  private static instance: DesignStateStore;

  // Undo/Redo history (post-mutation snapshots)
  private history: StoredState[];
  private historyIndex: number;
  private maxHistory: number = 50;

  /** 批量操作深度：>0 时 commit 只暂存 change，endBatch 时统一入栈一次。 */
  private batchDepth = 0;
  private batchChange: unknown = null;
  private batchSnapshot: StoredState | null = null;

  /** M3 协同: 远端变更投影时置位——此时 commit 走 commitCollab（不入 undo 历史）。 */
  private suppressHistory = false;

  // Pending user prompt (from client dashboard)
  private pendingPrompt: string | null;

  /**
   * Create a fresh design state store.
   *
   * Phase 2.3 (项目分桶): the store is no longer forced into a singleton —
   * each project window can hold its own isolated state + undo history via
   * `getProjectStore(projectId)`. The classic singleton is preserved as the
   * default store (`stateStore`) so all existing call sites keep working.
   */
  constructor() {
    super();
    const defaultPage: PageDef = {
      id: `page_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: "Home",
      components: [],
    };
    this.state = {
      projectName: "Untitled Project",
      style: "minimal",
      tokens: {
        colors: {},
        typography: {},
        spacing: {},
        shadows: {},
        radii: {},
        transitions: {},
      },
      activityLog: [],
      pages: [defaultPage],
      currentPageId: defaultPage.id,
      themeMode: "light",
      activePlatform: "web-desktop",
      platforms: {},
      comments: [],
      actionFlows: {},
      pageLinks: [],
      revision: 0,
      imports: {},
    };
    // Initialize history with the initial state
    this.history = [JSON.parse(JSON.stringify(this.state))];
    this.historyIndex = 0;
    this.pendingPrompt = null;
  }

  static getInstance(): DesignStateStore {
    if (!DesignStateStore.instance) {
      DesignStateStore.instance = new DesignStateStore();
    }
    return DesignStateStore.instance;
  }

  // ===== Undo / Redo =====

  /**
   * M2 Command 层: 开启批量操作。批量内的所有 mutation 共享一次 commit
   * （一个 undo 步）。失败时用 abortBatch 回滚到开启前快照。
   */
  beginBatch(): void {
    if (this.batchDepth === 0) {
      this.batchSnapshot = JSON.parse(JSON.stringify(this.state));
    }
    this.batchDepth++;
  }

  endBatch(change?: unknown): void {
    this.batchDepth = Math.max(0, this.batchDepth - 1);
    if (this.batchDepth === 0) {
      const final = this.batchChange ?? change ?? { type: "batch" };
      this.batchChange = null;
      this.batchSnapshot = null;
      this.commit(final);
    }
  }

  abortBatch(): void {
    if (this.batchSnapshot) {
      this.state = JSON.parse(JSON.stringify(this.batchSnapshot));
    }
    this.batchDepth = 0;
    this.batchChange = null;
    this.batchSnapshot = null;
  }

  /**
   * M3 协同: 远端（Y.Doc）变更的提交通道。与 commit 的区别：不 push 快照历史
   * （本地快照 undo 只回滚服务端写路径的操作，协同撤销由客户端 Y.UndoManager
   * 负责——双轨语义见 M3 计划），revision 照常递增以驱动乐观并发检测。
   */
  private commitCollab(change: unknown): void {
    if (this.batchDepth > 0) {
      this.batchChange = change;
      return;
    }
    this.state.revision = (this.state.revision || 0) + 1;
    this.emit("change", change);
  }

  /**
   * Save post-mutation state to history and emit change event.
   * Called at the end of every mutating method.
   */
  private commit(change: unknown): void {
    // M2: 批量进行中只暂存 change，由 endBatch 统一入栈
    if (this.batchDepth > 0) {
      this.batchChange = change;
      return;
    }
    // Monotonic revision for optimistic-concurrency conflict detection (C5).
    this.state.revision = (this.state.revision || 0) + 1;
    // Truncate any redo history
    this.history = this.history.slice(0, this.historyIndex + 1);
    // Push deep copy of current (post-mutation) state
    this.history.push(JSON.parse(JSON.stringify(this.state)));
    this.historyIndex = this.history.length - 1;
    // Trim history
    if (this.history.length > this.maxHistory) {
      this.history.shift();
      this.historyIndex--;
    }
    // Emit the change event
    this.emit("change", change);
  }

  undo(): boolean {
    if (!this.canUndo()) return false;
    this.historyIndex--;
    const snapshot = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
    this.state = snapshot;
    this.logActivity("undo", "system", "Undo", "user");
    this.emit("change", { type: "undo" });
    return true;
  }

  redo(): boolean {
    if (!this.canRedo()) return false;
    this.historyIndex++;
    const snapshot = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
    this.state = snapshot;
    this.logActivity("redo", "system", "Redo", "user");
    this.emit("change", { type: "redo" });
    return true;
  }

  canUndo(): boolean {
    return this.historyIndex > 0;
  }

  canRedo(): boolean {
    return this.historyIndex < this.history.length - 1;
  }

  // ===== State Access =====

  getState(): DesignState {
    const copy = JSON.parse(JSON.stringify(this.state)) as DesignState;
    // Derive `components` from the current page (source of truth). The stored
    // state intentionally has no components mirror field, so callers reading
    // `state.components` always see the current page's tree.
    copy.components = JSON.parse(JSON.stringify(this.currentComponents()));
    // Expose undo/redo capability so the client dashboard can enable/disable
    // the undo/redo buttons (see improvement plan A4 / defect C1).
    copy.canUndo = this.canUndo();
    copy.canRedo = this.canRedo();
    return copy;
  }

  // ===== Current Page Access (replaces former state.components mirror) =====

  /** The current page object (source of truth for the component tree). */
  private currentPage(): PageDef | null {
    const page = this.state.pages.find((p) => p.id === this.state.currentPageId);
    return page ?? this.state.pages[0] ?? null;
  }

  /** The current page's component tree (mutable reference). */
  private currentComponents(): ComponentNode[] {
    return this.currentPage()?.components ?? [];
  }

  // ===== Project / Style =====

  setProjectName(name: string, source: "ai" | "user" = "ai"): void {
    this.state.projectName = name;
    this.logActivity("set_project_name", "project", `Project renamed to "${name}"`, source);
    this.commit({ type: "projectName", value: name });
  }

  setStyle(style: string, source: "ai" | "user" = "ai"): void {
    this.state.style = style;
    this.logActivity("set_style", "style", `Style set to "${style}"`, source);
    this.commit({ type: "style", value: style });
  }

  setThemeMode(mode: "light" | "dark", source: "ai" | "user" = "ai"): void {
    this.state.themeMode = mode;
    this.logActivity("set_theme", "theme", `Theme set to ${mode}`, source);
    this.commit({ type: "setTheme", mode });
  }

  setPlatform(platform: string, source: "ai" | "user" = "user"): void {
    this.state.activePlatform = platform;
    this.logActivity("set_platform", "platform", `Preview platform set to ${platform}`, source);
    this.commit({ type: "setPlatform", platform });
  }

  // ===== Tokens =====

  setToken(
    category: keyof DesignTokens,
    key: string,
    value: string,
    source: "ai" | "user" | "preset" = "ai",
    description?: string
  ): void {
    this.state.tokens[category][key] = { value, source, description };
    this.logActivity(
      "set_token",
      `${category}.${key}`,
      `${category}.${key} = ${value}`,
      source === "preset" ? "user" : source
    );

    // Check for token conflicts
    const conflict = this.checkTokenConflict(category as string, key, value);
    if (conflict.hasConflict) {
      this.logActivity(
        "token_conflict",
        `${category}.${key}`,
        conflict.message,
        source === "preset" ? "user" : source
      );
    }

    this.commit({ type: "token", category, key, value });
  }

  setTokenBatch(
    category: keyof DesignTokens,
    tokens: Record<string, string>,
    source: "ai" | "user" | "preset" = "ai"
  ): void {
    Object.entries(tokens).forEach(([key, value]) => {
      this.state.tokens[category][key] = { value, source };
    });
    this.logActivity(
      "set_token_batch",
      category,
      `Updated ${Object.keys(tokens).length} ${category} tokens`,
      source === "preset" ? "user" : source
    );
    this.commit({ type: "tokenBatch", category, tokens });
  }

    /**
     * Apply a design-library style's token overrides in a single commit so the
     * whole style change is one undo step (DESIGN.md v1.1 §6.2).
     */
    applyTokenOverrides(
      category: keyof DesignTokens,
      tokens: Record<string, string>,
      source: "ai" | "user" = "user"
    ): void {
      Object.entries(tokens).forEach(([key, value]) => {
        this.state.tokens[category][key] = { value, source };
      });
      this.logActivity(
        "apply_design_style_tokens",
        category,
        `Applied ${Object.keys(tokens).length} ${category} tokens from design library`,
        source
      );
      this.commit({ type: "tokenBatch", category, tokens });
    }


  clearTokenCategory(category: keyof DesignTokens, source: "ai" | "user" | "preset" = "user"): void {
    this.state.tokens[category] = {};
    this.logActivity(
      "clear_token_category",
      category,
      `Cleared ${category} tokens`,
      source === "preset" ? "user" : source
    );
    this.commit({ type: "clearTokenCategory", category });
  }

  deleteToken(category: keyof DesignTokens, key: string, source: "ai" | "user" | "preset" = "user"): boolean {
    if (!this.state.tokens[category] || !(key in this.state.tokens[category])) return false;
    delete this.state.tokens[category][key];
    this.logActivity(
      "delete_token",
      `${category}.${key}`,
      `Deleted ${category}.${key}`,
      source === "preset" ? "user" : source
    );
    this.commit({ type: "deleteToken", category, key });
    return true;
  }

  getTokenConflicts(): Array<{ key: string; message: string }> {
    const conflicts: Array<{ key: string; message: string }> = [];
    const textColor = this.state.tokens.colors["color-text"];
    const bgColor = this.state.tokens.colors["color-bg"];

    if (textColor && bgColor) {
      try {
        const ratio = getContrastRatio(textColor.value, bgColor.value);
        if (ratio < 4.5) {
          conflicts.push({
            key: "color-text",
            message: `文字色与背景色对比度为 ${ratio.toFixed(2)}，低于 WCAG AA 标准 (4.5)`,
          });
        }
      } catch {
        // Ignore invalid colors
      }
    }

    // Also check primary button contrast
    const primaryColor = this.state.tokens.colors["color-primary"];
    const textOnPrimary = this.state.tokens.colors["color-text"] || this.state.tokens.colors["color-bg"];
    if (primaryColor && textOnPrimary) {
      try {
        const ratio = getContrastRatio(textOnPrimary.value, primaryColor.value);
        if (ratio < 4.5) {
          conflicts.push({
            key: "color-primary",
            message: `主色与文字色对比度为 ${ratio.toFixed(2)}，建议调整`,
          });
        }
      } catch {
        // Ignore invalid colors
      }
    }

    return conflicts;
  }

  private checkTokenConflict(category: string, key: string, value: string): { hasConflict: boolean; message: string } {
    if (category !== "colors") return { hasConflict: false, message: "" };

    const textColor = this.state.tokens.colors["color-text"];
    const bgColor = this.state.tokens.colors["color-bg"];

    try {
      if (key === "color-text" && bgColor) {
        const ratio = getContrastRatio(value, bgColor.value);
        if (ratio < 4.5) {
          return { hasConflict: true, message: `color-text 与 color-bg 对比度为 ${ratio.toFixed(2)}，低于 WCAG AA 标准 (4.5)` };
        }
      }
      if (key === "color-bg" && textColor) {
        const ratio = getContrastRatio(textColor.value, value);
        if (ratio < 4.5) {
          return { hasConflict: true, message: `color-text 与 color-bg 对比度为 ${ratio.toFixed(2)}，低于 WCAG AA 标准 (4.5)` };
        }
      }
    } catch {
      // Ignore invalid colors
    }
    return { hasConflict: false, message: "" };
  }

  // ===== Components =====

  addComponent(
    type: string,
    variant: string | undefined,
    props: Record<string, unknown>,
    parentId: string | null,
    source: "ai" | "user" = "ai"
  ): ComponentNode {
    // Check component dependencies (advisory only)
    const dep = this.checkComponentDependency(type);
    if (dep.hasWarning) {
      this.logActivity("component_warning", type, dep.message, source);
    }

    const node: ComponentNode = {
      id: `comp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type,
      variant,
      props,
      children: [],
    };

    if (parentId) {
      const parent = this.findComponent(parentId);
      if (parent) {
        parent.children.push(node);
      } else {
        // Parent not found (e.g. removed concurrently) — append to page root
        // instead of silently dropping the new node.
        const page = this.currentPage();
        if (page) page.components.push(node);
      }
    } else {
      const page = this.currentPage();
      if (page) page.components.push(node);
    }

    this.logActivity("add_component", type, `Added ${type}${variant ? ` (${variant})` : ""}`, source);
    this.commit({ type: "addComponent", component: node, parentId });
    return node;
  }

  updateComponent(
    id: string,
    props: Record<string, unknown>,
    source: "ai" | "user" = "ai",
    layout?: Partial<ComponentLayout>,
    flags?: { visible?: boolean; locked?: boolean }
  ): boolean {
    const node = this.findComponent(id);
    if (!node) return false;
    node.props = { ...node.props, ...props };
    if (layout) {
      node.layout = {
        x: layout.x ?? node.layout?.x ?? 0,
        y: layout.y ?? node.layout?.y ?? 0,
        w: layout.w ?? node.layout?.w ?? 0,
        h: layout.h ?? node.layout?.h ?? 0,
      };
    }
    if (flags) {
      if (typeof flags.visible === "boolean") node.visible = flags.visible;
      if (typeof flags.locked === "boolean") node.locked = flags.locked;
    }
    this.logActivity("update_component", node.type, `Updated ${node.type} (${id})`, source);
    this.commit({ type: "updateComponent", id, props });
    return true;
  }

  /**
   * Rename a component's layer (精确编辑 P0: 图层重命名). Sets the
   * user-visible `name`; pass an empty string to revert to the type-based
   * default. Undoable like any mutation.
   */
  renameComponent(id: string, name: string, source: "ai" | "user" = "user"): boolean {
    const node = this.findComponent(id);
    if (!node) return false;
    const trimmed = name.trim();
    if (trimmed) {
      node.name = trimmed;
    } else {
      delete node.name;
    }
    this.logActivity("rename_component", node.type, `Renamed ${id} → "${trimmed || node.type}"`, source);
    this.commit({ type: "renameComponent", id, name: node.name || null });
    return true;
  }

  removeComponent(id: string, source: "ai" | "user" = "ai"): boolean {
    const removed = this.removeFromTree(this.currentComponents(), id);
    if (!removed) return false;
    this.logActivity("remove_component", "component", `Removed component (${id})`, source);
    this.commit({ type: "removeComponent", id });
    return true;
  }

  /**
   * Duplicate a component (deep-copy, new ids) and insert it right after the
   * original. Returns the new node, or null when the source id is unknown.
   */
  duplicateComponent(id: string, source: "ai" | "user" = "ai"): ComponentNode | null {
    const locate = (nodes: ComponentNode[]): { arr: ComponentNode[]; idx: number } | null => {
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].id === id) return { arr: nodes, idx: i };
        const found = locate(nodes[i].children);
        if (found) return found;
      }
      return null;
    };
    const loc = locate(this.currentComponents());
    if (!loc) return null;

    const copy = JSON.parse(JSON.stringify(loc.arr[loc.idx])) as ComponentNode;
    const reid = (n: ComponentNode): void => {
      n.id = `comp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      (n.children || []).forEach(reid);
    };
    reid(copy);
    // Nudge the clone so it is visibly distinct in freeform mode.
    if (copy.layout) {
      copy.layout = { ...copy.layout, x: (copy.layout.x || 0) + 24, y: (copy.layout.y || 0) + 24 };
    }

    loc.arr.splice(loc.idx + 1, 0, copy);
    this.logActivity("duplicate_component", copy.type, `Duplicated ${copy.type} (${id} → ${copy.id})`, source);
    this.commit({ type: "duplicateComponent", id, newId: copy.id });
    return copy;
  }

  /** V2.0 多断点编辑: 设置桌面基线样式（全量替换）。 */
  setBaseStyle(id: string, style: Record<string, string>, source: "ai" | "user" = "user"): boolean {
    const node = this.findComponent(id);
    if (!node) return false;
    node.baseStyle = { ...style };
    this.logActivity("set_base_style", node.type, `Base style set on ${id}`, source);
    this.commit({ type: "setBaseStyle", id });
    return true;
  }

  /** M2 盒子模式: 更新组件的盒子模式配置（partial merge）。 */
  setBoxMode(
    id: string,
    patch: { enabled?: boolean; internalConfig?: Record<string, unknown> },
    source: "ai" | "user" = "user"
  ): boolean {
    const node = this.findComponent(id);
    if (!node) return false;
    node.boxMode = {
      enabled: patch.enabled ?? node.boxMode?.enabled ?? false,
      internalConfig: {
        ...(node.boxMode?.internalConfig || {}),
        ...(patch.internalConfig || {}),
      },
    };
    this.logActivity("set_box_mode", node.type, `Box mode updated on ${id}`, source);
    this.commit({ type: "setBoxMode", id });
    return true;
  }

  /** V2.0 多断点编辑: 设置某断点的差异样式（merge 到该断点已有差异上）。 */
  setBreakpointOverride(
    id: string,
    bp: import("./responsive.js").Breakpoint,
    style: Record<string, string>,
    source: "ai" | "user" = "user"
  ): boolean {
    if (!isBreakpointSafe(bp)) return false;
    const node = this.findComponent(id);
    if (!node) return false;
    node.breakpointOverrides = {
      ...node.breakpointOverrides,
      [bp]: { ...(node.breakpointOverrides?.[bp] || {}), ...style },
    };
    this.logActivity("set_breakpoint_style", node.type, `${bp} override set on ${id}`, source);
    this.commit({ type: "setBreakpointOverride", id, breakpoint: bp });
    return true;
  }

  /** V2.0 时间线: 向组件追加一个动效块。 */
  addTimelineAnimation(componentId: string, anim: Omit<TimelineAnimation, "id"> & { id?: string }, source: "ai" | "user" = "user"): TimelineAnimation | null {
    const node = this.findComponent(componentId);
    if (!node) return null;
    const entry: TimelineAnimation = {
      ...anim,
      id: anim.id || `anim_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    };
    node.animations = [...(node.animations || []), entry];
    this.logActivity("add_timeline_animation", node.type, `Animation "${entry.preset}" on track ${entry.trackId}`, source);
    this.commit({ type: "addTimelineAnimation", id: componentId, animationId: entry.id });
    return entry;
  }

  setAnimation(
    componentId: string,
    animation: AnimationDef,
    source: "ai" | "user" = "ai"
  ): boolean {
    const node = this.findComponent(componentId);
    if (!node) return false;
    node.animation = { ...node.animation, ...animation };
    const engineLabel = animation.engine ? ` [${animation.engine}]` : "";
    this.logActivity("set_animation", node.type, `Set animation for ${node.type} (${componentId})${engineLabel}`, source);
    this.commit({ type: "setAnimation", componentId, animation: node.animation });
    return true;
  }

  /**
   * Replace a component's definition in place (模板快速变更 P0: 组件模板).
   * Swaps type/variant/props and optionally behavior/animation while keeping
   * the same id and layout position, so a block can be swapped without moving
   * the canvas arrangement. Children are dropped (the template defines the
   * full block). Undoable like any mutation.
   */
  replaceComponent(
    id: string,
    patch: {
      type: string;
      variant?: string;
      props: Record<string, unknown>;
      behavior?: ComponentBehavior | null;
      animation?: AnimationDef | null;
    },
    source: "ai" | "user" = "user"
  ): boolean {
    const node = this.findComponent(id);
    if (!node) return false;
    node.type = patch.type;
    node.variant = patch.variant;
    node.props = JSON.parse(JSON.stringify(patch.props)) as Record<string, unknown>;
    node.children = [];
    // 组件定义被替换后，旧路径的元素级元数据不再有意义。
    delete node.elementMeta;
    if (patch.behavior !== undefined) {
      if (patch.behavior && isBehaviorType(patch.behavior.type)) {
        node.behavior = { ...patch.behavior };
      } else {
        delete node.behavior;
      }
    }
    if (patch.animation !== undefined) {
      if (patch.animation) {
        node.animation = JSON.parse(JSON.stringify(patch.animation)) as AnimationDef;
      } else {
        delete node.animation;
      }
    }
    this.logActivity(
      "replace_component",
      node.type,
      `Replaced ${id} with ${node.type}${node.variant ? ` (${node.variant})` : ""}`,
      source
    );
    this.commit({ type: "replaceComponent", id, newType: node.type });
    return true;
  }

  /**
   * Bind or clear an interaction behavior on a component (行为模型 P1).
   * Pass `null` to remove the behavior. Undoable like any mutation.
   */
  setBehavior(
    componentId: string,
    behavior: ComponentBehavior | null,
    source: "ai" | "user" = "user"
  ): boolean {
    const node = this.findComponent(componentId);
    if (!node) return false;
    if (behavior && isBehaviorType(behavior.type)) {
      node.behavior = { ...behavior };
    } else {
      delete node.behavior;
    }
    this.logActivity(
      "set_behavior",
      node.type,
      `${node.type} 行为 → ${behavior && isBehaviorType(behavior.type) ? behavior.type : "无"}`,
      source
    );
    this.commit({ type: "setBehavior", componentId, behavior: node.behavior || null });
    return true;
  }

  /**
   * Set or clear element-level metadata (元素级编辑 P1) for an inner element
   * identified by its prop path. Pass `null` (or an entry without any valid
   * fields) to remove the metadata for that path. Undoable like any mutation.
   */
  setElementMeta(
    componentId: string,
    path: string,
    meta: { behavior?: ComponentBehavior | null; kind?: ElementKind | null; css?: Record<string, string> | null } | null,
    source: "ai" | "user" = "user"
  ): boolean {
    const node = this.findComponent(componentId);
    if (!node) return false;
    if (!path) return false;
    if (!node.elementMeta) node.elementMeta = {};
    const existing = node.elementMeta[path];
    // meta === null removes the whole entry (e.g. clearing element selection).
    if (!meta) {
      delete node.elementMeta[path];
    } else {
      const next: ElementMeta = { ...(existing || {}) };
      if (meta.behavior !== undefined) {
        if (meta.behavior && isBehaviorType(meta.behavior.type)) {
          next.behavior = { ...meta.behavior };
        } else {
          delete next.behavior;
        }
      }
      if (meta.kind !== undefined) {
        if (meta.kind && isElementKind(meta.kind)) {
          next.kind = meta.kind;
        } else {
          delete next.kind;
        }
      }
      if (meta.css !== undefined) {
        if (meta.css === null) {
          delete next.css;
        } else if (typeof meta.css === "object") {
          // Merge semantics: empty value removes the property, unknown or
          // oversized values are dropped (whitelist above).
          const merged: Record<string, string> = { ...(next.css || {}) };
          for (const [prop, value] of Object.entries(meta.css)) {
            if (!ELEMENT_CSS_PROPS.has(prop) || typeof value !== "string" || value.length > 200) continue;
            if (value.length === 0) delete merged[prop];
            else merged[prop] = value;
          }
          if (Object.keys(merged).length > 0) next.css = merged;
          else delete next.css;
        }
      }
      if (Object.keys(next).length === 0) {
        delete node.elementMeta[path];
      } else {
        node.elementMeta[path] = next;
      }
    }
    if (Object.keys(node.elementMeta).length === 0) delete node.elementMeta;
    this.logActivity(
      "set_element_meta",
      node.type,
      `${node.type} 元素 "${path}" ${meta ? "已配置" : "已清除"}`,
      source
    );
    this.commit({ type: "setElementMeta", componentId, path, meta: meta || null });
    return true;
  }

  /**
   * 内部元素拖拽排序 (DESIGN.md v1.1 §5.2): move the array item backing the
   * element at `path` before/after the item backing `targetPath`. Both paths
   * must live in the same props array (e.g. "items.0.title" ↔ "items.2.title").
   * elementMeta keys are remapped so element-level edits follow their item.
   * One commit = one undo step.
   */
  moveArrayItem(
    componentId: string,
    path: string,
    position: "before" | "after",
    targetPath: string,
    source: "ai" | "user" = "user"
  ): boolean {
    const node = this.findComponent(componentId);
    if (!node || !node.props || !path || !targetPath || path === targetPath) return false;
    const splitArrayPath = (p: string): { prefix: string; index: number } | null => {
      const segs = p.split(".");
      let lastNum = -1;
      for (let i = segs.length - 1; i >= 0; i--) {
        if (/^\d+$/.test(segs[i])) { lastNum = i; break; }
      }
      if (lastNum <= 0) return null; // 数组前缀不能为空（"0.x" 不是合法元素路径）
      return { prefix: segs.slice(0, lastNum).join("."), index: parseInt(segs[lastNum], 10) };
    };
    const a = splitArrayPath(path);
    const b = splitArrayPath(targetPath);
    if (!a || !b || a.prefix !== b.prefix) return false;

    // Walk to the array parent through props (object keys / array indices).
    const segs = a.prefix.split(".");
    let container: unknown = node.props;
    for (const seg of segs) {
      if (Array.isArray(container)) container = container[parseInt(seg, 10)];
      else if (container && typeof container === "object") container = (container as Record<string, unknown>)[seg];
      else return false;
    }
    if (!Array.isArray(container)) return false;
    const from = a.index;
    const to = b.index;
    if (from === to || from < 0 || from >= container.length || to < 0 || to >= container.length) return false;
    const [item] = container.splice(from, 1);
    const insertAt = position === "after" ? (from < to ? to : to + 1) : (from < to ? to - 1 : to);
    container.splice(Math.max(0, Math.min(container.length, insertAt)), 0, item);

    // Remap elementMeta keys under the moved item's index.
    // Move semantics (post-removal insertAt): old[from] → insertAt;
    // from < insertAt: old (from, insertAt] → idx-1;
    // from > insertAt: old [insertAt, from) → idx+1; others unchanged.
    if (node.elementMeta) {
      const remapped: Record<string, ElementMeta> = {};
      const mapIndex = (idx: number): number => {
        if (idx === from) return insertAt;
        if (from < insertAt && idx > from && idx <= insertAt) return idx - 1;
        if (from > insertAt && idx >= insertAt && idx < from) return idx + 1;
        return idx;
      };
      const prefixRe = new RegExp(`^${a.prefix.replace(/[.\\]/g, "\\$&")}\\.(\\d+)`);
      for (const [key, meta] of Object.entries(node.elementMeta)) {
        const m = prefixRe.exec(key);
        if (!m) { remapped[key] = meta; continue; }
        const nextIdx = mapIndex(parseInt(m[1], 10));
        remapped[key.replace(prefixRe, `${a.prefix}.${nextIdx}`)] = meta;
      }
      node.elementMeta = remapped;
    }

    this.logActivity(
      "move_array_item",
      node.type,
      `${node.type} 元素 "${path}" 移动到 ${position} "${targetPath}"`,
      source
    );
    this.commit({ type: "moveArrayItem", componentId, path, position, targetPath });
    return true;
  }

    /**
     * 内部元素组件化 (DESIGN.md v1.1 §5.2): promote a selected inner element
     * (identified by its prop path) into an independent child ComponentNode.
     * The child keeps a `promotedElementPath` back-reference and the parent
     * records the mapping so export/preview can render the child in place of
     * the original element. Undoable like any mutation.
     */
    promoteElementToComponent(
      componentId: string,
      path: string,
      type?: string,
      source: "ai" | "user" = "user"
    ): ComponentNode | null {
      const node = this.findComponent(componentId);
      if (!node || !path) return null;
      const meta = node.elementMeta?.[path];
      const childType =
        type ||
        (meta?.kind === "button" ? "button" : meta?.kind === "link" ? "button" : "text");
      const child: ComponentNode = {
        id: `comp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type: childType,
        props: meta?.kind === "link" && meta.behavior?.url ? { text: path, href: meta.behavior.url } : { text: path },
        children: [],
        promotedElementPath: path,
      };
      node.children.push(child);
      if (!node.promotedElements) node.promotedElements = {};
      node.promotedElements[path] = child.id;
      this.logActivity(
        "promote_element_to_component",
        node.type,
        `Promoted ${node.type} element "${path}" → child component ${child.id}`,
        source
      );
      this.commit({ type: "promoteElementToComponent", componentId, path, childId: child.id });
      return child;
    }


  // ===== Page background (背景编辑 P1) =====

  /**
   * Set or clear the page-level background (背景编辑 P1). Pass `null` to
   * remove it and fall back to the design tokens. Undoable like any mutation.
   */
  setPageBackground(background: PageBackground | null, source: "ai" | "user" = "user"): boolean {
    if (background) {
      this.state.pageBackground = {
        type: background.type,
        value: background.value,
        ...(background.animation ? { animation: background.animation } : {}),
        ...(background.params && Object.keys(background.params).length > 0
          ? { params: { ...background.params } }
          : {}),
      };
    } else {
      delete this.state.pageBackground;
    }
    this.logActivity(
      "set_page_background",
      "page",
      background ? `页面背景 → ${background.type}${background.animation ? " / " + background.animation : ""}` : "页面背景已清除",
      source
    );
    this.commit({
      type: "setPageBackground",
      background: this.state.pageBackground ? JSON.parse(JSON.stringify(this.state.pageBackground)) : null,
    });
    return true;
  }

  getPageBackground(): PageBackground | null {
    return this.state.pageBackground
      ? JSON.parse(JSON.stringify(this.state.pageBackground))
      : null;
  }

  // ===== Scroll (upgrade plan U1: Lenis integration) =====
  setScroll(mode: ScrollConfig["mode"], options: ScrollConfig["options"], source: "ai" | "user" = "ai"): void {
    this.state.scroll = {
      mode,
      options: options || {},
      scrollToTargets: this.state.scroll?.scrollToTargets || [],
    };
    this.logActivity("set_scroll", "scroll", `Scroll mode set to "${mode}"`, source);
    this.commit({ type: "setScroll", mode, options });
  }

  getScroll(): ScrollConfig | null {
    return this.state.scroll ? JSON.parse(JSON.stringify(this.state.scroll)) : null;
  }

  addScrollToTarget(target: Omit<ScrollToTarget, "id"> & { id?: string }, source: "ai" | "user" = "ai"): ScrollToTarget {
    if (!this.state.scroll) {
      this.state.scroll = { mode: "native", options: {}, scrollToTargets: [] };
    }
    if (!this.state.scroll.scrollToTargets) this.state.scroll.scrollToTargets = [];
    const withId = { ...target, id: target.id || `scroll_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` };
    this.state.scroll.scrollToTargets.push(withId);
    this.logActivity("add_scroll_target", "scroll", `Added scroll-to target ${target.target}`, source);
    this.commit({ type: "addScrollTarget", target: withId });
    return withId;
  }

  // ===== Vanta backgrounds (upgrade plan U2) =====

  setVantaBackground(
    targetId: string,
    config: VantaBackgroundConfig,
    source: "ai" | "user" = "ai"
  ): VantaBackgroundConfig {
    if (!this.state.vantaBackgrounds) this.state.vantaBackgrounds = {};
    this.state.vantaBackgrounds[targetId] = config;
    this.logActivity("set_vanta_bg", "vanta", `Set Vanta ${config.effect} background for ${targetId}`, source);
    this.commit({ type: "setVantaBackground", targetId, config });
    return config;
  }

  removeVantaBackground(targetId: string, source: "ai" | "user" = "ai"): boolean {
    if (!this.state.vantaBackgrounds || !this.state.vantaBackgrounds[targetId]) return false;
    delete this.state.vantaBackgrounds[targetId];
    this.logActivity("remove_vanta_bg", "vanta", `Removed Vanta background for ${targetId}`, source);
    this.commit({ type: "removeVantaBackground", targetId });
    return true;
  }

  getVantaBackgrounds(): Record<string, VantaBackgroundConfig> {
    return JSON.parse(JSON.stringify(this.state.vantaBackgrounds || {}));
  }

  // ===== React Bits (upgrade plan U3) =====

  registerReactBitsComponent(
    componentId: string,
    name: string,
    variant: string,
    props?: Record<string, unknown>,
    source: "ai" | "user" = "ai"
  ): void {
    if (!this.state.reactBits) this.state.reactBits = {};
    this.state.reactBits[componentId] = { name, variant, props };
    this.logActivity("register_react_bits", "react-bits", `Registered React Bits ${name} (${variant}) for ${componentId}`, source);
    this.commit({ type: "registerReactBits", componentId, name, variant });
  }

  getReactBitsComponent(componentId: string): { name: string; variant: string; props?: Record<string, unknown> } | null {
    return this.state.reactBits?.[componentId] ? JSON.parse(JSON.stringify(this.state.reactBits[componentId])) : null;
  }

  // ===== Export runtime (upgrade plan U4) =====

  setExportRuntime(runtime: "minimal" | "standard" | "full", source: "ai" | "user" = "ai"): void {
    this.state.exportRuntime = runtime;
    this.logActivity("set_export_runtime", "export", `Export runtime set to "${runtime}"`, source);
    this.commit({ type: "setExportRuntime", runtime });
  }

  getExportRuntime(): "minimal" | "standard" | "full" {
    return this.state.exportRuntime || "standard";
  }

  reorderComponent(
    fromId: string,
    toId: string,
    position: "before" | "after",
    source: "ai" | "user" = "ai"
  ): boolean {
    const components = this.currentComponents();
    const fromIdx = components.findIndex((c) => c.id === fromId);
    const toIdx = components.findIndex((c) => c.id === toId);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return false;

    const [moved] = components.splice(fromIdx, 1);
    const newToIdx = components.findIndex((c) => c.id === toId);
    const insertIdx = position === "before" ? newToIdx : newToIdx + 1;
    components.splice(insertIdx, 0, moved);

    this.logActivity("reorder_component", "component", `Moved ${fromId} ${position} ${toId}`, source);
    this.commit({ type: "reorderComponent", fromId, toId, position });
    return true;
  }

  /**
   * 画布调整 (P2): 把一个组件移动为另一个组件的子组件（parentId 为 null
   * 则回到顶层）。不能把组件移到自身或自身的后代里；parent 必须在当前页。
   * 一次提交 = 一步撤销。
   */
  reparentComponent(
    id: string,
    parentId: string | null,
    source: "ai" | "user" = "user"
  ): boolean {
    if (id === parentId) return false;
    const page = this.state.pages?.find((p) => p.id === this.state.currentPageId) || this.state.pages?.[0];
    if (!page) return false;
    const parent = parentId ? this.findComponent(parentId) : null;
    if (parentId && !parent) return false;

    const detach = (nodes: ComponentNode[], targetId: string): ComponentNode | null => {
      const i = nodes.findIndex((n) => n.id === targetId);
      if (i >= 0) return nodes.splice(i, 1)[0];
      for (const node of nodes) {
        const found = detach(node.children, targetId);
        if (found) return found;
      }
      return null;
    };
    const node = detach(page.components, id);
    if (!node) return false;
    if (parent) {
      // 防止把 parent 装进自己（id === parentId 已拦）或自己的后代
      const contains = (n: ComponentNode, targetId: string): boolean =>
        n.id === targetId || n.children.some((c) => contains(c, targetId));
      if (contains(node, parentId!)) {
        page.components.push(node); // 恢复原位，拒绝操作
        return false;
      }
      parent.children.push(node);
    } else {
      page.components.push(node);
    }
    this.logActivity("reparent_component", node.type, `Reparented ${id}${parentId ? " → " + parentId : " → top-level"}`, source);
    this.commit({ type: "reparentComponent", id, parentId });
    return true;
  }

  /**
   * 成组 (P2): 把 2+ 个顶层组件包进一个新的分组容器（type "container"）。
   * 子组件转为流式（删除 layout），分组容器占据其包围盒位置。
   * 一次提交 = 一步撤销。
   */
  groupComponents(ids: string[], source: "ai" | "user" = "user"): ComponentNode | null {
    const page = this.state.pages?.find((p) => p.id === this.state.currentPageId) || this.state.pages?.[0];
    if (!page) return null;
    const targets = ids
      .map((id) => {
        const i = page.components.findIndex((c) => c.id === id);
        return i >= 0 ? { node: page.components[i], idx: i } : null;
      })
      .filter((x): x is { node: ComponentNode; idx: number } => !!x);
    if (targets.length < 2) return null;
    targets.sort((a, b) => a.idx - b.idx);

    const boxes = targets.map(({ node }) => ({
      x: node.layout?.x ?? 0,
      y: node.layout?.y ?? 0,
      w: node.layout?.w ?? 320,
      h: node.layout?.h ?? 140,
    }));
    const minX = Math.min(...boxes.map((b) => b.x));
    const minY = Math.min(...boxes.map((b) => b.y));
    const maxX = Math.max(...boxes.map((b) => b.x + b.w));
    const maxY = Math.max(...boxes.map((b) => b.y + b.h));

    const group: ComponentNode = {
      id: `comp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: "container",
      props: { text: "分组" },
      layout: { x: minX, y: minY, w: Math.max(80, maxX - minX), h: Math.max(60, maxY - minY) },
      children: [],
    };
    // 倒序摘出避免下标错位；子组件转流式（随分组容器移动）
    targets.slice().reverse().forEach(({ idx }) => {
      const [node] = page.components.splice(idx, 1);
      delete node.layout;
      group.children.unshift(node);
    });
    page.components.splice(Math.min(targets[0].idx, page.components.length), 0, group);
    this.logActivity("group_components", "container", `Grouped ${targets.length} components (${ids.join(",")})`, source);
    this.commit({ type: "groupComponents", ids, groupId: group.id });
    return group;
  }

  /**
   * 解组 (P2): 把分组容器的子组件放回顶层（分组原位置起纵向排布），删除分组。
   */
  ungroupComponents(groupId: string, source: "ai" | "user" = "user"): boolean {
    const page = this.state.pages?.find((p) => p.id === this.state.currentPageId) || this.state.pages?.[0];
    if (!page) return false;
    const idx = page.components.findIndex((c) => c.id === groupId);
    if (idx === -1) return false;
    const [group] = page.components.splice(idx, 1);
    const originX = group.layout?.x ?? 16;
    const originY = group.layout?.y ?? 16;
    let cursor = originY;
    (group.children || []).forEach((child) => {
      const h = child.layout?.h ?? 140;
      child.layout = { x: originX, y: cursor, w: group.layout?.w ?? 320, h };
      cursor += h + 16;
      page.components.splice(idx, 0, child);
    });
    this.logActivity("ungroup_components", "container", `Ungrouped ${groupId}`, source);
    this.commit({ type: "ungroupComponents", groupId });
    return true;
  }

  /**
   * 分页 (P2): 把一个组件（含子组件）移动到另一个页面（顶层，保留布局）。
   * 源组件可能位于任意页面，从所有非目标页面中查找并摘除。
   */
  moveComponentToPage(id: string, targetPageId: string, source: "ai" | "user" = "user"): boolean {
    const pages = this.state.pages || [];
    const target = pages.find((p) => p.id === targetPageId);
    if (!target) return false;
    const detach = (nodes: ComponentNode[], targetId: string): ComponentNode | null => {
      const i = nodes.findIndex((n) => n.id === targetId);
      if (i >= 0) return nodes.splice(i, 1)[0];
      for (const node of nodes) {
        const found = detach(node.children, targetId);
        if (found) return found;
      }
      return null;
    };
    for (const page of pages) {
      if (page.id === targetPageId) continue;
      const node = detach(page.components, id);
      if (node) {
        target.components.push(node);
        this.logActivity("move_to_page", node.type, `Moved ${id} to page ${targetPageId}`, source);
        this.commit({ type: "moveToPage", id, targetPageId });
        return true;
      }
    }
    return false;
  }

  /**
   * Align or distribute a set of components in freeform space (精确编辑 P0).
   * All targets must exist; layouts are nudged as needed and committed once,
   * so the whole operation is a single undo step. Returns false when fewer
   * than two targets exist.
   */
  alignComponents(
    ids: string[],
    mode: AlignMode,
    source: "ai" | "user" = "user"
  ): boolean {
    const targets = ids
      .map((id) => this.findComponent(id))
      .filter((c): c is ComponentNode => !!c);
    if (targets.length < 2) return false;

    const boxes = targets.map((c) => ({
      x: c.layout?.x ?? 0,
      y: c.layout?.y ?? 0,
      w: c.layout?.w ?? 0,
      h: c.layout?.h ?? 0,
    }));
    const minX = Math.min(...boxes.map((b) => b.x));
    const maxX = Math.max(...boxes.map((b) => b.x + b.w));
    const minY = Math.min(...boxes.map((b) => b.y));
    const maxY = Math.max(...boxes.map((b) => b.y + b.h));

    const apply = (fn: (b: { x: number; y: number; w: number; h: number }, i: number) => { x?: number; y?: number }): void => {
      targets.forEach((c, i) => {
        const next = fn(boxes[i], i);
        if (next.x !== undefined || next.y !== undefined) {
          c.layout = {
            x: next.x ?? boxes[i].x,
            y: next.y ?? boxes[i].y,
            w: boxes[i].w,
            h: boxes[i].h,
          };
        }
      });
    };

    switch (mode) {
      case "left":
        apply((_b) => ({ x: minX }));
        break;
      case "center_x":
        apply((b) => ({ x: (minX + maxX) / 2 - b.w / 2 }));
        break;
      case "right":
        apply((b) => ({ x: maxX - b.w }));
        break;
      case "top":
        apply((_b) => ({ y: minY }));
        break;
      case "center_y":
        apply((b) => ({ y: (minY + maxY) / 2 - b.h / 2 }));
        break;
      case "bottom":
        apply((b) => ({ y: maxY - b.h }));
        break;
      case "distribute_x": {
        const ordered = [...boxes].sort((a, b) => a.x - b.x);
        const span = maxX - minX;
        const totalW = ordered.reduce((s, b) => s + b.w, 0);
        const gap = (span - totalW) / (ordered.length - 1);
        let cursor = minX;
        apply((_b, i) => {
          const x = cursor;
          cursor += ordered[i].w + gap;
          return { x };
        });
        break;
      }
      case "distribute_y": {
        const ordered = [...boxes].sort((a, b) => a.y - b.y);
        const span = maxY - minY;
        const totalH = ordered.reduce((s, b) => s + b.h, 0);
        const gap = (span - totalH) / (ordered.length - 1);
        let cursor = minY;
        apply((_b, i) => {
          const y = cursor;
          cursor += ordered[i].h + gap;
          return { y };
        });
        break;
      }
      default:
        return false;
    }

    this.logActivity("align_components", "component", `${mode} on ${targets.length} components`, source);
    this.commit({ type: "alignComponents", ids, mode });
    return true;
  }

  /**
   * M2 智能布局: 把多个组件的 x/y 吸附到网格（默认 8px）。
   * 单个 undo 步（runBatch），返回是否有组件被实际修正。
   */
  snapComponentsToGrid(ids: string[], grid = 8, source: "ai" | "user" = "user"): boolean {
    const results = snapToGrid(
      ids
        .map((id) => this.findComponent(id))
        .filter((c): c is ComponentNode => !!c)
        .map((c) => ({ id: c.id, layout: c.layout })),
      grid
    );
    const moved = results.filter((r) => r.from.x !== r.to.x || r.from.y !== r.to.y);
    if (moved.length === 0) return results.length > 0;
    runBatch("snap-to-grid", () => {
      for (const r of moved) {
        this.updateComponent(r.id, {}, source, { x: r.to.x, y: r.to.y });
      }
    });
    this.logActivity("snap_to_grid", "layout", `Snapped ${moved.length} components to ${grid}px grid`, source);
    return true;
  }

  /**
   * M3 协同: 把 Y.Doc 侧（远端客户端）的组件变更投影进状态树。
   * changed 中的 node 为平面表示（children 恒为 []）——已有组件做字段合并
   * （不动 children），新组件按 parentId/index 插入，removed 直接摘除，
   * 受影响的兄弟序列按 order（ydoc 全量索引）重排。
   */
  applyCollabEntries(
    changed: Array<{ id: string; node: ComponentNode; parentId: string | null; pageId: string; index: number }>,
    removedIds: string[],
    order: Map<string, { parentId: string | null; pageId: string; index: number }>
  ): boolean {
    if (changed.length === 0 && removedIds.length === 0) return false;
    const pages = this.state.pages;
    const pageIds = new Set(pages.map((p) => p.id));
    const touchedRootPages = new Set<string>();
    const touchedParents = new Set<string>();

    const detach = (id: string): void => {
      const visit = (arr: ComponentNode[]): boolean => {
        for (let i = 0; i < arr.length; i++) {
          if (arr[i].id === id) {
            arr.splice(i, 1);
            return true;
          }
          if (visit(arr[i].children ?? [])) return true;
        }
        return false;
      };
      for (const page of pages) {
        if (visit(page.components)) return;
      }
    };

    for (const id of removedIds) {
      const meta = order.get(id);
      if (meta?.parentId) touchedParents.add(meta.parentId);
      else if (meta) touchedRootPages.add(meta.pageId);
      detach(id);
    }

    for (const e of changed) {
      if (!pageIds.has(e.pageId)) continue;
      const existing = this.findComponent(e.id);
      if (existing) {
        for (const [k, v] of Object.entries(e.node)) {
          if (k !== "children") (existing as unknown as Record<string, unknown>)[k] = v;
        }
      } else {
        const fresh = { ...(e.node as unknown as ComponentNode), children: [] as ComponentNode[] };
        if (e.parentId) {
          const parent = this.findComponent(e.parentId);
          if (parent) {
            parent.children = parent.children ?? [];
            parent.children.push(fresh);
          }
        } else {
          const page = pages.find((p) => p.id === e.pageId);
          if (page) page.components.push(fresh);
        }
      }
      if (e.parentId) touchedParents.add(e.parentId);
      else touchedRootPages.add(e.pageId);
    }

    const sortSiblings = (arr: ComponentNode[]): void => {
      arr.sort((a, b) => (order.get(a.id)?.index ?? 0) - (order.get(b.id)?.index ?? 0));
    };
    for (const pid of touchedParents) {
      const parent = this.findComponent(pid);
      if (parent?.children?.length) sortSiblings(parent.children);
    }
    for (const pageId of touchedRootPages) {
      const page = pages.find((p) => p.id === pageId);
      if (page) sortSiblings(page.components);
    }

    this.logActivity("collab_sync", "system", `Applied ${changed.length} changed / ${removedIds.length} removed components from collab`, "user");
    this.commitCollab({ type: "collabSync" });
    return true;
  }

  /**
   * P3a 协同: 把 Y.Doc 侧（远端客户端）的评论变更投影进状态（无历史）。
   * 全量列表比对（按 createdAt+id 排序保证双侧一致），无差异返回 false；
   * 超过 200 条按 addComment 同款上限裁剪（裁剪差值随后由 reconcile 从
   * Y.Doc 删除，保持双侧最终一致）。
   */
  applyCollabComments(comments: DesignComment[]): boolean {
    const sorted = [...comments].sort(
      (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
    );
    const clipped = sorted.length > 200 ? sorted.slice(-200) : sorted;
    const prev = this.state.comments;
    const same =
      prev.length === clipped.length &&
      prev.every((c, i) => JSON.stringify(c) === JSON.stringify(clipped[i]));
    if (same) return false;
    this.state.comments = clipped.map((c) => ({ ...c }));
    this.logActivity("collab_sync", "system", `Applied ${clipped.length} comments from collab`, "user");
    this.commitCollab({ type: "collabCommentsSync" });
    return true;
  }

  /**
   * P3b 协同: 把 Y.Doc 侧（远端客户端）的连线变更投影进状态（无历史）。
   * 按 id 稳定排序后全量比对，超过 500 条按 addPageLink 同款上限裁剪。
   */
  applyCollabPageLinks(links: PageLink[]): boolean {
    const sorted = [...links].sort((a, b) => a.id.localeCompare(b.id));
    const clipped = sorted.length > 500 ? sorted.slice(-500) : sorted;
    const prev = this.state.pageLinks;
    const same =
      prev.length === clipped.length &&
      prev.every((l, i) => JSON.stringify(l) === JSON.stringify(clipped[i]));
    if (same) return false;
    this.state.pageLinks = clipped.map((l) => ({ ...l }));
    this.logActivity("collab_sync", "system", `Applied ${clipped.length} page links from collab`, "user");
    this.commitCollab({ type: "collabPageLinksSync" });
    return true;
  }

  /**
   * M2 智能布局: 对选中组件做确定性重排（等间距堆叠 + 左对齐 + 可选容器 clamp）。
   */
  applySmartLayout(
    ids: string[],
    options: { grid?: number; gap?: number; container?: { x: number; y: number; width: number; height: number } | null },
    source: "ai" | "user" = "user"
  ): boolean {
    const targets = ids
      .map((id) => this.findComponent(id))
      .filter((c): c is ComponentNode => !!c);
    if (targets.length === 0) return false;
    const boxes = targets.map((c) => ({
      id: c.id,
      x: c.layout?.x ?? 0,
      y: c.layout?.y ?? 0,
      w: c.layout?.w ?? 320,
      h: c.layout?.h ?? 80,
    }));
    const out = smartLayout(boxes, options);
    runBatch("smart-layout", () => {
      for (const b of out) {
        this.updateComponent(b.id, {}, source, { x: b.x, y: b.y, w: b.w, h: b.h });
      }
    });
    this.logActivity("smart_layout", "layout", `Smart layout applied to ${out.length} components`, source);
    return true;
  }

  /**
   * Reorder a component's stacking order (精确编辑 P0): front / back /
   * forward / backward, within its containing list (top-level or nested).
   */
  zOrderComponent(id: string, mode: ZOrderMode, source: "ai" | "user" = "user"): boolean {
    const locate = (
      nodes: ComponentNode[]
    ): { arr: ComponentNode[]; idx: number } | null => {
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].id === id) return { arr: nodes, idx: i };
        const found = locate(nodes[i].children);
        if (found) return found;
      }
      return null;
    };
    const loc = locate(this.currentComponents());
    if (!loc) return false;

    const [node] = loc.arr.splice(loc.idx, 1);
    let target: number;
    switch (mode) {
      case "front":
        target = loc.arr.length;
        break;
      case "back":
        target = 0;
        break;
      case "forward":
        target = Math.min(loc.arr.length, loc.idx + 1);
        break;
      case "backward":
        target = Math.max(0, loc.idx - 1);
        break;
      default:
        loc.arr.splice(loc.idx, 0, node);
        return false;
    }
    loc.arr.splice(target, 0, node);

    this.logActivity("z_order", node.type, `${mode} ${node.type} (${id})`, source);
    this.commit({ type: "zOrderComponent", id, mode });
    return true;
  }

  /**
   * Record the provenance of an imported product page (导入 → 调整 → 一键应用).
   */
  setImport(pageId: string, record: ImportRecord, source: "ai" | "user" = "user"): void {
    if (!this.state.imports) this.state.imports = {};
    this.state.imports[pageId] = record;
    this.logActivity(
      "import_record",
      "import",
      `Imported "${record.source}" (${record.component_count} components)`,
      source
    );
    this.commit({ type: "setImport", pageId, record });
  }

  getImport(pageId: string | null | undefined): ImportRecord | null {
    if (!pageId || !this.state.imports) return null;
    return this.state.imports[pageId] || null;
  }

  /**
   * Replace the current page's component order with the given ID sequence
   * (components not in the list keep their relative order at the end).
   * Used by the reflow tool; recorded in undo history like any mutation.
   */
  setComponentsOrder(orderedIds: string[], source: "ai" | "user" = "user"): boolean {
    const page = this.currentPage();
    if (!page) return false;
    const current = page.components;
    const byId = new Map(current.map((c) => [c.id, c]));
    const next: ComponentNode[] = [];
    for (const id of orderedIds) {
      const comp = byId.get(id);
      if (comp) next.push(comp);
    }
    const idSet = new Set(orderedIds);
    const remaining = current.filter((c) => !idSet.has(c.id));
    const newOrder = [...next, ...remaining];
    if (
      newOrder.length !== current.length ||
      newOrder.some((c, i) => c.id !== current[i].id)
    ) {
      page.components = newOrder;
      this.logActivity("reorder_page", "page", "Reflowed page to canonical section order", source);
      this.commit({ type: "reorderPage", ids: newOrder.map((c) => c.id) });
      return true;
    }
    return false;
  }

  private checkComponentDependency(type: string): { hasWarning: boolean; message: string } {
    const components = this.currentComponents();
    const hasType = (t: string) => components.some((c) => c.type === t);

    if (type === "footer" && !hasType("navbar")) {
      return { hasWarning: true, message: "添加 footer 时建议先添加 navbar" };
    }
    if (type === "card_grid" && !hasType("hero")) {
      return { hasWarning: true, message: "添加 card_grid 时建议先添加 hero 区域" };
    }
    if (type === "cta" && !hasType("hero") && !hasType("text_section")) {
      return { hasWarning: true, message: "添加 cta 时建议先添加 hero 或 text_section" };
    }
    return { hasWarning: false, message: "" };
  }

  // ===== Pages =====

  addPage(name: string, source: "ai" | "user" = "ai"): PageDef {
    const page: PageDef = {
      id: `page_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      components: [],
    };
    this.state.pages.push(page);
    this.state.currentPageId = page.id;
    this.logActivity("add_page", "page", `Added page "${name}"`, source);
    this.commit({ type: "addPage", page });
    return page;
  }

  switchPage(pageId: string, source: "ai" | "user" = "ai"): boolean {
    const page = this.state.pages.find((p) => p.id === pageId);
    if (!page) return false;
    if (this.state.currentPageId === pageId) return true;

    this.state.currentPageId = pageId;
    this.logActivity("switch_page", "page", `Switched to page "${page.name}"`, source);
    this.commit({ type: "switchPage", pageId });
    return true;
  }

  removePage(pageId: string, source: "ai" | "user" = "ai"): boolean {
    if (this.state.pages.length <= 1) return false;
    const idx = this.state.pages.findIndex((p) => p.id === pageId);
    if (idx === -1) return false;

    this.state.pages.splice(idx, 1);

    if (this.state.currentPageId === pageId) {
      const newPage = this.state.pages[0];
      this.state.currentPageId = newPage.id;
    }

    this.logActivity("remove_page", "page", `Removed page (${pageId})`, source);
    this.commit({ type: "removePage", pageId });
    return true;
  }

  renamePage(pageId: string, name: string, source: "ai" | "user" = "ai"): boolean {
    const page = this.state.pages.find((p) => p.id === pageId);
    if (!page) return false;

    page.name = name;
    this.logActivity("rename_page", "page", `Renamed page to "${name}"`, source);
    this.commit({ type: "renamePage", pageId, name });
    return true;
  }

  // ===== Platform Snapshots (C2) =====

  savePlatformSnapshot(platform: string, source: "ai" | "user" = "user"): PlatformSnapshot {
    const snapshot: PlatformSnapshot = {
      platform,
      savedAt: new Date().toISOString(),
      pages: JSON.parse(JSON.stringify(this.state.pages)),
      currentPageId: this.state.currentPageId,
    };
    this.state.platforms[platform] = snapshot;
    this.logActivity("save_platform", "platform", `Saved ${platform} platform design`, source);
    this.commit({ type: "savePlatform", platform, savedAt: snapshot.savedAt });
    return snapshot;
  }

  loadPlatformSnapshot(platform: string, source: "ai" | "user" = "user"): PlatformSnapshot {
    const snapshot = this.state.platforms[platform];
    if (!snapshot) {
      throw new Error(`No saved design for platform "${platform}". Call design_save_platform first.`);
    }
    const pages = JSON.parse(JSON.stringify(snapshot.pages)) as PageDef[];
    this.state.pages = pages;
    this.state.currentPageId = pages.some((p) => p.id === snapshot.currentPageId)
      ? snapshot.currentPageId
      : pages[0]?.id ?? null;
    this.logActivity("load_platform", "platform", `Restored ${platform} platform design`, source);
    this.commit({ type: "loadPlatform", platform });
    return snapshot;
  }

  listPlatformSnapshots(): Array<{ platform: string; savedAt: string; pageCount: number; componentCount: number }> {
    return Object.entries(this.state.platforms).map(([platform, s]) => ({
      platform,
      savedAt: s.savedAt,
      pageCount: s.pages.length,
      componentCount: s.pages.reduce((sum, p) => sum + p.components.length, 0),
    }));
  }

  // ===== Comments (C5) =====

  addComment(
    componentId: string,
    text: string,
    author: string = "user",
    source: "ai" | "user" = "user",
    options: { x?: number; y?: number; assignee?: string } = {}
  ): DesignComment {
    const node = this.findComponent(componentId);
    if (!node) {
      throw new Error(`Component not found: ${componentId}`);
    }
    const comment: DesignComment = {
      id: `cmt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      component_id: componentId,
      author,
      text,
      createdAt: new Date().toISOString(),
      ...(typeof options.x === "number" && Number.isFinite(options.x) ? { x: options.x } : {}),
      ...(typeof options.y === "number" && Number.isFinite(options.y) ? { y: options.y } : {}),
      ...(typeof options.assignee === "string" && options.assignee ? { assignee: options.assignee } : {}),
    };
    this.state.comments.push(comment);
    if (this.state.comments.length > 200) {
      this.state.comments = this.state.comments.slice(-200);
    }
    this.logActivity("add_comment", "comment", `Comment on ${node.type} (${componentId})`, source);
    this.commit({ type: "addComment", comment });
    return comment;
  }

  removeComment(commentId: string, source: "ai" | "user" = "user"): boolean {
    const idx = this.state.comments.findIndex((c) => c.id === commentId);
    if (idx === -1) return false;
    this.state.comments.splice(idx, 1);
    this.logActivity("remove_comment", "comment", `Removed comment ${commentId}`, source);
    this.commit({ type: "removeComment", commentId });
    return true;
  }

  /** M3 打点评论: 更新文本/解决状态/指派人/坐标（partial patch，入 undo 历史）。 */
  updateComment(
    commentId: string,
    patch: { text?: string; resolved?: boolean; assignee?: string | null; x?: number; y?: number },
    source: "ai" | "user" = "user"
  ): DesignComment | null {
    const c = this.state.comments.find((x) => x.id === commentId);
    if (!c) return null;
    if (typeof patch.text === "string" && patch.text.trim()) c.text = patch.text;
    if (typeof patch.resolved === "boolean") c.resolved = patch.resolved;
    if (patch.assignee === null) delete c.assignee;
    else if (typeof patch.assignee === "string" && patch.assignee) c.assignee = patch.assignee;
    if (typeof patch.x === "number" && Number.isFinite(patch.x)) c.x = patch.x;
    if (typeof patch.y === "number" && Number.isFinite(patch.y)) c.y = patch.y;
    c.updatedAt = new Date().toISOString();
    this.logActivity("update_comment", "comment", `Updated comment ${commentId}`, source);
    this.commit({ type: "updateComment", commentId });
    return c;
  }

  // ===== Action Flows (M3) =====

  addActionFlow(flow: ActionFlow, source: "ai" | "user" = "user"): ActionFlow {
    if (!this.findComponent(flow.componentId)) {
      throw new Error(`Component not found: ${flow.componentId}`);
    }
    if (!Array.isArray(flow.steps)) {
      throw new Error("steps must be an array");
    }
    for (const s of flow.steps) {
      if (!s || typeof s.id !== "string" || !isFlowActionType(String(s.action))) {
        throw new Error(`Invalid step action: ${String((s as { action?: unknown })?.action)}`);
      }
    }
    this.state.actionFlows[flow.id] = { ...flow };
    this.logActivity("add_action_flow", "action_flow", `Added flow ${flow.name} (${flow.id})`, source);
    this.commit({ type: "addActionFlow", flowId: flow.id });
    return flow;
  }

  updateActionFlow(
    id: string,
    patch: Partial<Pick<ActionFlow, "name" | "steps" | "enabled">>,
    source: "ai" | "user" = "user"
  ): ActionFlow | null {
    const flow = this.state.actionFlows[id];
    if (!flow) return null;
    if (typeof patch.name === "string" && patch.name.trim()) flow.name = patch.name;
    if (typeof patch.enabled === "boolean") flow.enabled = patch.enabled;
    if (Array.isArray(patch.steps)) {
      for (const s of patch.steps) {
        if (!s || typeof s.id !== "string" || !isFlowActionType(String(s.action))) {
          throw new Error(`Invalid step action: ${String((s as { action?: unknown })?.action)}`);
        }
      }
      flow.steps = patch.steps;
    }
    this.logActivity("update_action_flow", "action_flow", `Updated flow ${id}`, source);
    this.commit({ type: "updateActionFlow", flowId: id });
    return flow;
  }

  removeActionFlow(id: string, source: "ai" | "user" = "user"): boolean {
    if (!this.state.actionFlows[id]) return false;
    delete this.state.actionFlows[id];
    this.logActivity("remove_action_flow", "action_flow", `Removed flow ${id}`, source);
    this.commit({ type: "removeActionFlow", flowId: id });
    return true;
  }

  getActionFlows(componentId?: string): ActionFlow[] {
    const all = Object.values(this.state.actionFlows);
    return componentId ? all.filter((f) => f.componentId === componentId) : all;
  }

  // ===== Page Links (Play Mode) =====

  addPageLink(
    fromPageId: string,
    toPageId: string,
    label?: string,
    sourceComponentId?: string,
    source: "ai" | "user" = "user",
    transition?: string
  ): PageLink {
    const fromPage = this.state.pages.find((p) => p.id === fromPageId);
    if (!fromPage) throw new Error(`Source page must exist: ${fromPageId}`);
    const toPage = this.state.pages.find((p) => p.id === toPageId);
    if (!toPage) throw new Error(`Target page must exist: ${toPageId}`);
    if (transition !== undefined && (typeof transition !== "string" || !isPageLinkTransition(transition))) {
      throw new Error(`Invalid transition: ${String(transition)}`);
    }

    // One link per source component: re-linking replaces the old link.
    if (sourceComponentId) {
      const existing = this.state.pageLinks.findIndex(
        (l) => l.source_component_id === sourceComponentId
      );
      if (existing !== -1) {
        this.state.pageLinks.splice(existing, 1);
        this.logActivity(
          "replace_page_link",
          "page_link",
          `Replaced link for ${sourceComponentId}: ${fromPage.name} → ${toPage.name}`,
          source
        );
      }
    }

    const link: PageLink = {
      id: `link_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      from_page_id: fromPageId,
      to_page_id: toPageId,
      transition: transition ?? "fade",
    };
    if (label) link.label = label;
    if (sourceComponentId) link.source_component_id = sourceComponentId;
    this.state.pageLinks.push(link);
    if (this.state.pageLinks.length > 500) {
      this.state.pageLinks = this.state.pageLinks.slice(-500);
    }
    this.logActivity(
      "add_page_link",
      "page_link",
      `Linked ${fromPage.name} → ${toPage.name}`,
      source
    );
    this.commit({ type: "addPageLink", link });
    return link;
  }

  /** M4 转场: 更新连线的转场类型/标签（partial patch，入 undo 历史）。 */
  updatePageLink(
    linkId: string,
    patch: { label?: string; transition?: string },
    source: "ai" | "user" = "user"
  ): PageLink | null {
    const link = this.state.pageLinks.find((l) => l.id === linkId);
    if (!link) return null;
    if (patch.transition !== undefined) {
      if (typeof patch.transition !== "string" || !isPageLinkTransition(patch.transition)) {
        throw new Error(`Invalid transition: ${String(patch.transition)}`);
      }
      link.transition = patch.transition;
    }
    if (typeof patch.label === "string" && patch.label.trim()) link.label = patch.label;
    this.logActivity("update_page_link", "page_link", `Updated page link ${linkId}`, source);
    this.commit({ type: "updatePageLink", linkId });
    return link;
  }

  removePageLink(linkId: string, source: "ai" | "user" = "user"): boolean {
    const idx = this.state.pageLinks.findIndex((l) => l.id === linkId);
    if (idx === -1) return false;
    this.state.pageLinks.splice(idx, 1);
    this.logActivity("remove_page_link", "page_link", `Removed page link ${linkId}`, source);
    this.commit({ type: "removePageLink", linkId });
    return true;
  }

  // ===== Page Constraints (R1 M2 修正记忆) =====

  /** 每页约束上限（防止无限堆积）。 */
  static readonly MAX_PAGE_CONSTRAINTS = 20;

  /**
   * R1 M2: 把当前组件的布局记为所在页面的约束（按 component_type 生效）。
   * 组件无 layout 时不记（返回 null）；同一组件重复记 → 替换旧约束；
   * 超上限时淘汰最早的约束。
   */
  addPageConstraint(componentId: string, source: "ai" | "user" = "user"): PageConstraint | null {
    const state = this.state;
    for (const page of state.pages) {
      const find = (nodes: ComponentNode[]): ComponentNode | null => {
        for (const n of nodes) {
          if (n.id === componentId) return n;
          const found = find(n.children || []);
          if (found) return found;
        }
        return null;
      };
      const comp = find(page.components);
      if (!comp) continue;
      if (!comp.layout) return null; // 无布局（流式子项）不能记约束
      if (!page.constraints) page.constraints = [];
      // 同一组件重复记 → 替换
      const dupIdx = page.constraints.findIndex((c) => c.source_component_id === componentId);
      if (dupIdx !== -1) page.constraints.splice(dupIdx, 1);
      const constraint: PageConstraint = {
        id: `pc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        component_type: comp.type,
        layout: { ...comp.layout },
        source_component_id: componentId,
      };
      page.constraints.push(constraint);
      while (page.constraints.length > DesignStateStore.MAX_PAGE_CONSTRAINTS) {
        page.constraints.shift();
      }
      this.logActivity(
        "add_page_constraint",
        "page_constraint",
        `Locked ${comp.type} at ${Math.round(comp.layout.x)},${Math.round(comp.layout.y)} (${Math.round(comp.layout.w)}×${Math.round(comp.layout.h)})`,
        source
      );
      this.commit({ type: "addPageConstraint", constraint });
      return constraint;
    }
    return null;
  }

  removePageConstraint(constraintId: string, source: "ai" | "user" = "user"): boolean {
    for (const page of this.state.pages) {
      const idx = (page.constraints || []).findIndex((c) => c.id === constraintId);
      if (idx === -1) continue;
      page.constraints!.splice(idx, 1);
      this.logActivity("remove_page_constraint", "page_constraint", `Removed page constraint ${constraintId}`, source);
      this.commit({ type: "removePageConstraint", constraintId });
      return true;
    }
    return false;
  }

  // ===== Clear All =====

  clearAll(source: "ai" | "user" = "ai"): void {
    this.state.tokens = {
      colors: {},
      typography: {},
      spacing: {},
      shadows: {},
      radii: {},
      transitions: {},
    };
    this.state.activityLog = [];

    const defaultPage: PageDef = {
      id: `page_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: "Home",
      components: [],
    };
    this.state.pages = [defaultPage];
    this.state.currentPageId = defaultPage.id;
    this.state.themeMode = "light";
    this.state.imports = {};
    this.state.scroll = undefined;
    this.state.vantaBackgrounds = undefined;
    this.state.reactBits = undefined;
    this.state.exportRuntime = "standard";
    this.state.pageBackground = undefined;

    this.logActivity("clear_all", "system", "Cleared all design state", source);
    this.commit({ type: "clearAll" });
  }

  // ===== Snapshot Restore (persistence) =====

  /**
   * Replace the current state with a previously saved snapshot (from
   * `getState()` or a `.prism.json` project file). Undo/redo history is
   * reset so the restore itself becomes the new baseline.
   */
  restoreSnapshot(snapshot: Partial<DesignState>): void {
    const pages =
      Array.isArray(snapshot.pages) && snapshot.pages.length > 0
        ? snapshot.pages
        : [this.makeDefaultPage()];

    const currentPageId =
      typeof snapshot.currentPageId === "string" &&
      pages.some((p) => p.id === snapshot.currentPageId)
        ? snapshot.currentPageId
        : pages[0].id;

    const tokens: DesignTokens = snapshot.tokens || {
      colors: {},
      typography: {},
      spacing: {},
      shadows: {},
      radii: {},
      transitions: {},
    };
    this.state = {
      projectName:
        typeof snapshot.projectName === "string" ? snapshot.projectName : "Untitled Project",
      style: typeof snapshot.style === "string" ? snapshot.style : "minimal",
      tokens: {
        colors: tokens.colors || {},
        typography: tokens.typography || {},
        spacing: tokens.spacing || {},
        shadows: tokens.shadows || {},
        radii: tokens.radii || {},
        transitions: tokens.transitions || {},
      },
      activityLog: Array.isArray(snapshot.activityLog)
        ? snapshot.activityLog.slice(0, 100)
        : [],
      pages,
      currentPageId,
      themeMode: snapshot.themeMode === "dark" ? "dark" : "light",
      activePlatform:
        typeof snapshot.activePlatform === "string" ? snapshot.activePlatform : "web-desktop",
      platforms: snapshot.platforms && typeof snapshot.platforms === "object" ? snapshot.platforms : {},
      comments: Array.isArray(snapshot.comments) ? snapshot.comments.slice(0, 200) : [],
      actionFlows:
        snapshot.actionFlows && typeof snapshot.actionFlows === "object"
          ? JSON.parse(JSON.stringify(snapshot.actionFlows))
          : {},
      pageLinks: Array.isArray(snapshot.pageLinks) ? snapshot.pageLinks.slice(0, 500) : [],
      revision: typeof snapshot.revision === "number" ? snapshot.revision : 0,
      imports:
        snapshot.imports && typeof snapshot.imports === "object"
          ? JSON.parse(JSON.stringify(snapshot.imports))
          : {},
      scroll: snapshot.scroll && typeof snapshot.scroll === "object"
        ? JSON.parse(JSON.stringify(snapshot.scroll))
        : undefined,
      vantaBackgrounds: snapshot.vantaBackgrounds && typeof snapshot.vantaBackgrounds === "object"
        ? JSON.parse(JSON.stringify(snapshot.vantaBackgrounds))
        : undefined,
      reactBits: snapshot.reactBits && typeof snapshot.reactBits === "object"
        ? JSON.parse(JSON.stringify(snapshot.reactBits))
        : undefined,
      exportRuntime:
        snapshot.exportRuntime === "minimal" || snapshot.exportRuntime === "full"
          ? snapshot.exportRuntime
          : "standard",
      pageBackground:
        snapshot.pageBackground && typeof snapshot.pageBackground === "object"
          ? JSON.parse(JSON.stringify(snapshot.pageBackground))
          : undefined,
    };

    // Reset undo/redo history and pending prompt to the restored baseline.
    this.history = [JSON.parse(JSON.stringify(this.state))];
    this.historyIndex = 0;
    this.pendingPrompt = null;

    // Record the load in the activity log (does not become part of history).
    this.logActivity(
      "load_project",
      "project",
      `Loaded project "${this.state.projectName}"`,
      "user"
    );
    // Re-baseline history AFTER the activity entry so undo starts fresh.
    this.history = [JSON.parse(JSON.stringify(this.state))];
    this.historyIndex = 0;
    this.emit("change", { type: "loadProject", project_name: this.state.projectName });
  }

  private makeDefaultPage(): PageDef {
    return {
      id: `page_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: "Home",
      components: [],
    };
  }

  // ===== Test Support =====

  /**
   * Reset the singleton to its initial empty state (state, undo/redo history,
   * and pending prompt). Intended for unit tests only; it is not part of the
   * MCP tool surface.
   */
  resetForTests(): void {
    const defaultPage = this.makeDefaultPage();
    this.state = {
      projectName: "Untitled Project",
      style: "minimal",
      tokens: {
        colors: {},
        typography: {},
        spacing: {},
        shadows: {},
        radii: {},
        transitions: {},
      },
      activityLog: [],
      pages: [defaultPage],
      currentPageId: defaultPage.id,
      themeMode: "light",
      activePlatform: "web-desktop",
      platforms: {},
      comments: [],
      actionFlows: {},
      pageLinks: [],
      revision: 0,
      imports: {},
      scroll: undefined,
      vantaBackgrounds: undefined,
      reactBits: undefined,
      exportRuntime: "standard",
      pageBackground: undefined,
    };
    this.history = [JSON.parse(JSON.stringify(this.state))];
    this.historyIndex = 0;
    this.pendingPrompt = null;
  }

  // ===== Pending Prompt (AI communication channel) =====

  setPendingPrompt(prompt: string): void {
    this.pendingPrompt = prompt;
  }

  /** Record a user prompt in the activity log (does not mutate design state). */
  recordPrompt(prompt: string): void {
    this.logActivity("user_prompt", "prompt", prompt, "user");
  }

  getPendingPrompt(): string | null {
    return this.pendingPrompt;
  }

  clearPendingPrompt(): void {
    this.pendingPrompt = null;
  }

  /**
   * Consume the pending prompt (called when the agent polls via
   * `design_check_prompts`) and emit an event so the server can broadcast
   * an "accepted" acknowledgment back to the dashboard.
   */
  consumePendingPrompt(): string | null {
    const prompt = this.pendingPrompt;
    if (!prompt) return null;
    this.pendingPrompt = null;
    this.emit("prompt_accepted", prompt);
    return prompt;
  }

  /** Log that the agent accepted a user prompt (does not mutate design). */
  recordPromptAccepted(prompt: string): void {
    this.logActivity("prompt_accepted", "prompt", `Agent accepted prompt: ${prompt}`, "ai");
  }

  /**
   * Log that the built-in executor handled a prompt and emit an event so
   * the server can broadcast the result back to the dashboard.
   */
  recordPromptExecuted(summary: string, action = "prompt_executed"): void {
    this.logActivity("prompt_executed", "prompt", summary, "user");
    this.emit("prompt_executed", { summary, action });
  }

  /**
   * Replace a page's component tree (used by "apply canvas to preview").
   * Recorded in undo history like any other mutation.
   */
  replacePageComponents(
    pageId: string,
    components: ComponentNode[],
    source: "ai" | "user" = "user"
  ): boolean {
    const page = this.state.pages.find((p) => p.id === pageId);
    if (!page) return false;
    page.components = components;
    this.logActivity(
      "replace_components",
      "canvas",
      `Applied canvas: ${components.length} components on page ${pageId}`,
      source
    );
    this.commit({ type: "replaceComponents", pageId, count: components.length });
    return true;
  }

  // ===== Private Helpers =====

  private findComponent(id: string): ComponentNode | null {
    const search = (nodes: ComponentNode[]): ComponentNode | null => {
      for (const node of nodes) {
        if (node.id === id) return node;
        const found = search(node.children);
        if (found) return found;
      }
      return null;
    };
    return search(this.currentComponents());
  }

  private removeFromTree(nodes: ComponentNode[], id: string): boolean {
    const idx = nodes.findIndex((n) => n.id === id);
    if (idx >= 0) {
      nodes.splice(idx, 1);
      return true;
    }
    for (const node of nodes) {
      if (this.removeFromTree(node.children, id)) return true;
    }
    return false;
  }

  private logActivity(
    action: string,
    tool: string,
    detail: string,
    source: "ai" | "user"
  ): void {
    const entry: ActivityLogEntry = {
      timestamp: new Date().toISOString(),
      action,
      tool,
      detail,
      source,
    };
    this.state.activityLog.unshift(entry);
    if (this.state.activityLog.length > 100) {
      this.state.activityLog = this.state.activityLog.slice(0, 100);
    }
    this.emit("activity", entry);
  }
}

export const stateStore = DesignStateStore.getInstance();

// ===== 项目分桶 (Phase 2.3): per-project isolated stores =====

/**
 * Per-project design stores. The default `stateStore` singleton remains the
 * store for the legacy single-project flow; `getProjectStore(projectId)`
 * returns (or lazily creates) an isolated store for a named project so
 * multiple windows/projects can be edited independently without stomping on
 * each other's state or undo history.
 */
const projectStores = new Map<string, DesignStateStore>();

/** The store for a given project (lazily created). */
export function getProjectStore(projectId: string): DesignStateStore {
  let store = projectStores.get(projectId);
  if (!store) {
    store = new DesignStateStore();
    projectStores.set(projectId, store);
  }
  return store;
}

/** True when a project store already exists (avoids accidental creation). */
export function hasProjectStore(projectId: string): boolean {
  return projectStores.has(projectId);
}

/** Remove and drop a project store (frees its state + history). */
export function removeProjectStore(projectId: string): boolean {
  return projectStores.delete(projectId);
}

/** List project ids that currently have isolated stores. */
export function listProjectStores(): string[] {
  return [...projectStores.keys()];
}
