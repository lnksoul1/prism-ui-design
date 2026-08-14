import { EventEmitter } from "events";
import { getContrastRatio } from "./utils/color.js";

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
  props: Record<string, unknown>;
  layout?: ComponentLayout;
  visible?: boolean;
  locked?: boolean;
  children: ComponentNode[];
  animation?: AnimationDef;
  /** Product definition v2 — 行为模型: any component can carry an interaction. */
  behavior?: ComponentBehavior;
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
  kind: "url" | "html" | "file";
  /** Display name: hostname / "Pasted HTML" / file name. */
  source: string;
  url?: string;
  /** Saved original HTML under the project dir (imports/<pageId>.html). */
  html_file: string;
  imported_at: string;
  component_count: number;
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
  pageLinks: PageLink[];
  revision: number;
  /** tldraw canvas snapshots keyed by page id (方案A canvas-first editing). */
  canvasDocs: Record<string, unknown>;
  /** AI draw commands waiting to be applied to each page's canvas. */
  canvasDraws: Record<string, CanvasDraw[]>;
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
}

/** Play-mode navigation: clicking a component on one page jumps to another. */
export interface PageLink {
  id: string;
  from_page_id: string;
  to_page_id: string;
  label?: string;
  /** Optional component whose click triggers the navigation. */
  source_component_id?: string;
}

/** A simple drawing command queued by the AI (`design_draw_canvas`). */
export interface CanvasDraw {
  id: string;
  type: "rect" | "text" | "arrow" | "image" | "prism";
  x: number;
  y: number;
  w?: number;
  h?: number;
  label?: string;
  src?: string;
  color?: string;
  kind?: string;
  createdAt: string;
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
  pageLinks: PageLink[];
  revision: number;
  /** tldraw canvas snapshots keyed by page id (方案A canvas-first editing). */
  canvasDocs: Record<string, unknown>;
  /** AI draw commands waiting to be applied to each page's canvas. */
  canvasDraws: Record<string, CanvasDraw[]>;
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
};

class DesignStateStore extends EventEmitter {
  private state: StoredState;
  private static instance: DesignStateStore;

  // Undo/Redo history (post-mutation snapshots)
  private history: StoredState[];
  private historyIndex: number;
  private maxHistory: number = 50;

  // Pending user prompt (from client dashboard)
  private pendingPrompt: string | null;

