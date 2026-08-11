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
    return JSON.parse(JSON.stringify(this.state));
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

  // ===== Tokens =====

  setToken(
    category: keyof DesignTokens,
    key: string,
    value: string,
    source: "ai" | "user" = "ai",
    description?: string
  ): void {
    this.state.tokens[category][key] = { value, source, description };
    this.logActivity("set_token", `${category}.${key}`, `${category}.${key} = ${value}`, source);

    // Check for token conflicts
    const conflict = this.checkTokenConflict(category as string, key, value);
    if (conflict.hasConflict) {
      this.logActivity("token_conflict", `${category}.${key}`, conflict.message, source);
    }

    this.commit({ type: "token", category, key, value });
  }

  setTokenBatch(
    category: keyof DesignTokens,
    tokens: Record<string, string>,
    source: "ai" | "user" = "ai"
  ): void {
    Object.entries(tokens).forEach(([key, value]) => {
      this.state.tokens[category][key] = { value, source };
    });
    this.logActivity("set_token_batch", category, `Updated ${Object.keys(tokens).length} ${category} tokens`, source);
    this.commit({ type: "tokenBatch", category, tokens });
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
    source: "ai" | "user" = "ai"
  ): boolean {
    const node = this.findComponent(id);
    if (!node) return false;
    node.props = { ...node.props, ...props };
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
