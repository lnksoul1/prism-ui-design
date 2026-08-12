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
}

export interface AnimationDef {
  entry?: string;
  exit?: string;
  hover?: string;
  duration?: number;
  delay?: number;
  curve?: string;
  stagger?: number;
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

// ===== State Store (Singleton) =====

class DesignStateStore extends EventEmitter {
  private state: DesignState;
  private static instance: DesignStateStore;

  // Undo/Redo history (post-mutation snapshots)
  private history: DesignState[];
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
      components: defaultPage.components,
      activityLog: [],
      pages: [defaultPage],
      currentPageId: defaultPage.id,
      themeMode: "light",
      activePlatform: "web-desktop",
      platforms: {},
      comments: [],
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
    this.fixComponentsReference();
    this.logActivity("undo", "system", "Undo", "user");
    this.emit("change", { type: "undo" });
    return true;
  }

  redo(): boolean {
    if (!this.canRedo()) return false;
    this.historyIndex++;
    const snapshot = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
    this.state = snapshot;
    this.fixComponentsReference();
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

  // After restoring from history, fix components to point to current page's array
  private fixComponentsReference(): void {
    const page = this.state.pages.find((p) => p.id === this.state.currentPageId);
    if (page) {
      this.state.components = page.components;
    } else if (this.state.pages.length > 0) {
      this.state.currentPageId = this.state.pages[0].id;
      this.state.components = this.state.pages[0].components;
    }
  }

  // ===== State Access =====

  getState(): DesignState {
    const copy = JSON.parse(JSON.stringify(this.state)) as DesignState;
    // Expose undo/redo capability so the client dashboard can enable/disable
    // the undo/redo buttons (see improvement plan A4 / defect C1).
    copy.canUndo = this.canUndo();
    copy.canRedo = this.canRedo();
    return copy;
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
      this.state.components.push(node);
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
    const removed = this.removeFromTree(this.state.components, id);
    if (!removed) return false;
    this.logActivity("remove_component", "component", `Removed component (${id})`, source);
    this.commit({ type: "removeComponent", id });
    return true;
  }

  setAnimation(
    componentId: string,
    animation: AnimationDef,
    source: "ai" | "user" = "ai"
  ): boolean {
    const node = this.findComponent(componentId);
    if (!node) return false;
    node.animation = { ...node.animation, ...animation };
    this.logActivity("set_animation", node.type, `Set animation for ${node.type} (${componentId})`, source);
    this.commit({ type: "setAnimation", componentId, animation: node.animation });
    return true;
  }

  reorderComponent(
    fromId: string,
    toId: string,
    position: "before" | "after",
    source: "ai" | "user" = "ai"
  ): boolean {
    const components = this.state.components;
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
   * Replace the current page's component order with the given ID sequence
   * (components not in the list keep their relative order at the end).
   * Used by the reflow tool; recorded in undo history like any mutation.
   */
  setComponentsOrder(orderedIds: string[], source: "ai" | "user" = "user"): boolean {
    const byId = new Map(this.state.components.map((c) => [c.id, c]));
    const next: ComponentNode[] = [];
    for (const id of orderedIds) {
      const comp = byId.get(id);
      if (comp) next.push(comp);
    }
    const idSet = new Set(orderedIds);
    const remaining = this.state.components.filter((c) => !idSet.has(c.id));
    const newOrder = [...next, ...remaining];
    if (
      newOrder.length !== this.state.components.length ||
      newOrder.some((c, i) => c.id !== this.state.components[i].id)
    ) {
      this.state.components = newOrder;
      this.logActivity("reorder_page", "page", "Reflowed page to canonical section order", source);
      this.commit({ type: "reorderPage", ids: newOrder.map((c) => c.id) });
      return true;
    }
    return false;
  }

  private checkComponentDependency(type: string): { hasWarning: boolean; message: string } {
    const components = this.state.components;
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
    this.state.components = page.components;
    this.logActivity("add_page", "page", `Added page "${name}"`, source);
    this.commit({ type: "addPage", page });
    return page;
  }

  switchPage(pageId: string, source: "ai" | "user" = "ai"): boolean {
    const page = this.state.pages.find((p) => p.id === pageId);
    if (!page) return false;
    if (this.state.currentPageId === pageId) return true;

    this.state.currentPageId = pageId;
    this.state.components = page.components;
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
      this.state.components = newPage.components;
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
    this.fixComponentsReference();
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
    this.state.components = defaultPage.components;
    this.state.themeMode = "light";

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
      components: [],
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
    };
    this.fixComponentsReference();

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
      components: defaultPage.components,
      activityLog: [],
      pages: [defaultPage],
      currentPageId: defaultPage.id,
      themeMode: "light",
      activePlatform: "web-desktop",
      platforms: {},
      comments: [],
    };
    this.history = [JSON.parse(JSON.stringify(this.state))];
    this.historyIndex = 0;
    this.pendingPrompt = null;
  }

  // ===== Pending Prompt (AI communication channel) =====

  setPendingPrompt(prompt: string): void {
    this.pendingPrompt = prompt;
  }

  getPendingPrompt(): string | null {
    return this.pendingPrompt;
  }

  clearPendingPrompt(): void {
    this.pendingPrompt = null;
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
    return search(this.state.components);
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