  private constructor() {
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
      pageLinks: [],
      revision: 0,
      canvasDocs: {},
      canvasDraws: {},
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
   * Save post-mutation state to history and emit change event.
   * Called at the end of every mutating method.
   */
  private commit(change: unknown): void {
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
        apply((b) => ({ x: minX }));
        break;
      case "center_x":
        apply((b) => ({ x: (minX + maxX) / 2 - b.w / 2 }));
        break;
      case "right":
        apply((b) => ({ x: maxX - b.w }));
        break;
      case "top":
        apply((b) => ({ y: minY }));
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
    delete this.state.canvasDocs[pageId];

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

  addComment(componentId: string, text: string, author: string = "user", source: "ai" | "user" = "user"): DesignComment {
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

  // ===== Page Links (Play Mode) =====

  addPageLink(
    fromPageId: string,
    toPageId: string,
    label?: string,
    sourceComponentId?: string,
    source: "ai" | "user" = "user"
  ): PageLink {
    const fromPage = this.state.pages.find((p) => p.id === fromPageId);
    if (!fromPage) throw new Error(`Source page must exist: ${fromPageId}`);
    const toPage = this.state.pages.find((p) => p.id === toPageId);
    if (!toPage) throw new Error(`Target page must exist: ${toPageId}`);

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

  removePageLink(linkId: string, source: "ai" | "user" = "user"): boolean {
    const idx = this.state.pageLinks.findIndex((l) => l.id === linkId);
    if (idx === -1) return false;
    this.state.pageLinks.splice(idx, 1);
    this.logActivity("remove_page_link", "page_link", `Removed page link ${linkId}`, source);
    this.commit({ type: "removePageLink", linkId });
    return true;
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
    this.state.canvasDocs = {};
    this.state.canvasDraws = {};
    this.state.imports = {};
    this.state.scroll = undefined;
    this.state.vantaBackgrounds = undefined;
    this.state.reactBits = undefined;
    this.state.exportRuntime = "standard";

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
      pageLinks: Array.isArray(snapshot.pageLinks) ? snapshot.pageLinks.slice(0, 500) : [],
      revision: typeof snapshot.revision === "number" ? snapshot.revision : 0,
      canvasDocs:
        snapshot.canvasDocs && typeof snapshot.canvasDocs === "object"
          ? JSON.parse(JSON.stringify(snapshot.canvasDocs))
          : {},
      canvasDraws:
        snapshot.canvasDraws && typeof snapshot.canvasDraws === "object"
          ? JSON.parse(JSON.stringify(snapshot.canvasDraws))
          : {},
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
      pageLinks: [],
      revision: 0,
      canvasDocs: {},
      canvasDraws: {},
      imports: {},
      scroll: undefined,
      vantaBackgrounds: undefined,
      reactBits: undefined,
      exportRuntime: "standard",
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

  // ===== Canvas Documents (方案A canvas-first editing) =====

  /** Save a tldraw snapshot for a page. Stored opaquely as JSON. */
  saveCanvasDoc(pageId: string, doc: unknown, source: "ai" | "user" = "user"): void {
    this.state.canvasDocs[pageId] = JSON.parse(JSON.stringify(doc ?? null));
    this.logActivity("save_canvas", "canvas", `Saved canvas for page ${pageId}`, source);
    this.commit({ type: "canvasSave", pageId });
  }

  /** Return a deep copy of the canvas doc for a page (defaults to current). */
  getCanvasDoc(pageId?: string | null): unknown | null {
    const pid = pageId || this.state.currentPageId;
    if (!pid) return null;
    const doc = this.state.canvasDocs[pid];
    return doc ? JSON.parse(JSON.stringify(doc)) : null;
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

  /**
   * Queue AI draw commands for a page (defaults to the current page). The
   * browser canvas applies them on next load or via live WS broadcast.
   */
  addCanvasDraws(
    draws: Array<Partial<CanvasDraw>>,
    pageId?: string | null,
    source: "ai" | "user" = "ai"
  ): CanvasDraw[] {
    const pid = pageId || this.state.currentPageId;
    if (!pid || !Array.isArray(draws) || draws.length === 0) return [];
    const now = new Date().toISOString();
    const normalized: CanvasDraw[] = draws
      .filter((d) => d && typeof d.type === "string")
      .map((d) => ({
        id: d.id || `draw_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type: (d.type as CanvasDraw["type"]) || "rect",
        x: typeof d.x === "number" ? d.x : 0,
        y: typeof d.y === "number" ? d.y : 0,
        w: typeof d.w === "number" ? d.w : undefined,
        h: typeof d.h === "number" ? d.h : undefined,
        label: typeof d.label === "string" ? d.label : undefined,
        src: typeof d.src === "string" ? d.src : undefined,
        color: typeof d.color === "string" ? d.color : undefined,
        kind: typeof d.kind === "string" ? d.kind : undefined,
        createdAt: d.createdAt || now,
      }));
    if (normalized.length === 0) return [];
    this.state.canvasDraws[pid] = [...(this.state.canvasDraws[pid] || []), ...normalized];
    this.logActivity("canvas_draw", "canvas", `Queued ${normalized.length} AI draw commands`, source);
    this.commit({ type: "canvasDraw", pageId: pid, count: normalized.length });
    return normalized;
  }

  /** Return queued draw commands for a page (defaults to current). */
  getCanvasDraws(pageId?: string | null): CanvasDraw[] {
    const pid = pageId || this.state.currentPageId;
    if (!pid) return [];
    return JSON.parse(JSON.stringify(this.state.canvasDraws[pid] || [])) as CanvasDraw[];
  }

  /** Clear the draw queue for a page (after the client applied them). */
  clearCanvasDraws(pageId?: string | null, source: "ai" | "user" = "user"): boolean {
    const pid = pageId || this.state.currentPageId;
    if (!pid || !this.state.canvasDraws[pid]) return false;
    const count = this.state.canvasDraws[pid].length;
    delete this.state.canvasDraws[pid];
    this.logActivity("canvas_draws_cleared", "canvas", `Cleared ${count} draw commands`, source);
    this.commit({ type: "canvasDrawsCleared", pageId: pid, count });
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
