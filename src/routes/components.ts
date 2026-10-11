import express from "express";
import { stateStore, isPageLinkTransition, type ComponentNode } from "../state.js";
import { isBreakpoint } from "../responsive.js";
import * as designService from "../service/design-service.js";
import { exportComponentCode } from "../tools/design-tools.js";
import { asyncHandler, HttpError } from "./shared.js";

// Inspect — export a single component as code (HTML / React / CSS)
function findComponentInState(id: string): ComponentNode | null {
  const state = stateStore.getState();
  const search = (list: ComponentNode[]): ComponentNode | null => {
    for (const c of list) {
      if (c.id === id) return c;
      const found = search(c.children || []);
      if (found) return found;
    }
    return null;
  };
  for (const page of state.pages) {
    const found = search(page.components);
    if (found) return found;
  }
  return null;
}

// V2.0 多断点编辑 — style payloads are CSS property → string value maps.
// Reject non-string values and values over 200 characters so arbitrary
// garbage never enters the baseStyle/breakpointOverrides diff model.
function assertStyleObject(style: unknown): Record<string, string> {
  if (!style || typeof style !== "object" || Array.isArray(style)) {
    throw new HttpError(400, "style object is required");
  }
  for (const [key, value] of Object.entries(style)) {
    if (typeof value !== "string") {
      throw new HttpError(400, `style.${key} must be a string`);
    }
    if (value.length > 200) {
      throw new HttpError(400, `style.${key} must be at most 200 characters`);
    }
  }
  return style as Record<string, string>;
}

