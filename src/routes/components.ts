import express from "express";
import { stateStore, type ComponentNode } from "../state.js";
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

  // API: Add a review comment
  router.post("/api/comment", asyncHandler(async (req, res) => {
    const { component_id, text, author } = req.body || {};
    if (!component_id || !text) {
      throw new HttpError(400, "Missing component_id or text");
    }
    const comment = stateStore.addComment(component_id, String(text), typeof author === "string" ? author : "user", "user");
    res.json({ success: true, comment });
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
    const { from_page_id, to_page_id, label, source_component_id } = req.body || {};
    if (!from_page_id || !to_page_id || typeof from_page_id !== "string" || typeof to_page_id !== "string") {
      throw new HttpError(400, "Missing from_page_id or to_page_id");
    }
    let link: ReturnType<typeof stateStore.addPageLink>;
    try {
      link = stateStore.addPageLink(
        from_page_id,
        to_page_id,
        typeof label === "string" ? label : undefined,
        typeof source_component_id === "string" ? source_component_id : undefined,
        "user"
      );
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : String(error));
    }
    res.json({ success: true, link });
  }));

  // API: Remove a play-mode page link
  router.delete("/api/page-links/:id", asyncHandler(async (req, res) => {
    const ok = stateStore.removePageLink(req.params.id, "user");
    if (!ok) {
      throw new HttpError(404, `Page link ${req.params.id} not found`);
    }
    res.json({ success: true, link_id: req.params.id });
  }));

  return router;
}