// Component / page / undo-redo / comment / page-link routes
export function registerComponentsRoutes(): express.Router {
  const router = express.Router();

  // API: Reorder component (from client drag-and-drop)
  // NOTE: Must be defined before /api/component/:id to avoid route conflict
  router.post("/api/component/reorder", asyncHandler(async (req, res) => {
    const { from_id, to_id, position } = req.body;
    if (!from_id || !to_id || !position) {
      throw new HttpError(400, "Missing from_id, to_id, or position");
    }
    const success = designService.reorderComponent(from_id, to_id, position, "user");
    res.json({ success });
  }));

  // API: Inspect — export a single component as code (HTML / React / CSS)
  router.get("/api/component/:id/code", asyncHandler(async (req, res) => {
    const format = typeof req.query.format === "string" ? req.query.format : "html";
    if (!["html", "react", "css"].includes(format)) {
      throw new HttpError(400, "Invalid format. Must be 'html', 'react', or 'css'");
    }
    const comp = findComponentInState(req.params.id);
    if (!comp) {
      throw new HttpError(404, `Component ${req.params.id} not found`);
    }
    const code = exportComponentCode(comp, format, stateStore.getState().tokens);
    res.json({ success: true, id: comp.id, type: comp.type, format, code });
  }));
    /*
  // API: Export a library component as code (uses its default props)
  router.post("/api/library-code", asyncHandler(async (req, res) => {
    const { type, variant, props, format } = req.body || {};
    if (!type || typeof type !== "string" || !designService.isKnownComponentType(type)) {
      throw new HttpError(400, "Missing or unknown component type");
    }
    const fmt = typeof format === "string" && ["html", "react", "css"].includes(format) ? format : "html";
    const node: ComponentNode = {
      id: `lib_${type}`,
      type,
      variant: typeof variant === "string" && variant ? variant : undefined,
      props: props && typeof props === "object" ? props : {},
      children: [],
    };
    const code = exportComponentCode(node, fmt, stateStore.getState().tokens);
    res.json({ success: true, type, format: fmt, code });
  }));
    */

  // API: Update component (from client inline edit / layout nudge)
  router.post("/api/component/:id", asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { props, layout, visible, locked } = req.body || {};
    const success = designService.updateComponent(
      id,
      props && typeof props === "object" ? props : {},
      "user",
      layout && typeof layout === "object" ? layout : undefined,
      { visible, locked }
    );
    res.json({ success });
  }));

  // API: Rename a component's layer (精确编辑 P0 图层重命名)
  router.put("/api/component/:id/name", asyncHandler(async (req, res) => {
    const { id } = req.params;
    const name = (req.body || {}).name;
    if (typeof name !== "string") {
      throw new HttpError(400, "name (string) is required; empty string reverts to the type default");
    }
    const ok = designService.renameComponent(id, name, "user");
    if (!ok) {
      throw new HttpError(404, `Component ${id} not found`);
    }
    res.json({ success: true, id, name: name.trim() });
  }));

  // API: Replace a component's definition in place (模板快速变更 P0 组件模板,
  // raw palette path): swaps type/variant/props, keeps id + layout position.
  router.put("/api/component/:id/replace", asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { type, variant, props, behavior, animation } = req.body || {};
    if (typeof type !== "string" || !type || !designService.isKnownComponentType(type)) {
      throw new HttpError(400, "A known component type is required");
    }
    const ok = stateStore.replaceComponent(
      id,
      {
        type,
        variant: typeof variant === "string" && variant ? variant : undefined,
        props: props && typeof props === "object" ? props : {},
        behavior: behavior === undefined ? null : (behavior as never),
        animation: animation === undefined ? null : (animation as never),
      },
      "user"
    );
    if (!ok) {
      throw new HttpError(404, `Component ${id} not found`);
    }
    res.json({ success: true, id, type });
  }));

  // API: Remove component (from client)
  router.delete("/api/component/:id", asyncHandler(async (req, res) => {
    const { id } = req.params;
    const success = designService.removeComponent(id, "user");
    res.json({ success });
  }));

  // API: Duplicate a component (from client selection toolbar / Ctrl+D)
  router.post("/api/component/:id/duplicate", asyncHandler(async (req, res) => {
    const { id } = req.params;
    const copy = designService.duplicateComponent(id, "user");
    if (!copy) {
      throw new HttpError(404, `Component ${id} not found`);
    }
    res.json({ success: true, id: copy.id, type: copy.type });
  }));
  // API: Bind or clear an interaction behavior on a component (行为模型 P1)
  router.put("/api/component/:id/behavior", asyncHandler(async (req, res) => {
    const { id } = req.params;
    const behavior = (req.body || {}).behavior;
    if (behavior !== null && (typeof behavior !== "object" || typeof behavior.type !== "string")) {
      throw new HttpError(400, "behavior must be an object with a type, or null");
    }
    const ok = designService.setBehavior(id, (behavior as never) || null, "user");
    if (!ok) {
      throw new HttpError(404, `Component ${id} not found`);
    }
    res.json({ success: true, id, behavior: behavior || null });
  }));

  // API: Set or clear element-level metadata (元素级编辑 P1): bind an
  // interaction to an inner element (by its prop path), promote its type
  // (text → button / link), and/or set element-level CSS overrides
  // (width / fontSize / color …). Pass behavior/kind/css as null to clear.
  router.put("/api/component/:id/element-meta", asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { path, behavior, kind, css } = req.body || {};
    if (typeof path !== "string" || !path) {
      throw new HttpError(400, "path (string) is required");
    }
    if (behavior !== undefined && behavior !== null && (typeof behavior !== "object" || typeof behavior.type !== "string")) {
      throw new HttpError(400, "behavior must be an object with a type, or null");
    }
    if (kind !== undefined && kind !== null && !["text", "button", "link"].includes(kind)) {
      throw new HttpError(400, "kind must be 'text' | 'button' | 'link' | null");
    }
    if (css !== undefined && css !== null && (typeof css !== "object" || Array.isArray(css))) {
      throw new HttpError(400, "css must be an object of CSS property → value pairs, or null");
    }
    const ok = designService.setElementMeta(id, path, { behavior, kind, css } as never, "user");
    if (!ok) {
      throw new HttpError(404, `Component ${id} not found`);
    }
    res.json({ success: true, id, path, behavior: behavior ?? null, kind: kind ?? null, css: css ?? null });
  }));

  // API: Move the array item backing an inner element before/after another
  // item of the same props array (内部元素拖拽排序, DESIGN.md v1.1 §5.2).
  router.post("/api/component/:id/element/:path/move", asyncHandler(async (req, res) => {
    const { id, path } = req.params;
    const { position, target_path } = req.body || {};
    if (position !== "before" && position !== "after") {
      throw new HttpError(400, "position must be 'before' or 'after'");
    }
    if (typeof target_path !== "string" || !target_path) {
      throw new HttpError(400, "target_path (string) is required");
    }
    const ok = stateStore.moveArrayItem(id, path, position, target_path, "user");
    if (!ok) {
      throw new HttpError(400, "Move failed: paths must share the same props array");
    }
    res.json({ success: true, id, path, position, target_path });
  }));

    // API: Promote a selected inner element to an independent child component
    // (DESIGN.md v1.1 §5.2). Optional body: { type?: string }
    router.post("/api/component/:id/element/:path/promote", asyncHandler(async (req, res) => {
      const { id, path } = req.params;
      if (!path) {
        throw new HttpError(400, "path is required");
      }
      const child = stateStore.promoteElementToComponent(id, path, (req.body || {}).type, "user");
      if (!child) {
        throw new HttpError(404, `Component ${id} or element path not found`);
      }
      res.json({ success: true, id, path, child_id: child.id, child_type: child.type });
    }));


  // API: Set or clear the page-level background (背景编辑 P1):
  // body: { background: { type, value, animation?, params? } | null }
  router.put("/api/page-background", asyncHandler(async (req, res) => {
    const background = (req.body || {}).background;
    if (background !== null && (typeof background !== "object" || typeof background.type !== "string" || typeof background.value !== "string")) {
      throw new HttpError(400, "background must be an object with type + value, or null");
    }
    const ok = designService.setPageBackground(background as never, "user");
    if (!ok) {
      throw new HttpError(500, "page background update failed");
    }
    res.json({ success: true, background: background || null });
  }));

  // API: Get the current page background
  router.get("/api/page-background", asyncHandler(async (_req, res) => {
    res.json({ success: true, background: stateStore.getPageBackground() });
  }));

  // API: Align / distribute multiple components (精确编辑 P0, freeform)
  router.post("/api/align", asyncHandler(async (req, res) => {
    const { ids, mode } = req.body || {};
    if (!Array.isArray(ids) || ids.length < 2 || typeof mode !== "string") {
      throw new HttpError(400, "ids (array ≥ 2) and mode are required");
    }
    const ok = designService.alignComponents(
      ids.filter((x) => typeof x === "string"),
      mode as never,
      "user"
    );
    if (!ok) {
      throw new HttpError(400, `Align failed: unknown mode "${mode}" or invalid components`);
    }
    res.json({ success: true, ids, mode });
  }));

  // API: Reorder stacking (精确编辑 P0: front/back/forward/backward)
  router.post("/api/component/:id/z-order", asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { mode } = req.body || {};
    const ok = designService.zOrderComponent(id, mode, "user");
    if (!ok) {
      throw new HttpError(400, `Z-order failed: unknown mode "${mode}" or component not found`);
    }
    res.json({ success: true, id, mode });
  }));

  // API: Reparent a component (组件任意组合 P2): move it into another
  // component as a child, or back to the top level when parent_id is null.
  router.post("/api/component/:id/reparent", asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { parent_id } = req.body || {};
    if (parent_id !== null && typeof parent_id !== "string") {
      throw new HttpError(400, "parent_id must be a component id string or null");
    }
    const ok = stateStore.reparentComponent(id, parent_id || null, "user");
    if (!ok) {
      throw new HttpError(400, `Reparent failed: ${id} → ${parent_id || "top-level"} (missing ids or invalid nesting)`);
    }
    res.json({ success: true, id, parent_id: parent_id || null });
  }));

  // API: Group 2+ top-level components into a container (成组 P2)
  router.post("/api/components/group", asyncHandler(async (req, res) => {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length < 2 || !ids.every((x) => typeof x === "string")) {
      throw new HttpError(400, "ids must be an array of ≥ 2 component id strings");
    }
    const group = stateStore.groupComponents(ids, "user");
    if (!group) {
      throw new HttpError(400, "Group failed: need ≥ 2 top-level components on the current page");
    }
    res.json({ success: true, group_id: group.id, count: ids.length });
  }));

  // API: Ungroup a container (解组 P2): children return to the top level.
  router.post("/api/component/:id/ungroup", asyncHandler(async (req, res) => {
    const { id } = req.params;
    const ok = stateStore.ungroupComponents(id, "user");
    if (!ok) {
      throw new HttpError(404, `Ungroup failed: group ${id} not found`);
    }
    res.json({ success: true, id });
  }));

  // API: Undo
  router.post("/api/undo", asyncHandler(async (_req, res) => {
    const success = designService.undo();
    res.json({ success, canUndo: stateStore.canUndo(), canRedo: stateStore.canRedo() });
  }));

  // API: Redo
  router.post("/api/redo", asyncHandler(async (_req, res) => {
    const success = designService.redo();
    res.json({ success, canUndo: stateStore.canUndo(), canRedo: stateStore.canRedo() });
  }));

  // API: Add page
  router.post("/api/page", asyncHandler(async (req, res) => {
    const { name } = req.body;
    if (!name) {
      throw new HttpError(400, "Missing page name");
    }
    const page = designService.addPage(name, "user");
    res.json({ success: true, page_id: page.id, name: page.name });
  }));

  // API: Switch page
  router.post("/api/page/:id/switch", asyncHandler(async (req, res) => {
    const { id } = req.params;
    const success = designService.switchPage(id, "user");
    res.json({ success });
  }));

  // API: Remove page
  router.delete("/api/page/:id", asyncHandler(async (req, res) => {
    const { id } = req.params;
    const success = designService.removePage(id, "user");
    res.json({ success });
  }));

  // API: Rename page
  router.post("/api/page/:id/rename", asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    if (!name) {
      throw new HttpError(400, "Missing page name");
    }
    const success = designService.renamePage(id, name, "user");
    res.json({ success });
  }));

  // API: Add component to canvas (mirrors design_add_component MCP tool)
  router.post("/api/component", asyncHandler(async (req, res) => {
    const { type, variant, props, parent_id } = req.body;
    if (!type) {
      throw new HttpError(400, "Missing component type");
    }
    const node = designService.addComponent(type, variant, props || {}, parent_id || null, "ai");
    res.json({ success: true, id: node.id, type: node.type });
  }));

  // API: V2.0 多断点编辑 — set the desktop base style of a component
  router.post("/api/component/:id/base-style", asyncHandler(async (req, res) => {
    const { style } = req.body || {};
    assertStyleObject(style);
    const ok = stateStore.setBaseStyle(req.params.id, style, "user");
    if (!ok) throw new HttpError(404, `Component ${req.params.id} not found`);
    res.json({ success: true, id: req.params.id });
  }));

  // API: V2.0 多断点编辑 — set a breakpoint's diff style (tablet / mobile only)
  router.post("/api/component/:id/breakpoint-style", asyncHandler(async (req, res) => {
    const { breakpoint, style } = req.body || {};
    if (!isBreakpoint(String(breakpoint || "")) || breakpoint === "desktop") {
      throw new HttpError(400, "breakpoint must be tablet or mobile");
    }
    assertStyleObject(style);
    const ok = stateStore.setBreakpointOverride(req.params.id, breakpoint, style, "user");
    if (!ok) throw new HttpError(404, `Component ${req.params.id} not found`);
    res.json({ success: true, id: req.params.id, breakpoint });
  }));

  // API: V2.0 时间线 — append a timeline animation block to a component.
  // Body is validated + whitelisted: trackId/preset (non-empty strings),
  // startTime/duration (numbers >= 0, defaulting to 0/600), plus optional
  // engine ('css' | 'gsap'), params (object) and id; extra fields are dropped.
  router.post("/api/component/:id/animation", asyncHandler(async (req, res) => {
    const { id } = req.params;
    const body: Record<string, unknown> = req.body || {};
    const { trackId, preset, startTime, duration, engine, params } = body;
    if (typeof trackId !== "string" || !trackId) {
      throw new HttpError(400, "trackId must be a non-empty string");
    }
    if (typeof preset !== "string" || !preset) {
      throw new HttpError(400, "preset must be a non-empty string");
    }
    const start = startTime === undefined ? 0 : startTime;
    const ms = duration === undefined ? 600 : duration;
    if (typeof start !== "number" || !Number.isFinite(start) || start < 0) {
      throw new HttpError(400, "startTime must be a number >= 0");
    }
    if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) {
      throw new HttpError(400, "duration must be a number >= 0");
    }
    if (engine !== undefined && engine !== null && engine !== "css" && engine !== "gsap") {
      throw new HttpError(400, "engine must be 'css' or 'gsap'");
    }
    if (params !== undefined && params !== null && (typeof params !== "object" || Array.isArray(params))) {
      throw new HttpError(400, "params must be an object");
    }
    const anim = stateStore.addTimelineAnimation(
      id,
      {
        trackId,
        preset,
        startTime: start,
        duration: ms,
        ...(typeof body.id === "string" && body.id ? { id: body.id } : {}),
        ...(engine === "css" || engine === "gsap" ? { engine } : {}),
        ...(params && typeof params === "object" && !Array.isArray(params)
          ? { params: params as Record<string, number | string | boolean> }
          : {}),
      },
      "user"
    );
    if (!anim) throw new HttpError(404, `Component ${id} not found`);
    res.json({ success: true, animation: anim });
  }));

  // API: Add a review comment
  router.post("/api/comment", asyncHandler(async (req, res) => {
    const { component_id, text, author, x, y, assignee } = req.body || {};
    if (!component_id || !text) {
      throw new HttpError(400, "Missing component_id or text");
    }
    const options: { x?: number; y?: number; assignee?: string } = {};
    if (typeof x === "number" && Number.isFinite(x)) options.x = x;
    if (typeof y === "number" && Number.isFinite(y)) options.y = y;
    if (typeof assignee === "string" && assignee) options.assignee = assignee;
    const comment = stateStore.addComment(component_id, String(text), typeof author === "string" ? author : "user", "user", options);
    res.json({ success: true, comment });
  }));

  // M3 打点评论: 更新评论（resolved/assignee/text）
  router.post("/api/comment/:id", asyncHandler(async (req, res) => {
    const { text, resolved, assignee } = req.body || {};
    const patch: { text?: string; resolved?: boolean; assignee?: string | null } = {};
    if (typeof text === "string" && text.trim()) patch.text = text;
    if (typeof resolved === "boolean") patch.resolved = resolved;
    if (assignee === null || typeof assignee === "string") patch.assignee = assignee;
    if (patch.text === undefined && patch.resolved === undefined && patch.assignee === undefined) {
      throw new HttpError(400, "Nothing to update: provide text, resolved and/or assignee");
    }
    const updated = stateStore.updateComment(req.params.id, patch, "user");
    if (!updated) throw new HttpError(404, `Comment ${req.params.id} not found`);
    res.json({ success: true, comment: updated });
  }));

  // API: List comments (optionally filtered by component)
  router.get("/api/comments", asyncHandler(async (req, res) => {
    const componentId = typeof req.query.component_id === "string" ? req.query.component_id : undefined;
    const all = stateStore.getState().comments;
    const comments = componentId ? all.filter((c) => c.component_id === componentId) : all;
    res.json({ success: true, count: comments.length, comments });
  }));

  // API: Remove a comment
  router.delete("/api/comment/:id", asyncHandler(async (req, res) => {
    const ok = stateStore.removeComment(req.params.id, "user");
    if (!ok) {
      throw new HttpError(404, `Comment ${req.params.id} not found`);
    }
    res.json({ success: true, comment_id: req.params.id });
  }));

  // API: List play-mode page links
  router.get("/api/page-links", asyncHandler(async (_req, res) => {
    res.json({ success: true, links: stateStore.getState().pageLinks });
  }));

  // API: Create a play-mode page link (click a component -> jump to another page)
  router.post("/api/page-links", asyncHandler(async (req, res) => {
    const { from_page_id, to_page_id, label, source_component_id, transition } = req.body || {};
    if (!from_page_id || !to_page_id || typeof from_page_id !== "string" || typeof to_page_id !== "string") {
      throw new HttpError(400, "Missing from_page_id or to_page_id");
    }
    // M4 转场: optional enter animation of the target page (fade / slide-* / expand / none).
    if (transition !== undefined && (typeof transition !== "string" || !isPageLinkTransition(transition))) {
      throw new HttpError(400, `Invalid transition: ${String(transition)}`);
    }
    let link: ReturnType<typeof stateStore.addPageLink>;
    try {
      link = stateStore.addPageLink(
        from_page_id,
        to_page_id,
        typeof label === "string" ? label : undefined,
        typeof source_component_id === "string" ? source_component_id : undefined,
        "user",
        typeof transition === "string" ? transition : undefined
      );
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : String(error));
    }
    res.json({ success: true, link });
  }));

  // API: Update a play-mode page link (transition / label)
  router.post("/api/page-links/:id", asyncHandler(async (req, res) => {
    const { label, transition } = req.body || {};
    if (transition !== undefined && (typeof transition !== "string" || !isPageLinkTransition(transition))) {
      throw new HttpError(400, `Invalid transition: ${String(transition)}`);
    }
    const patch: { label?: string; transition?: string } = {};
    if (typeof label === "string" && label.trim()) patch.label = label;
    if (typeof transition === "string") patch.transition = transition;
    let updated: ReturnType<typeof stateStore.updatePageLink>;
    try {
      updated = stateStore.updatePageLink(req.params.id, patch, "user");
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : String(error));
    }
    if (!updated) {
      throw new HttpError(404, `Page link ${req.params.id} not found`);
    }
    res.json({ success: true, link: updated });
  }));

  // API: Remove a play-mode page link
  router.delete("/api/page-links/:id", asyncHandler(async (req, res) => {
    const ok = stateStore.removePageLink(req.params.id, "user");
    if (!ok) {
      throw new HttpError(404, `Page link ${req.params.id} not found`);
    }
    res.json({ success: true, link_id: req.params.id });
  }));

  // ===== R1 M2 修正记忆: 页面布局约束 =====

  // API: List page constraints (default: current page)
  router.get("/api/page-constraints", asyncHandler(async (req, res) => {
    const state = stateStore.getState();
    const pageId =
      typeof req.query.page_id === "string" && req.query.page_id
        ? req.query.page_id
        : state.currentPageId;
    const page = state.pages.find((p) => p.id === pageId);
    if (!page) {
      throw new HttpError(404, `Page ${pageId} not found`);
    }
    res.json({ success: true, page_id: page.id, constraints: page.constraints || [] });
  }));

  // API: Record the current layout of a component as a page constraint
  router.post("/api/page-constraints", asyncHandler(async (req, res) => {
    const { component_id } = req.body || {};
    if (!component_id || typeof component_id !== "string") {
      throw new HttpError(400, "Missing component_id");
    }
    const constraint = stateStore.addPageConstraint(component_id, "user");
    if (!constraint) {
      throw new HttpError(400, `组件 ${component_id} 不存在或没有布局（流式子项不能记约束）`);
    }
    res.json({ success: true, constraint });
  }));

  // API: Remove a page constraint
  router.delete("/api/page-constraints/:id", asyncHandler(async (req, res) => {
    const ok = stateStore.removePageConstraint(req.params.id, "user");
    if (!ok) {
      throw new HttpError(404, `Page constraint ${req.params.id} not found`);
    }
    res.json({ success: true, constraint_id: req.params.id });
  }));

  // M2 盒子模式: 更新组件盒子配置
  router.post("/api/component/:id/box-mode", asyncHandler(async (req, res) => {
    const { enabled, internalConfig } = req.body || {};
    const patch: { enabled?: boolean; internalConfig?: Record<string, unknown> } = {};
    if (typeof enabled === "boolean") patch.enabled = enabled;
    if (internalConfig !== undefined) {
      if (!internalConfig || typeof internalConfig !== "object" || Array.isArray(internalConfig)) {
        throw new HttpError(400, "internalConfig must be an object");
      }
      patch.internalConfig = internalConfig as Record<string, unknown>;
    }
    if (patch.enabled === undefined && patch.internalConfig === undefined) {
      throw new HttpError(400, "Nothing to update: provide enabled and/or internalConfig");
    }
    const ok = stateStore.setBoxMode(req.params.id, patch, "user");
    if (!ok) throw new HttpError(404, `Component ${req.params.id} not found`);
    res.json({ success: true, id: req.params.id });
  }));

  return router;
}
